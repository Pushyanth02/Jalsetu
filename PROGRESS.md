# PROGRESS.md: build log summary

Derived from worklog.md (Tasks 0 through 14).

## Phases completed

- Task 0 (lead): repo inspection and 15-stage plan; AI probe (GLM live,
  glm-4-plus); maplibre + supercluster installed; design direction set (dark
  ops console, single teal accent, WCAG AA).
- Tasks 1-7 (lead): backend foundation.
  - Prisma schema (17 models) pushed to SQLite.
  - Core libs: rng (mulberry32), geo (haversine/IDW/point-in-polygon),
    api-helpers (envelopes, roles, rate limits), validation (zod),
    json/audit/modelrun.
  - AI provider abstraction: GLMProvider + deterministic MockProvider +
    factory with cached health probe and honest fallback; GLM verified live.
  - Urban Event Engine: ingestion pipeline, reassessment with AI advisory,
    event merge; 7-factor risk engine; rule-based responsibility routing;
    duplicate detection and clustering.
  - Seed: deterministic Delhi pilot (3 jurisdictions, 6 ground-truth
    hotspots, 20 assets, 4 synthetic gauges with a 96h monsoon storm,
    58 historical incidents, maintenance profiles, complaint-light hotspots
    and complaint magnets).
  - Analytics: baseline (report KDE) vs proposed (7-factor composite) with
    hotspot-level P/R/F1, NMS 400m, 250m matching, AUC, ARI, routing
    accuracy, counterfactual delay; all labelled synthetic.
  - 25 API routes built and curl-tested (the surface has since grown to 31
    endpoints); demo journey verified end-to-end via curl (GLM
    classification, duplicate attach, risk, routing).
- Task 10-e: Analytics view (5 tabs, integrity banner) and Data & Model
  Health view (source health, provider block, run log, confidence
  distribution, endpoint checks). Browser-verified.
- Task 10-c: Citizen Report wizard (5 steps, tracking lookup) and Field
  Verification board (5 status columns, ordered-stage dialog, reopen).
  Browser-verified end-to-end, including a live GLM-classified submission
  that created a new event.
- Task 10-d: AI Investigation view (3 tools with provenance and honest
  fallback notices) and Responsibility view (register, workload, chain
  inspector, escalation matrix). Browser-verified with live GLM calls.
- Task 12-a (lead): frontend integration and QA round 1. Fixed maplibre v6
  imports, hooks order, hash navigation, glyphs, TS and lint errors across
  the app. Browser QA: all 9 views render with 0 console errors, no 375px
  overflow, and the full demo journey passes in the browser (report wizard
  -> GLM classification -> duplicate merge -> risk HIGH -> NDMC routing ->
  deep link into the dossier). Lint 0 errors; tsc 0 errors in project files.
- Task 14 (this task): documentation suite (README, PRODUCT, ARCHITECTURE,
  DECISIONS, PROGRESS, QA, RESEARCH_TRACEABILITY).

## Current status

- Feature-complete for the pilot scope: 9 views, 31 API endpoints, engine,
  AI providers, seed, analytics, health monitoring.
- Dev server runs on port 3000; database seeded with the deterministic pilot
  plus a small number of live QA submissions (57 reports, 22 events at the
  time of writing; a fresh seed yields 53 reports, 21 events).
- Re-verified during documentation: all 15 GET endpoints return 200;
  `npx tsc --noEmit` shows zero errors in project code (remaining errors are
  only in the sandbox's pre-existing examples/ and skills/ folders);
  `npx eslint src` is clean.

## What remains

- Automated test suite: implemented and passing (57 tests: engine unit + API integration).
  documented in QA.md.
- Optional: packaging for standalone deployment (the build script exists but
  has not been exercised for this app), seed-time provider options, and
  removing the scaffold `/api` hello route.
- Not in scope for this prototype: real authentication, live municipal
  feeds, PostgreSQL migration, multi-process rate limiting. See the honest
  limitations in README.md.
