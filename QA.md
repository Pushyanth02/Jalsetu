# QA.md: quality assurance record

## Verification methods

- Curl API sweep: all read endpoints probed and returning 200 during backend
  build (25 routes at that stage) and re-probed at documentation time (15 GET
  endpoints: health, overview, events, reports, agencies, jurisdictions,
  assets, hotspots, risk, history, weather, data-health, model-health,
  analytics/baseline, analytics/proposed -> all 200). Mutating endpoints were
  exercised during build QA: POST /api/reports (201), the AI endpoints (200),
  verification stage recording (201, and 409 STAGE_OUT_OF_ORDER when
  out-of-order), manual reopen (200), admin seed (200).
- Browser QA (agent-browser, isolated sessions): all 9 views render
  (command, map, event, investigate, responsibility, verification, report,
  analytics, health); console error count 0 on fresh loads of each view;
  mobile viewport 375px shows no horizontal overflow; the demo journey
  completes end-to-end in the browser (wizard submission, GLM
  classification, duplicate merge into an existing event, risk HIGH, NDMC
  PRIMARY + DCP SUPPORT routing, deep link into the event dossier).
- Lint: `npx eslint src` -> 0 errors, 0 warnings (re-run at documentation
  time).
- Types: `npx tsc --noEmit` -> 0 errors in project code (src/). The only
  remaining errors are in the sandbox's pre-existing examples/ and skills/
  folders, outside this application.
- Runtime checks: dev server logs free of compile errors; VLM screenshot
  review of the investigate and responsibility views found no structural
  defects; endpoint latency pings in the Health view all healthy during QA
  (98-370ms at the time).

## Known issues

- (resolved) Automated test suite present: 57 tests across engine unit and API
  integration layers, all passing (`bun test tests/`).
  the manual/scriptable verification above. This is the largest open QA gap.
- The counterfactual assignment-delay metric shifts when live submissions
  are added: on a fresh seed the medians are 1.5h (baseline, frequency
  ordering) vs 0.5h (proposed, risk ordering); with the QA submissions
  present at documentation time the values read 1.5h vs 2.0h because one
  live high-risk non-ground-truth event joined the queue. The metric is a
  labelled counterfactual, not a measured delay.
- Analytics numbers are data-dependent by design: they are computed live
  over the current database (including live submissions), so reported
  metrics drift slightly from the fresh-seed figures quoted in the docs.
- The sandbox clock reads 2026; seed timestamps anchor to seed-execution
  time, so "hours ago" labels are correct but absolute dates are not
  meaningful outside the demo.
- In-memory rate limits reset on server restart and are per-process.
- The dev server was occasionally killed externally during multi-agent
  builds and restarted; a single clean instance serves port 3000 now.

## Honest limitations relevant to QA

- Evaluation metrics (P/R/F1, AUC, ARI, routing accuracy, delay) are
  computed on labelled synthetic data: they validate the methodology, not
  real-world accuracy.
- Demo-role authorization is a documented header, not real auth; role gates
  are enforced server-side (requireRole returns 403 FORBIDDEN outside the
  allowed roles; the admin seed route was exercised with the ADMIN role), and
  the 409 stage-order path was tested explicitly in the browser.
- Phone hashing is a deterministic demo-grade digest, not cryptography.
- GLM availability is environment-dependent; when a call fails, the fallback
  is recorded in ModelRun and surfaced in the UI (amber notices) rather than
  hidden. GLM was healthy during browser QA (classification latency ~2.5s).

## Test suite (implemented)

`bun test tests/` - 57 tests, 503 assertions, all passing:

- Engine unit tests (no server needed): risk factor arithmetic and bands;
  duplicate thresholds (150m/48h, 100m/30d); routing rules per asset matrix
  case; MockProvider determinism (same input -> same output); ARI and AUC
  helper functions on known partitions.
- API integration tests (dev server must be running on port 3000): envelope
  shape for ok/error cases; zod validation failures (422); role gates
  (403); stage ordering (409); POST /api/reports returning 201 with the full
  pipeline outcome; analytics endpoints carrying the evaluationLabel meta.

Run: `bun test tests/` (dev server + seeded database required; GLM-dependent tests carry 60s timeouts).
