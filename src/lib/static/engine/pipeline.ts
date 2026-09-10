import { mdb } from "../db";
import { getActiveProvider, getMockProvider } from "../ai";
import {
  CLASSIFICATION_VERSION,
  type ClassificationOutput,
  type ProviderResult,
} from "@/lib/ai/provider";
import { audit, finishModelRun, startModelRun, toJson } from "../instrument";
import type { ReportCreateInput } from "@/lib/validation";
import { numberToSeverity, severityToNumber, type Category, type Severity } from "@/lib/types";
import {
  getHistoricalContext,
  getNearbyAssets,
  getRainfallContext,
  resolveJurisdiction,
  type AssetWithContext,
} from "./enrich";
import { computeRisk, RISK_ENGINE_VERSION, type RiskResult } from "./risk";
import { applyResponsibility, resolveResponsibility } from "./responsibility";
import { findDuplicateCandidates, type DuplicateMatch } from "./duplicate";

// Port of src/lib/engine/pipeline.ts (read-only server reference) for the
// static deployment. Changes beyond the import swaps (db → mdb, @/lib/ai →
// ../ai, @/lib/json → ../instrument):
//   - prisma findUniqueOrThrow → local findEventOrThrow (same 500-on-missing
//     client outcome via the router's error envelope);
//   - prisma delete → mdb deleteMany;
//   - prisma schema @default(...) values are set explicitly on create (the
//     static db applies no schema defaults). Every added field is commented.
// getActiveProvider() in static mode always returns the deterministic
// MockProvider, so the GLM-then-fallback book-keeping below stays intact and
// the fallbackUsed / provider labels remain honest (provider "MOCK").
// Business logic is otherwise verbatim.

// THE Urban Event Engine pipeline:
// report ingestion → classification → duplicate detection → event create/update
// → enrichment (rainfall/GIS/history) → risk → responsibility → actions
// → audit trail. Every stage is logged and explainable.

export interface IngestOutcome {
  reportId: string;
  publicRef: string;
  eventId: string;
  eventCode: string;
  eventStatus: string;
  action: "EVENT_CREATED" | "ATTACHED_DUPLICATE" | "REOPENED_RECURRENCE";
  classification: {
    output: ClassificationOutput;
    provider: string;
    modelId: string;
    fallbackUsed: boolean;
    fallbackReason: string | null;
  };
  risk: RiskResult;
  routing: { links: { agencyCode: string; role: string; reason: string }[] };
  duplicateOf: DuplicateMatch | null;
}

function makePublicRef(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let ref = "";
  for (let i = 0; i < 5; i++) {
    ref += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `CR-${ref}`;
}

async function nextEventCode(): Promise<string> {
  const count = await mdb.urbanEvent.count();
  const year = new Date().getFullYear();
  return `UE-${year}-${String(count + 1).padStart(4, "0")}`;
}

/** prisma findUniqueOrThrow equivalent: throws (→ 500 INTERNAL) when missing. */
async function findEventOrThrow(idOrCode: string) {
  // Id-or-code resolution: the dossier deep-links use event codes
  // (UE-2026-xxxx) while internal flows pass ids. Resolving both keeps the
  // reassess/merge actions working from every entry point.
  const event = await mdb.urbanEvent.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
  });
  if (!event) throw new Error(`Event ${idOrCode} not found`);
  return event;
}

function titleFor(category: string, locationText: string): string {
  const pretty = category
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `${pretty} near ${locationText}`;
}

function locationTextFrom(
  jurisdictionName: string | null,
  nearestAsset: AssetWithContext | null
): string {
  if (nearestAsset) return `${nearestAsset.name} (${jurisdictionName ?? "pilot area"})`;
  return jurisdictionName ?? "Delhi pilot area";
}

/** Hash phone at rest (privacy: minimum necessary personal data). */
function hashPhone(phone: string): string {
  let h = 5381;
  for (let i = 0; i < phone.length; i++) h = ((h << 5) + h + phone.charCodeAt(i)) | 0;
  return `sha:${(h >>> 0).toString(16)}`;
}

export async function ingestReport(
  input: ReportCreateInput,
  actor: string,
  opts: { at?: Date; forceMockProvider?: boolean; source?: string } = {}
): Promise<IngestOutcome> {
  const at = opts.at ?? new Date();
  const point = { lat: input.lat, lng: input.lng };

  // 1) persist the report first (evidence-first: never lose citizen input)
  const report = await mdb.citizenReport.create({
    data: {
      publicRef: makePublicRef(),
      description: input.description,
      category: input.category,
      severityReported: input.severityReported,
      lat: input.lat,
      lng: input.lng,
      addressText: input.addressText ?? null,
      submittedAt: at,
      channel: input.channel,
      reporterPhone: input.reporterPhone ? hashPhone(input.reporterPhone) : null,
      consentGiven: input.consentGiven,
      status: "RECEIVED",
      source: opts.source ?? "WEB_FORM",
      isDuplicate: false, // prisma @default(false) translated
      createdAt: new Date(), // prisma @default(now()) translated
    },
  });
  await audit({ actor, action: "REPORT_INGESTED", entityType: "CitizenReport", entityId: report.id, after: { publicRef: report.publicRef } });

  if (input.photoDataUrl) {
    await mdb.evidence.create({
      data: {
        reportId: report.id,
        kind: "CITIZEN_PHOTO",
        caption: input.photoCaption ?? "Citizen-submitted photo",
        content: input.photoDataUrl,
        mediaType: input.photoDataUrl.slice(5, input.photoDataUrl.indexOf(";")) || "image/*",
        capturedAt: at,
        capturedBy: "CITIZEN",
        lat: input.lat,
        lng: input.lng,
        source: opts.source ?? "WEB_FORM",
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
  }

  // 2) enrichment context for classification
  const [rain, assets, history, jurisdiction] = await Promise.all([
    getRainfallContext(point),
    getNearbyAssets(point, 250),
    getHistoricalContext(point, 200),
    resolveJurisdiction(point),
  ]);

  // 3) classification via active provider (GLM if healthy, else deterministic)
  const runId = await startModelRun({
    modelId: "classify",
    version: CLASSIFICATION_VERSION,
    provider: opts.forceMockProvider ? "MOCK" : "AUTO",
    inputCount: 1,
    notes: `report ${report.publicRef}`,
  });
  let classification: ProviderResult<ClassificationOutput>;
  let fallbackUsed = false;
  let fallbackReason: string | null = null;
  try {
    if (opts.forceMockProvider) throw new Error("forced deterministic provider (seed/synthetic)");
    const provider = await getActiveProvider();
    classification = await provider.classify({
      description: input.description,
      severityReported: input.severityReported,
      categoryReported: input.category,
      lat: input.lat,
      lng: input.lng,
      addressText: input.addressText ?? null,
      context: {
        rainfall24hMm: rain.rainfall24hMm,
        nearbyDrainCondition: assets.find((a) => a.kind === "DRAIN")?.conditionScore ?? null,
        nearbyOpenEvents: 0,
        historicalIncidentsNearby: history.count,
      },
    });
    await finishModelRun(runId, {
      status: "SUCCEEDED",
      outputCount: 1,
      latencyMs: classification.latencyMs,
      notes: `provider=${classification.provider} model=${classification.modelId}`,
    });
  } catch (err) {
    // HONEST fallback: record the failure, switch to deterministic inference
    fallbackUsed = true;
    fallbackReason = err instanceof Error ? err.message : String(err);
    await finishModelRun(runId, {
      status: opts.forceMockProvider ? "SUCCEEDED" : "FAILED",
      error: opts.forceMockProvider ? undefined : fallbackReason,
      notes: opts.forceMockProvider
        ? "deterministic provider (seed/synthetic data generation)"
        : "GLM classify failed; deterministic fallback used (recorded, not hidden)",
    });
    classification = await getMockProvider().classify({
      description: input.description,
      severityReported: input.severityReported,
      categoryReported: input.category,
      lat: input.lat,
      lng: input.lng,
      addressText: input.addressText ?? null,
      context: {
        rainfall24hMm: rain.rainfall24hMm,
        nearbyDrainCondition: assets.find((a) => a.kind === "DRAIN")?.conditionScore ?? null,
        nearbyOpenEvents: 0,
        historicalIncidentsNearby: history.count,
      },
    });
  }

  await mdb.citizenReport.update({
    where: { id: report.id },
    data: {
      status: "TRIAGED",
      classificationJson: toJson(classification.output),
      classificationProvider: classification.provider,
      classificationModel: classification.modelId,
      classificationConfidence: classification.output.confidence,
    },
  });
  await audit({
    actor: "SYSTEM",
    action: "CLASSIFIED",
    entityType: "CitizenReport",
    entityId: report.id,
    after: { provider: classification.provider, model: classification.modelId, category: classification.output.category, severity: classification.output.severity, confidence: classification.output.confidence, fallbackUsed },
  });

  const finalCategory = classification.output.category as Category;
  const finalSeverity = classification.output.severity as Severity;

  // 4) duplicate detection
  const candidates = await findDuplicateCandidates({ ...point, category: finalCategory, at });
  const best = candidates[0] ?? null;

  let event;
  let action: IngestOutcome["action"];
  let risk: RiskResult;

  if (best && !best.isRecurrence) {
    // 4a) attach as duplicate → strengthen existing event
    event = await findEventOrThrow(best.eventId);
    const newCount = event.reportCount + 1;
    const newSeverity = Math.max(event.severity, severityToNumber(finalSeverity));
    event = await mdb.urbanEvent.update({
      where: { id: event.id },
      data: {
        reportCount: newCount,
        severity: newSeverity,
        lastActivityAt: at,
        status: event.status === "DETECTED" ? "TRIAGED" : event.status,
        confidence: Math.min(0.98, Math.max(event.confidence, classification.output.confidence)),
      },
    });
    action = "ATTACHED_DUPLICATE";
    await mdb.citizenReport.update({
      where: { id: report.id },
      data: { urbanEventId: event.id, isDuplicate: true, duplicateOfId: null, status: "MERGED" },
    });
    await audit({
      actor: "SYSTEM",
      action: "DUPLICATE_ATTACHED",
      entityType: "UrbanEvent",
      entityId: event.id,
      note: `report ${report.publicRef} attached: ${best.reason}`,
      after: { reportCount: newCount },
    });
  } else if (best && best.isRecurrence) {
    // 4b) recurrence of a closed event → reopen
    event = await findEventOrThrow(best.eventId);
    event = await mdb.urbanEvent.update({
      where: { id: event.id },
      data: {
        status: "REOPENED",
        reportCount: event.reportCount + 1,
        recurrenceCount: event.recurrenceCount + 1,
        lastActivityAt: at,
        reopenedAt: at,
        closedAt: null,
        severity: Math.max(event.severity, severityToNumber(finalSeverity)),
      },
    });
    action = "REOPENED_RECURRENCE";
    await mdb.citizenReport.update({
      where: { id: report.id },
      data: { urbanEventId: event.id, status: "MERGED" },
    });
    await audit({
      actor: "SYSTEM",
      action: "EVENT_REOPENED",
      entityType: "UrbanEvent",
      entityId: event.id,
      note: `recurrence via report ${report.publicRef}: ${best.reason}`,
    });
  } else {
    // 4c) new urban event
    const nearestAsset = assets[0] ?? null;
    const locText = locationTextFrom(jurisdiction?.name ?? null, nearestAsset);
    const code = await nextEventCode();
    event = await mdb.urbanEvent.create({
      data: {
        code,
        title: titleFor(finalCategory, locText),
        category: finalCategory,
        status: "TRIAGED",
        severity: severityToNumber(finalSeverity),
        lat: input.lat,
        lng: input.lng,
        locationText: locText,
        jurisdictionId: jurisdiction?.id ?? null,
        firstReportedAt: at,
        lastActivityAt: at,
        reportCount: 1,
        rainfall24hMm: rain.rainfall24hMm,
        rainfall72hMm: rain.rainfall72hMm,
        confidence: classification.output.confidence,
        classificationProvider: classification.provider,
        modelVersion: classification.modelId,
        source: opts.source ?? "WEB_FORM",
        // prisma schema @default(...) translated (static db has no defaults):
        recurrenceCount: 0,
        recurrenceWindowDays: 90,
        riskScore: 0,
        riskBand: "LOW",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    action = "EVENT_CREATED";
    await mdb.citizenReport.update({
      where: { id: report.id },
      data: { urbanEventId: event.id },
    });
    await audit({
      actor: "SYSTEM",
      action: "EVENT_CREATED",
      entityType: "UrbanEvent",
      entityId: event.id,
      after: { code, category: finalCategory, severity: finalSeverity },
    });
  }

  // 5) risk computation (transparent factor model)
  const drain = assets.find((a) => a.kind === "DRAIN" || a.kind === "OUTFALL" || a.kind === "CULVERT");
  risk = computeRisk({
    severity: event.severity,
    reportCount: event.reportCount,
    rainfall24hMm: rain.rainfall24hMm,
    rainfall72hMm: rain.rainfall72hMm,
    recurrenceCount: event.recurrenceCount,
    drainCondition: drain?.conditionScore ?? null,
    monthsSinceMaintenance: drain?.monthsSinceMaintenance ?? null,
    historicalIncidentsNearby: history.count,
  });
  await mdb.riskAssessment.create({
    data: {
      eventId: event.id,
      score: risk.score,
      band: risk.band,
      factorsJson: toJson(risk.factors),
      modelVersion: RISK_ENGINE_VERSION,
      provider: "RULE",
      computedAt: new Date(), // prisma @default(now()) translated
    },
  });
  event = await mdb.urbanEvent.update({
    where: { id: event.id },
    data: {
      riskScore: risk.score,
      riskBand: risk.band,
      riskFactorsJson: toJson(risk.factors),
      riskModelVersion: RISK_ENGINE_VERSION,
      riskAssessedAt: at,
      rainfall24hMm: rain.rainfall24hMm,
      rainfall72hMm: rain.rainfall72hMm,
    },
  });
  await audit({
    actor: "SYSTEM",
    action: "RISK_ASSESSED",
    entityType: "UrbanEvent",
    entityId: event.id,
    after: { score: risk.score, band: risk.band },
  });

  // 6) responsibility resolution
  const decision = resolveResponsibility({
    category: event.category,
    severity: event.severity,
    jurisdictionKind: jurisdiction?.kind ?? "WARD",
    jurisdictionCode: jurisdiction?.code ?? "PILOT",
    jurisdictionAgencyCode: jurisdiction?.agencyCode ?? null,
    assets,
    riskBand: risk.band,
  });
  await applyResponsibility(event.id, decision, "SYSTEM");
  await mdb.urbanEvent.update({
    where: { id: event.id },
    data: { agencyCode: decision.links[0]?.agencyCode ?? null },
  });

  return {
    reportId: report.id,
    publicRef: report.publicRef,
    eventId: event.id,
    eventCode: event.code,
    eventStatus: event.status,
    action,
    classification: {
      output: classification.output,
      provider: classification.provider,
      modelId: classification.modelId,
      fallbackUsed,
      fallbackReason,
    },
    risk,
    routing: { links: decision.links.map((l) => ({ agencyCode: l.agencyCode, role: l.role, reason: l.reason })) },
    duplicateOf: best,
  };
}

// --- reassessment -----------------------------------------------------------

export async function reassessEvent(eventId: string, actor: string, useProvider: boolean) {
  const event = await findEventOrThrow(eventId);
  const point = { lat: event.lat, lng: event.lng };
  const [rain, assets, history] = await Promise.all([
    getRainfallContext(point),
    getNearbyAssets(point, 250),
    getHistoricalContext(point, 200),
  ]);
  const drain = assets.find((a) => a.kind === "DRAIN" || a.kind === "OUTFALL" || a.kind === "CULVERT");

  const risk = computeRisk({
    severity: event.severity,
    reportCount: event.reportCount,
    rainfall24hMm: rain.rainfall24hMm,
    rainfall72hMm: rain.rainfall72hMm,
    recurrenceCount: event.recurrenceCount,
    drainCondition: drain?.conditionScore ?? null,
    monthsSinceMaintenance: drain?.monthsSinceMaintenance ?? null,
    historicalIncidentsNearby: history.count,
  });
  await mdb.riskAssessment.create({
    data: {
      eventId: event.id,
      score: risk.score,
      band: risk.band,
      factorsJson: toJson(risk.factors),
      modelVersion: RISK_ENGINE_VERSION,
      provider: "RULE",
      computedAt: new Date(), // prisma @default(now()) translated
    },
  });
  await mdb.urbanEvent.update({
    where: { id: event.id },
    data: {
      riskScore: risk.score,
      riskBand: risk.band,
      riskFactorsJson: toJson(risk.factors),
      riskModelVersion: RISK_ENGINE_VERSION,
      riskAssessedAt: new Date(),
      rainfall24hMm: rain.rainfall24hMm,
      rainfall72hMm: rain.rainfall72hMm,
      severity: Math.max(event.severity, severityToNumber(numberToSeverity(event.severity))),
    },
  });

  // optional AI advisory (structured, no chain-of-thought)
  let advisory: { output: unknown; provider: string; modelId: string; fallbackUsed: boolean; error: string | null } | null = null;
  if (useProvider) {
    const runId = await startModelRun({
      modelId: "risk",
      version: "risk-1.3-demo",
      provider: "AUTO",
      inputCount: 1,
      notes: `event ${event.code}`,
    });
    try {
      const provider = await getActiveProvider();
      const result = await provider.riskAdvisory({
        eventTitle: event.title,
        category: event.category,
        severity: event.severity,
        rainfall24hMm: rain.rainfall24hMm,
        rainfall72hMm: rain.rainfall72hMm,
        reportCount: event.reportCount,
        recurrenceCount: event.recurrenceCount,
        drainCondition: drain?.conditionScore ?? null,
        monthsSinceMaintenance: drain?.monthsSinceMaintenance ?? null,
        historicalIncidentsNearby: history.count,
      });
      await finishModelRun(runId, { status: "SUCCEEDED", outputCount: 1, latencyMs: result.latencyMs });
      advisory = { output: result.output, provider: result.provider, modelId: result.modelId, fallbackUsed: false, error: null };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await finishModelRun(runId, { status: "FAILED", error: reason, notes: "GLM risk advisory failed; deterministic fallback" });
      const fallback = await getMockProvider().riskAdvisory({
        eventTitle: event.title,
        category: event.category,
        severity: event.severity,
        rainfall24hMm: rain.rainfall24hMm,
        rainfall72hMm: rain.rainfall72hMm,
        reportCount: event.reportCount,
        recurrenceCount: event.recurrenceCount,
        drainCondition: drain?.conditionScore ?? null,
        monthsSinceMaintenance: drain?.monthsSinceMaintenance ?? null,
        historicalIncidentsNearby: history.count,
      });
      advisory = { output: fallback.output, provider: fallback.provider, modelId: fallback.modelId, fallbackUsed: true, error: reason };
    }
    await mdb.evidence.create({
      data: {
        urbanEventId: event.id,
        kind: "AI_OUTPUT",
        caption: "Risk advisory (structured model output)",
        content: JSON.stringify(advisory.output),
        mediaType: "text/plain",
        capturedBy: "AI",
        metadataJson: toJson({ provider: advisory.provider, modelId: advisory.modelId, fallbackUsed: advisory.fallbackUsed, error: advisory.error }),
        source: "MODEL_OUTPUT",
        capturedAt: new Date(), // prisma @default(now()) translated
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
  }

  await audit({ actor, action: "EVENT_REASSESSED", entityType: "UrbanEvent", entityId: event.id, after: { score: risk.score, band: risk.band, advisoryProvider: advisory?.provider ?? null } });
  return { event: await findEventOrThrow(eventId), risk, advisory };
}

// --- merge ------------------------------------------------------------------

export async function mergeEvents(primaryId: string, duplicateId: string, rationale: string, actor: string) {
  if (primaryId === duplicateId) throw new Error("Cannot merge an event into itself");
  const primary = await findEventOrThrow(primaryId);
  const duplicate = await findEventOrThrow(duplicateId);

  await mdb.citizenReport.updateMany({
    where: { urbanEventId: duplicateId },
    data: { urbanEventId: primaryId, isDuplicate: true, status: "MERGED" },
  });
  await mdb.evidence.updateMany({ where: { urbanEventId: duplicateId }, data: { urbanEventId: primaryId } });
  await mdb.actionItem.updateMany({ where: { eventId: duplicateId }, data: { eventId: primaryId } });
  await mdb.verification.updateMany({ where: { eventId: duplicateId }, data: { eventId: primaryId } });

  const merged = await mdb.urbanEvent.update({
    where: { id: primaryId },
    data: {
      reportCount: primary.reportCount + duplicate.reportCount,
      severity: Math.max(primary.severity, duplicate.severity),
      recurrenceCount: primary.recurrenceCount + duplicate.recurrenceCount,
      firstReportedAt: primary.firstReportedAt < duplicate.firstReportedAt ? primary.firstReportedAt : duplicate.firstReportedAt,
      lastActivityAt: new Date(),
    },
  });
  await mdb.urbanEvent.deleteMany({ where: { id: duplicateId } }); // prisma delete → mdb deleteMany
  await audit({
    actor,
    action: "EVENTS_MERGED",
    entityType: "UrbanEvent",
    entityId: primaryId,
    before: { duplicateCode: duplicate.code, duplicateId },
    after: { reportCount: merged.reportCount },
    note: rationale,
  });
  return merged;
}
