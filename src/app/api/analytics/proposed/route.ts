import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api-helpers";
import { computeAnalytics } from "@/lib/engine/analytics";

export const dynamic = "force-dynamic";

// GET /api/analytics/proposed - multi-source evidence approach evaluation.
export const GET = handler(async () => {
  const analytics = await computeAnalytics();
  return ok(
    {
      approach: "PROPOSED",
      description:
        "Evidence-integrated ranking: complaints + rainfall + GIS/infrastructure + recurrence + maintenance + verified observations, via the explainable 7-factor risk model.",
      metrics: analytics.hotspotDetection.proposed,
      byK: analytics.hotspotDetection.byK.map((k) => ({ k: k.k, f1: k.proposedF1, spatialHitRate: k.proposedHit })),
      assignmentDelay: analytics.assignmentDelay.proposedMedianHours,
      duplicateClustering: analytics.duplicateClustering,
      responsibilityRouting: {
        accuracy: analytics.responsibilityRouting.accuracy,
        evaluated: analytics.responsibilityRouting.evaluated,
        mismatches: analytics.responsibilityRouting.mismatches,
      },
      verifiedResolution: analytics.verifiedResolution,
      recurrenceAfterClosure: analytics.recurrenceAfterClosure,
      comparison: {
        baseline: analytics.hotspotDetection.baseline,
        proposed: analytics.hotspotDetection.proposed,
        note: "Both approaches evaluated on identical candidates and labels. Differences are attributable to the scoring function, not the data.",
      },
      methodology: analytics.methodology,
      dataset: analytics.dataset,
    },
    { evaluationLabel: analytics.label, generatedAt: analytics.generatedAt }
  );
});
