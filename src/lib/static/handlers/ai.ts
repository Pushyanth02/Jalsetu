import { mdb } from "../db";
import { ok, parseBody, ApiError, rateLimit, type HandlerResult } from "../envelope";
import { aiClassifySchema, clusterSchema, aiRiskSchema } from "@/lib/validation";
import { getActiveProvider, getMockProvider, providerHealth } from "../ai";
import { CLASSIFICATION_VERSION, RISK_VERSION, CLUSTER_VERSION, type ClassificationOutput } from "@/lib/ai/provider";
import { startModelRun, finishModelRun, audit, fromJson, toJson } from "../instrument";
import { getRainfallContext, getNearbyAssets, getHistoricalContext } from "../engine/enrich";
import { findDuplicateCandidates, clusterByProximity } from "../engine/duplicate";
import { computeRisk, RISK_ENGINE_VERSION } from "../engine/risk";
import type { HandlerCtx, RouteDef } from "../router";

// Ports of the former AI investigation routes for the in-browser API:
//   POST /api/ai/classify (src/app/api/ai/classify/route.ts)
//   POST /api/ai/cluster  (src/app/api/ai/cluster/route.ts)
//   POST /api/ai/risk     (src/app/api/ai/risk/route.ts)
// Static mode has no server AI: getActiveProvider() (../ai) always returns the
// deterministic MockProvider, so the GLM-try / deterministic-fallback structure
// below is preserved verbatim and the honest labels stay truthful - the
// provider is reported as "MOCK" with its deterministic model id, and the
// fallback book-keeping (fallbackUsed / fallbackReason / FAILED model runs)
// remains intact should a provider ever fail. Rate-limit keys mirror the
// server's clientKey scopes with the local client ip.

// POST /api/ai/classify - structured classification of a stored report or free
// text. Returns schema-validated output + provenance. Falls back honestly.
export async function aiClassify(ctx: HandlerCtx): Promise<HandlerResult> {
  rateLimit("ai-classify:local", 30, 60_000);
  const body = parseBody(ctx.body, aiClassifySchema);

  let description: string;
  let severityReported: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  let categoryReported = "WATERLOGGING";
  let lat: number;
  let lng: number;
  let addressText: string | null = null;
  let reportId: string | null = null;

  if (body.reportId) {
    const report = await mdb.citizenReport.findUnique({ where: { id: body.reportId } });
    if (!report) throw new ApiError(404, "NOT_FOUND", `Report ${body.reportId} not found`);
    description = report.description;
    severityReported = report.severityReported as typeof severityReported;
    categoryReported = report.category;
    lat = report.lat;
    lng = report.lng;
    addressText = report.addressText;
    reportId = report.id;
  } else {
    description = body.description!;
    severityReported = body.severityReported!;
    lat = body.lat ?? 28.61;
    lng = body.lng ?? 77.21;
  }

  const point = { lat, lng };
  const [rain, assets, history, health] = await Promise.all([
    getRainfallContext(point),
    getNearbyAssets(point, 250),
    getHistoricalContext(point, 200),
    providerHealth(),
  ]);

  // duplicate signal for context
  const dups = await findDuplicateCandidates({ lat, lng, category: categoryReported, at: new Date() });

  const input = {
    description,
    severityReported,
    categoryReported: categoryReported as "WATERLOGGING",
    lat,
    lng,
    addressText,
    context: {
      rainfall24hMm: rain.rainfall24hMm,
      nearbyDrainCondition: assets.find((a) => a.kind === "DRAIN")?.conditionScore ?? null,
      nearbyOpenEvents: dups.length,
      historicalIncidentsNearby: history.count,
    },
  };

  const runId = await startModelRun({
    modelId: "classify",
    version: CLASSIFICATION_VERSION,
    provider: "AUTO",
    inputCount: 1,
    notes: reportId ? `report ${reportId}` : "ad-hoc text",
  });

  let result: { output: ClassificationOutput; provider: string; modelId: string; latencyMs: number };
  let fallbackUsed = false;
  let fallbackReason: string | null = null;
  try {
    const provider = await getActiveProvider();
    const r = await provider.classify(input);
    result = { output: r.output, provider: r.provider, modelId: r.modelId, latencyMs: r.latencyMs };
  } catch (err) {
    fallbackUsed = true;
    fallbackReason = err instanceof Error ? err.message : String(err);
    const r = await getMockProvider().classify(input);
    result = { output: r.output, provider: r.provider, modelId: r.modelId, latencyMs: r.latencyMs };
  }

  await finishModelRun(runId, {
    status: fallbackUsed ? "FAILED" : "SUCCEEDED",
    outputCount: 1,
    latencyMs: result.latencyMs,
    error: fallbackReason ?? undefined,
    notes: fallbackUsed ? "fell back to deterministic provider (recorded)" : `provider=${result.provider}`,
  });

  // persist classification on the report
  if (reportId) {
    await mdb.citizenReport.update({
      where: { id: reportId },
      data: {
        classificationJson: toJson(result.output),
        classificationProvider: result.provider,
        classificationModel: result.modelId,
        classificationConfidence: result.output.confidence,
      },
    });
  }

  await audit({
    actor: "SYSTEM",
    action: "CLASSIFIED",
    entityType: reportId ? "CitizenReport" : "AdHocText",
    entityId: reportId ?? "adhoc",
    after: { provider: result.provider, confidence: result.output.confidence, fallbackUsed },
  });

  return ok({
    classification: result.output,
    provenance: {
      provider: result.provider,
      modelId: result.modelId,
      latencyMs: result.latencyMs,
      fallbackUsed,
      fallbackReason,
      providerHealth: health,
      version: CLASSIFICATION_VERSION,
    },
    context: {
      rainfall24hMm: rain.rainfall24hMm,
      rainfall72hMm: rain.rainfall72hMm,
      nearestStation: rain.nearestStation,
      historicalIncidentsNearby: history.count,
      nearestAssets: assets.slice(0, 3).map((a) => ({ code: a.code, kind: a.kind, distanceM: a.distanceM, condition: a.conditionScore })),
      nearbyOpenEvents: dups.length,
    },
    duplicateSignals: dups.slice(0, 3).map((d) => ({ code: d.code, distanceM: d.distanceM, hoursApart: d.hoursApart, recurrence: d.isRecurrence, reason: d.reason })),
  });
}

// POST /api/ai/cluster - deterministic proximity clustering of reports
// (duplicate detection investigation). Explainable, no black box.
export async function aiCluster(ctx: HandlerCtx): Promise<HandlerResult> {
  rateLimit("ai-cluster:local", 20, 60_000);
  const body = parseBody(ctx.body, clusterSchema);

  const reports = body.reportIds
    ? await mdb.citizenReport.findMany({ where: { id: { in: body.reportIds } } })
    : await mdb.citizenReport.findMany({ where: { submittedAt: { gte: new Date(Date.now() - 72 * 3600_000) } } });

  const runId = await startModelRun({
    modelId: "cluster",
    version: CLUSTER_VERSION,
    provider: "RULE",
    inputCount: reports.length,
    notes: `radius ${body.radiusM}m`,
  });

  const { clusters, singletons } = clusterByProximity(
    reports.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, publicRef: r.publicRef, category: r.category, severityReported: r.severityReported, description: r.description.slice(0, 90), submittedAt: r.submittedAt.toISOString(), urbanEventId: r.urbanEventId })),
    body.radiusM
  );

  await finishModelRun(runId, { status: "SUCCEEDED", outputCount: clusters.length, latencyMs: 0, notes: `${clusters.length} clusters, ${singletons.length} singletons` });
  await audit({ actor: "SYSTEM", action: "CLUSTERED", entityType: "CitizenReport", entityId: "batch", after: { clusters: clusters.length, radiusM: body.radiusM } });

  return ok(
    {
      clusters: clusters.map((c, i) => ({
        id: `CL-${String(i + 1).padStart(3, "0")}`,
        centroid: c.centroid,
        size: c.members.length,
        members: c.members,
        spatialDiameterM: Math.round(
          Math.max(...c.members.flatMap((m) => c.members.map((n) => haversine(m, n))))
        ),
      })),
      singletons: singletons.length,
    },
    {
      method: `union-find proximity clustering, radius ${body.radiusM}m`,
      version: CLUSTER_VERSION,
      evaluated: reports.length,
    }
  );
}

// POST /api/ai/risk - full risk assessment for an event: transparent factor
// model + structured AI advisory (never chain-of-thought).
export async function aiRisk(ctx: HandlerCtx): Promise<HandlerResult> {
  rateLimit("ai-risk:local", 20, 60_000);
  // body.provider ("GLM" | "MOCK" | "RULE") is validated but not consulted -
  // exactly as in the source route. In static mode getActiveProvider() below
  // is the deterministic mock, so a "GLM" request maps to the mock and the
  // provider label stays truthful ("MOCK").
  const body = parseBody(ctx.body, aiRiskSchema);

  const event = await mdb.urbanEvent.findFirst({ where: { OR: [{ id: body.eventId }, { code: body.eventId }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${body.eventId} not found`);

  const point = { lat: event.lat, lng: event.lng };
  const [rain, assets, history, health] = await Promise.all([
    getRainfallContext(point),
    getNearbyAssets(point, 250),
    getHistoricalContext(point, 200),
    providerHealth(),
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

  const advisoryInput = {
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
  };

  const runId = await startModelRun({
    modelId: "risk",
    version: RISK_VERSION,
    provider: "AUTO",
    inputCount: 1,
    notes: `event ${event.code}`,
  });

  let advisory: { output: unknown; provider: string; modelId: string; fallbackUsed: boolean; error: string | null };
  try {
    const provider = await getActiveProvider();
    const r = await provider.riskAdvisory(advisoryInput);
    advisory = { output: r.output, provider: r.provider, modelId: r.modelId, fallbackUsed: false, error: null };
    await finishModelRun(runId, { status: "SUCCEEDED", outputCount: 1, latencyMs: r.latencyMs });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const r = await getMockProvider().riskAdvisory(advisoryInput);
    advisory = { output: r.output, provider: r.provider, modelId: r.modelId, fallbackUsed: true, error: reason };
    await finishModelRun(runId, { status: "FAILED", error: reason, notes: "fell back to deterministic provider (recorded)" });
  }

  // persist assessment + advisory evidence
  await mdb.riskAssessment.create({
    data: {
      eventId: event.id,
      score: risk.score,
      band: risk.band,
      factorsJson: toJson(risk.factors),
      modelVersion: RISK_ENGINE_VERSION,
      provider: "RULE",
      computedAt: new Date(), // prisma @default(now()) translated (static db has no schema defaults)
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
    },
  });
  await mdb.evidence.create({
    data: {
      urbanEventId: event.id,
      kind: "AI_OUTPUT",
      caption: "Risk advisory (structured model output)",
      content: JSON.stringify(advisory.output),
      mediaType: "text/plain",
      capturedBy: "AI",
      metadataJson: toJson({ provider: advisory.provider, modelId: advisory.modelId, fallbackUsed: advisory.fallbackUsed }),
      source: "MODEL_OUTPUT",
      capturedAt: new Date(), // prisma @default(now()) translated
      createdAt: new Date(), // prisma @default(now()) translated
    },
  });
  await audit({
    actor: "SYSTEM",
    action: "RISK_ASSESSED",
    entityType: "UrbanEvent",
    entityId: event.id,
    after: { score: risk.score, band: risk.band, advisoryProvider: advisory.provider },
  });

  return ok({
    event: { id: event.id, code: event.code, title: event.title },
    risk,
    advisory,
    provenance: {
      riskModelVersion: RISK_ENGINE_VERSION,
      advisoryProviderHealth: health,
    },
  });
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const aiRoutes: RouteDef[] = [
  { method: "POST", segments: ["ai", "classify"], handler: aiClassify },
  { method: "POST", segments: ["ai", "cluster"], handler: aiCluster },
  { method: "POST", segments: ["ai", "risk"], handler: aiRisk },
];
