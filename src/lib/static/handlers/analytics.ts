import { ok, type HandlerResult } from "../envelope";
import { computeAnalytics } from "../engine/analytics";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/analytics/baseline and GET /api/analytics/proposed
// routes (src/app/api/analytics/{baseline,proposed}/route.ts) for the in-browser
// API. Baseline = complaint-frequency ranking; proposed = multi-source evidence
// ranking. Both evaluate on the same seeded demo dataset with the same honest
// SYNTHETIC DEMO EVALUATION labels. Semantics preserved 1:1.

export async function analyticsBaseline(_ctx: HandlerCtx): Promise<HandlerResult> {
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
}

export async function analyticsProposed(_ctx: HandlerCtx): Promise<HandlerResult> {
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
}

export const analyticsRoutes: RouteDef[] = [
  { method: "GET", segments: ["analytics", "baseline"], handler: analyticsBaseline },
  { method: "GET", segments: ["analytics", "proposed"], handler: analyticsProposed },
];
