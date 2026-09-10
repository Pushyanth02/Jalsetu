import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, parseBody, ApiError, rateLimit, clientKey } from "@/lib/api-helpers";
import { aiRiskSchema } from "@/lib/validation";
import { getActiveProvider, getMockProvider, providerHealth } from "@/lib/ai";
import { RISK_VERSION } from "@/lib/ai/provider";
import { startModelRun, finishModelRun, audit, toJson } from "@/lib/json";
import { getRainfallContext, getNearbyAssets, getHistoricalContext } from "@/lib/engine/enrich";
import { computeRisk, RISK_ENGINE_VERSION } from "@/lib/engine/risk";

export const dynamic = "force-dynamic";

// POST /api/ai/risk - full risk assessment for an event: transparent factor
// model + structured AI advisory (never chain-of-thought).
export const POST = handler(async (req: NextRequest) => {
  rateLimit(clientKey(req, "ai-risk"), 20, 60_000);
  const body = await parseBody(req, aiRiskSchema);

  const event = await db.urbanEvent.findFirst({ where: { OR: [{ id: body.eventId }, { code: body.eventId }] } });
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
  await db.riskAssessment.create({
    data: {
      eventId: event.id,
      score: risk.score,
      band: risk.band,
      factorsJson: toJson(risk.factors),
      modelVersion: RISK_ENGINE_VERSION,
      provider: "RULE",
    },
  });
  await db.urbanEvent.update({
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
  await db.evidence.create({
    data: {
      urbanEventId: event.id,
      kind: "AI_OUTPUT",
      caption: "Risk advisory (structured model output)",
      content: JSON.stringify(advisory.output),
      mediaType: "text/plain",
      capturedBy: "AI",
      metadataJson: toJson({ provider: advisory.provider, modelId: advisory.modelId, fallbackUsed: advisory.fallbackUsed }),
      source: "MODEL_OUTPUT",
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
});
