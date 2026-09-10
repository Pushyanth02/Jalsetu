# RESEARCH_TRACEABILITY.md: traceability matrix

## Research objective

Evaluate whether multi-source evidence fusion (proposed) outperforms
complaint-frequency ranking (baseline) for identifying, prioritising, routing
and verifying recurring urban waterlogging events, on a bounded synthetic
Delhi pilot with known ground truth.

## Objective -> hypothesis -> features -> metrics -> evidence

| Row | Hypothesis | Features that implement it | Metrics | Evidence |
|---|---|---|---|---|
| Hotspot identification quality | Evidence-integrated ranking finds known flood-prone locations better than complaint frequency, especially where reporting is light. | Map hotspot layers (/api/hotspots), Analytics tabs A/B/E, the 7-factor risk engine feeding cell scores. | Precision, recall, F1, AUC, spatial hit rate at hotspot level (250m matching, NMS 400m); detection by K (3/6/9/12). | /api/analytics/baseline and /api/analytics/proposed computed on seeded ground truth (labelled synthetic). Fresh-seed result: baseline P/R/F1 0.833, AUC 0.997 (5/6 hotspots covered) vs proposed P/R/F1 1.0, AUC 0.999 (6/6), including both complaint-light hotspots. |
| Duplicate clustering quality | Proximity clustering of reports agrees with the pipeline's evidence-based event grouping. | Duplicate detection in the ingestion pipeline; AI investigation clustering tool (adjustable radius). | Adjusted Rand Index between proximity groups and report-to-event groups. | /api/analytics/proposed duplicateClustering: ARI 0.973 at documentation time (22 pipeline groups vs 21 proximity clusters; 150m radius), with an explanatory note. |
| Responsibility routing | Rule-based asset-proximity routing assigns the responsible agency accurately, and its failures are inspectable rather than hidden. | Responsibility chain view, escalation matrix, /api/events/:id/responsibility with per-link reasons. | Routing accuracy on ground-truth-linked events; mismatch list for inspection. | /api/analytics/proposed responsibilityRouting: accuracy 0.83 on 6 evaluated events, 1 documented mismatch (UE-2026-0001 at ITO crossing: expected MCD, assigned PWD) reflecting the deliberately ambiguous seeded ownership at ITO. |
| Assignment delay | Risk-ordered queues reduce wait for ground-truth hotspot events vs frequency-ordered queues at fixed capacity. | Queue ordering by risk score (command center event queue, risk register). | Counterfactual median delay (hours) for ground-truth events at 2 events/hour capacity. | /api/analytics/proposed assignmentDelay: on the fresh seed, median 0.5h (proposed) vs 1.5h (baseline). Labelled counterfactual simulation, not measured dispatch data; live submissions shift it (1.5h vs 2.0h at documentation time). |
| Intervention verification | Verified-before-close plus recurrence watch converts closures into checkable outcomes. | Verification workflow (ordered stages, server-enforced), reopen on recurrence in the pipeline, verification board. | Verified-resolution rate; recurrence-after-closure rate. | /api/analytics/proposed verifiedResolution + recurrenceAfterClosure over the seeded lifecycle: both seeded closures recorded a VERIFIED stage (2/2); one of the two watched closures recurred by design (a QA manual reopen later re-opened the second, so the live metric reads 2/2). |

All metric responses carry meta.evaluationLabel stating that this is a
synthetic demo evaluation computed on seeded pilot data with known ground
truth, not measured real-world performance. Metrics are computed live over
the current database, so exact values drift slightly once live submissions
exist; the fresh-seed figures above are reproducible by reseeding
(POST /api/admin/seed with confirm:true and role ADMIN, or
`bun run src/scripts/seed.ts`, then re-reading the analytics endpoints).

## Reproduction notes

- Fresh seed: `bun run src/scripts/seed.ts` (deterministic structure, fixed
  PRNG; timestamps anchored to execution time).
- Read metrics: `curl localhost:3000/api/analytics/proposed` and
  `.../baseline` (each response embeds methodology, dataset counts and the
  evaluation label).
- Inspect a single chain end-to-end: `curl localhost:3000/api/events/UE-2026-0001`
  (reports, evidence, risk factors with raw evidence, links with routing
  reasons, actions, verification stages, audit history).

## Claims discipline

- REAL (claims about system behaviour, verifiable in this repo):
  the pipeline stages and their order; duplicate thresholds (150m/48h open,
  100m/30d reopen); the 7-factor risk model with published weights and bands;
  routing rules and their reasons; API responses and status codes (201 on
  report ingestion, 409 on out-of-order verification, 403 on role gates);
  honest fallback behaviour recorded in ModelRun; audit logging of every
  mutation; the seed's deterministic structure.
- SYNTHETIC (evaluation numbers, honest about their data): all P/R/F1, AUC,
  spatial hit rate, ARI, routing accuracy, counterfactual delay, and
  verified-resolution/recurrence figures above. They measure the methodology
  on labelled synthetic data with a seeded ground truth. They are evidence
  about the method, not about Delhi.
- HYPOTHETICAL (future integration, not built): live municipal feeds (311,
  IMD gauges, agency asset registers), city-scale deployment, real dispatch
  timing, measured real-world routing accuracy. These are discussed only as
  feasibility, never asserted as achieved.

## Never-claim list

- No government partnership or endorsement of any kind (MCD, PWD, NDMC, DJB,
  I&FC, DDMA, DCP names model the routing domain only).
- No deployment: this is a research prototype on synthetic data.
- No live data: no municipal feed, no real weather feed, no citizen data
  collected in production.
- No measured real-world accuracy: every evaluation number is synthetic and
  labelled as such.
- No claim that the AI classification outperforms any deployed system: the
  fallback, its provenance and its failure recording are the demonstrated
  properties.
