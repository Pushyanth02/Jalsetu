# JalSetu: Delhi Urban Event Intelligence System

JalSetu is a research-grade prototype for urban event intelligence applied to Delhi
monsoon waterlogging. It turns citizen reports into a structured chain of evidence,
urban events, explainable risk scores, routed responsibility, field verification and
measured analytics, and it compares this against a complaint-frequency baseline.

It is NOT a deployed government system. All seeded data is synthetic and labelled
SYNTHETIC_DEMO. No municipal feed is live. See "Honest limitations" below.

## Quickstart

Prerequisites: bun (1.x). The database is a single SQLite file; no server needed.

```bash
bun install                # dependencies
bun run db:generate        # Prisma client (skip if already generated)
bun run db:push            # create/refresh SQLite schema (file: db/custom.db; accepts data loss)
bun run src/scripts/seed.ts  # deterministic Delhi pilot demo data
bun run dev                # dev server on port 3000
```

Open http://localhost:3000 (or the sandbox preview panel). The app is a single
route with hash-based views, so deep links like `#/events/UE-2026-0001` work.

Seeding is safe to re-run: `bun run src/scripts/seed.ts` wipes and regenerates
the demo dataset (structure is deterministic via a fixed PRNG; timestamps are
anchored to execution time so freshness metrics stay live). A fresh seed
produces roughly 53 reports, 21 urban events, 132 rainfall observations,
58 historical incidents, 20 assets and 6 ground-truth hotspots.

Note on the clock: the sandbox clock reads 2026. Event codes use the runtime
year (UE-2026-NNNN here), and seed timestamps anchor to seed-execution time.

## Demo journey (the acceptance path)

The chain: REPORT -> EVIDENCE -> URBAN EVENT -> RISK -> ASSET -> RESPONSIBILITY
-> ACTION -> VERIFICATION -> LEARNING. Walk it in this order:

1. Command Center (default view `#/`): counts, operational alerts, rainfall
   context, response-by-agency, event queue.
2. File a report: left nav rail -> Report. Five-step wizard: Location (click
   the map, type coordinates, pick a jurisdiction or "Use my location") ->
   Issue (category, severity, description) -> Evidence (optional photo,
   optional phone, required consent) -> Review -> Submit.
3. Result panel: you get a public tracking ref (CR-XXXXX), the pipeline outcome
   (EVENT_CREATED, ATTACHED_DUPLICATE or REOPENED_RECURRENCE), the AI
   classification with provider provenance, the risk band and the routed
   agencies. Click "Open event dossier".
4. Event dossier: tabs Overview / Evidence / AI Investigation /
   Response & Verification / Audit. This is the full evidence chain for one
   event, including factor-by-factor risk breakdown.
5. Duplicate detection: submit a second report within ~150m of an open event
   (within 48h). The pipeline attaches it as a duplicate and strengthens the
   event instead of creating a new one. The seeded dataset already contains a
   recurrence that reopened a closed event (Baba Kharak Singh Marg).
6. AI Investigation (`#/investigate`): three tools with full provenance:
   classification (queue or ad-hoc text), duplicate clustering (radius
   100-300m), risk assessment with structured AI advisory.
7. Responsibility (`#/responsibility`): cross-agency register, agency
   workload, chain inspector (event -> asset -> agency -> action) and the
   escalation matrix.
8. Field Verification (`#/verify`): workflow board. Open an event and record
   stages in order (ASSIGNED, DISPATCHED, OBSERVED, ...). Out-of-order stages
   are rejected server-side with 409 STAGE_OUT_OF_ORDER. Closed events can be
   reopened with a reason.
9. Analytics (`#/analytics`): baseline (complaint frequency) vs proposed
   (multi-source evidence) evaluation on the seeded ground truth, with a
   research-integrity banner marking results as synthetic.
10. Data & Model Health (`#/health`): source freshness, model run log
    (including honest failures) and live endpoint checks.

## Environment variables

| Variable | Values | Meaning |
|---|---|---|
| DATABASE_URL | SQLite file URL | e.g. `file:/home/z/my-project/db/custom.db` |
| AI_PROVIDER | `auto` (default), `glm`, `mock` | Provider selection. `auto` probes GLM once (5 min cache) and falls back to the deterministic mock if unavailable. |
| AI_MODEL | model id (optional) | Overrides the GLM model id. Detected default: `glm-4-plus`. |

AI credentials never reach the browser. The GLM provider calls the
z-ai-web-dev-sdk server-side only (its own config file); no key is committed
or shipped to the client.

## Testing

- `bun test tests/` runs the test suite: `tests/engine.test.ts` (unit tests for the deterministic core: RNG, geo math, risk model bounds and factor explainability, mock-provider classification, proximity clustering, ARI/AUC metrics, routing rules) and `tests/api.test.ts` (integration tests over the live HTTP surface: health, registries, event dossier, report ingestion pipeline, AI endpoints, authorization boundaries, workflow stage validation, analytics). Requires the dev server running on port 3000 and a seeded database.
  API integration tests, once added, need the dev server running on port 3000.
- Honest status: an automated test suite (engine unit + API integration) is
  been manual and scriptable: curl API sweeps, browser QA of all nine views,
  ESLint (0 errors in src) and tsc (0 errors in project code). See QA.md.

## Project structure

```
prisma/schema.prisma          17 models (SQLite; JSON-in-string columns)
src/app/page.tsx              single route; mounts AppRoot
src/app/api/                  31 endpoints in 28 route files
src/components/app/shell/     AppRoot, TopBar, NavRail (hash navigation)
src/components/app/map/       MapCanvas (MapLibre + supercluster), legend
src/components/app/views/     9 views: command, map, event, investigate,
                              responsibility, verification, report,
                              analytics, health
src/lib/engine/               pipeline, risk, responsibility, analytics,
                              duplicate, enrich (Urban Event Engine)
src/lib/ai/                   provider interface + health, glm-provider,
                              mock-provider, factory (index.ts)
src/lib/seed/                 delhi.ts (pilot definitions), generate.ts
                              (deterministic seed), photo.ts (SVG evidence)
src/lib/client/               api.ts (fetch + demo-role header), store.ts
                              (Zustand + hash router)
src/lib/                      api-helpers, validation (zod), db, geo, rng,
                              json (audit/model-run), types
src/scripts/seed.ts           seed runner
```

## Honest limitations

- Synthetic data: every seeded row is labelled SYNTHETIC_DEMO. Evaluation
  metrics (P/R/F1, AUC, ARI, routing accuracy) are computed on labelled
  synthetic ground truth; they demonstrate methodology, not real-world
  performance.
- Bounded pilot: 3 jurisdictions, 6 ground-truth hotspots, 7 agencies,
  20 assets. Coordinates approximate real places; nothing claims live
  municipal data.
- No live feeds: weather observations are synthetic rain gauges; there is no
  municipal 311/IMS, IMD or sensor integration.
- No real authentication: roles are demo roles passed via the documented
  `x-demo-role` request header. This is transparent and testable, not
  production auth.
- In-memory rate limits: per-process only; they reset on restart and are not
  shared across instances.
- SQLite at demo scale: enrichment does in-memory filtering of small tables;
  fine here, not a city-scale data strategy.
- Phone "hashing" is a deterministic demo-grade digest, not cryptography.
- AI calls fall back honestly to deterministic rules when GLM fails; the
  fallback is recorded in ModelRun, never hidden.
