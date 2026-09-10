import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api-helpers";
import { computeAnalytics } from "@/lib/engine/analytics";

export const dynamic = "force-dynamic";

// GET /api/analytics/baseline - complaint-frequency approach evaluation.
export const GET = handler(async () => {
  const analytics = await computeAnalytics();
  return ok(
    {
      approach: "BASELINE",
      description: "Complaint frequency ranking: cells scored by citizen report count alone (current common practice).",
      metrics: analytics.hotspotDetection.baseline,
      byK: analytics.hotspotDetection.byK.map((k) => ({ k: k.k, f1: k.baselineF1, spatialHitRate: k.baselineHit })),
      assignmentDelay: analytics.assignmentDelay.baselineMedianHours,
      duplicateClusteringAri: analytics.duplicateClustering.ari,
      routingAccuracy: null,
      methodology: analytics.methodology,
      dataset: analytics.dataset,
    },
    { evaluationLabel: analytics.label, generatedAt: analytics.generatedAt }
  );
});
