import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, parseBody, ApiError, rateLimit, clientKey } from "@/lib/api-helpers";
import { aiClassifySchema } from "@/lib/validation";
import { getActiveProvider, getMockProvider, providerHealth } from "@/lib/ai";
import { CLASSIFICATION_VERSION, type ClassificationOutput } from "@/lib/ai/provider";
import { startModelRun, finishModelRun, audit } from "@/lib/json";
import { getRainfallContext, getNearbyAssets, getHistoricalContext } from "@/lib/engine/enrich";
import { findDuplicateCandidates } from "@/lib/engine/duplicate";
import { fromJson, toJson } from "@/lib/json";

export const dynamic = "force-dynamic";

// POST /api/ai/classify - structured classification of a stored report or free
// text. Returns schema-validated output + provenance. Falls back honestly.
export const POST = handler(async (req: NextRequest) => {
  rateLimit(clientKey(req, "ai-classify"), 30, 60_000);
  const body = await parseBody(req, aiClassifySchema);

  let description: string;
  let severityReported: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  let categoryReported = "WATERLOGGING";
  let lat: number;
  let lng: number;
  let addressText: string | null = null;
  let reportId: string | null = null;

  if (body.reportId) {
    const report = await db.citizenReport.findUnique({ where: { id: body.reportId } });
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
    await db.citizenReport.update({
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
});
