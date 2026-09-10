import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api-helpers";
import { providerHealth } from "@/lib/ai";

export const dynamic = "force-dynamic";

// GET /api/model-health - model versions, runs, confidence distribution.
export const GET = handler(async () => {
  const [health, runs, classifications] = await Promise.all([
    providerHealth(),
    db.modelRun.findMany({ orderBy: { startedAt: "desc" }, take: 25 }),
    db.citizenReport.findMany({
      where: { classificationConfidence: { not: null } },
      select: { classificationConfidence: true, classificationProvider: true },
    }),
  ]);

  const confidence = classifications.map((c) => c.classificationConfidence!);
  const buckets = [0, 0.2, 0.4, 0.6, 0.8].map((lo) => ({
    range: `${lo.toFixed(1)}-${(lo + 0.2).toFixed(1)}`,
    count: confidence.filter((c) => c >= lo && c < lo + 0.2).length,
  }));
  const providerCounts = classifications.reduce<Record<string, number>>((acc, c) => {
    acc[c.classificationProvider ?? "unknown"] = (acc[c.classificationProvider ?? "unknown"] ?? 0) + 1;
    return acc;
  }, {});

  const succeeded = runs.filter((r) => r.status === "SUCCEEDED").length;
  const failed = runs.filter((r) => r.status === "FAILED").length;

  return ok({
    generatedAt: new Date().toISOString(),
    provider: health,
    versions: {
      classification: "classify-1.3-demo",
      riskEngine: "risk-engine v1.3-demo",
      routingRules: "routing-rules v1.2-demo",
      clustering: "cluster-1.1-demo",
    },
    runs: runs.map((r) => ({
      id: r.id, modelId: r.modelId, version: r.version, provider: r.provider, status: r.status,
      inputCount: r.inputCount, outputCount: r.outputCount, latencyMs: r.latencyMs,
      startedAt: r.startedAt, finishedAt: r.finishedAt, error: r.error, notes: r.notes,
    })),
    runsSummary: { total: runs.length, succeeded, failed, successRate: runs.length ? +(succeeded / runs.length).toFixed(2) : null },
    confidenceDistribution: {
      buckets,
      mean: confidence.length ? +(confidence.reduce((s, c) => s + c, 0) / confidence.length).toFixed(2) : null,
      min: confidence.length ? +Math.min(...confidence).toFixed(2) : null,
      max: confidence.length ? +Math.max(...confidence).toFixed(2) : null,
      lowConfidenceFlag: 0.5,
    },
    classificationProviders: providerCounts,
    note: "Model runs record every classification/risk/clustering execution including honest failures. No chain-of-thought is stored or exposed.",
  });
});
