# ARCHITECTURE.md: technical architecture

## Stack

Next.js 16 App Router (single `/` route; hash-based client views), TypeScript,
Tailwind CSS 4 with shadcn/ui (New York style, dark ops theme, single teal
accent), Prisma + SQLite, TanStack Query (server state), Zustand (UI state +
hash router), MapLibre GL v6 + supercluster (map + clustering), recharts
(analytics charts), zod (validation at every boundary).

## Layer diagram

```
UI views (9)  src/components/app/views/ : command map event investigate
              responsibility verification report analytics health
  | TanStack Query hooks; Zustand store + hash router (#/view, #/events/<code>)
  v
api client    src/lib/client/api.ts : fetch, envelope unwrapping, x-demo-role header
  v
API routes    src/app/api/** : 31 endpoints; zod parse, role gates, rate
              limits, error envelopes, audit
  v
Engine + AI   src/lib/engine/ (pipeline, risk, responsibility, analytics,
              duplicate, enrich) + src/lib/ai/ (provider interface,
              glm-provider, mock-provider, factory)
  v
Prisma/SQLite prisma/schema.prisma : 17 models, JSON-in-string columns
```

## AI architecture

`AIProvider` interface (src/lib/ai/provider.ts) with two implementations and a
factory:

- GLMProvider (glm-provider.ts): server-side calls via z-ai-web-dev-sdk, model
  `glm-4-plus` (AI_MODEL override), thinking disabled, 30s timeout
  (Promise.race), 2 attempts, JSON extraction (code-fence tolerant), zod
  validation of structured outputs (classificationOutputSchema,
  riskAdvisorySchema). A failed or invalid call THROWS so callers can fall
  back honestly. Credentials never reach the browser.
- MockProvider (mock-provider.ts): deterministic keyword rules (category
  keywords including Hindi terms, severity keywords, mitigation downgrades,
  rainfall-aware severity bump, confidence heuristics, duplicate suspicion).
  Same input always yields the same output; used for seed generation, tests
  and fallback.
- Factory (index.ts): AI_PROVIDER = auto | glm | mock (default auto). A health
  probe runs one real classification, is cached 5 minutes and deduplicated
  under concurrency. getActiveProvider() returns GLM when healthy, else the
  mock. Failures are recorded in ModelRun (status FAILED with reason) and
  surfaced in /api/health and the Health view; fallback is never hidden.

Model versions: classify-1.3-demo, risk-1.3-demo, cluster-1.1-demo,
risk-engine v1.3-demo, routing-rules v1.2-demo. No chain-of-thought is stored
or exposed; outputs are structured JSON only.

## Urban Event Engine pipeline (ingestion, 16 stages)

`ingestReport()` in pipeline.ts, in order:

1. Persist the citizen report first (evidence-first: input is never lost); phone hashed; REPORT_INGESTED audit.
2. Persist photo evidence (CITIZEN_PHOTO) if attached.
3. Gather enrichment context in parallel: rainfall (IDW over 4 stations, 24h/72h), assets within 250m, historical incidents within 200m, jurisdiction by point-in-polygon.
4. Start a ModelRun record (classify).
5. Classify via the active provider (GLM structured JSON) or, on failure, the deterministic MockProvider with the run recorded FAILED (honest fallback).
6. Persist classification on the report (status TRIAGED); CLASSIFIED audit.
7. Duplicate detection: haversine distance to all events; open-event window 150m/48h; closed-event recurrence 100m/30d; sorted by distance.
8. Branch ATTACHED_DUPLICATE: attach report, reportCount+1, severity max, confidence max; DUPLICATE_ATTACHED audit.
9. Branch REOPENED_RECURRENCE: reopen closed event, recurrenceCount+1; EVENT_REOPENED audit.
10. Branch EVENT_CREATED: new event UE-<year>-NNNN with jurisdiction, title, rainfall snapshot; EVENT_CREATED audit.
11. Compute risk with the transparent 7-factor model; persist a RiskAssessment row (provider RULE).
12. Snapshot risk + rainfall onto the event; RISK_ASSESSED audit.
13. Resolve responsibility: asset-proximity matrix, jurisdiction defaults, support and escalation rules (below).
14. Apply responsibility: persist links (PRIMARY/SUPPORT/ESCALATION) and recommended action items; RESPONSIBILITY_RESOLVED audit.
15. Update the event's primary agencyCode.
16. Return the IngestOutcome (public ref, event code, action, classification provenance, risk, routing, duplicate match); POST /api/reports replies 201.

Related flows: reassessEvent() (risk recompute + optional AI advisory stored as AI_OUTPUT evidence), mergeEvents() (merge duplicates with audit), the verification workflow (events/[id]/verify) and the seed (same pipeline, mock provider forced).

## Risk model (risk-engine v1.3-demo)

Score = round(100 * sum of (value * weight) over all factors), clamped 0-100.
Each factor is normalised 0-1 and returned with raw evidence and contribution.

| Factor | Weight | Normalisation |
|---|---|---|
| Assessed severity | 0.20 | (severity - 1) / 3 |
| Report intensity | 0.16 | reportCount / 8 |
| Rainfall (24h) | 0.18 | rainfall24hMm / 150 |
| Recurrence | 0.14 | recurrenceCount / 4 |
| Drainage deficit | 0.12 | 1 - drainCondition/100 (0.4 if no drain nearby) |
| Maintenance gap | 0.10 | monthsSinceMaintenance / 12 (0.5 if no record) |
| Historical incidents | 0.10 | incidents within 200m / 8 |

Bands: LOW < 30, MODERATE 30-54, HIGH 55-74, CRITICAL >= 75.

## Responsibility routing (routing-rules v1.2-demo)

Primary, in priority order: underpass within 150m -> its owner agency (plus
BARRICADE action to DCP, DEPLOY_PUMP to owner); pump station within 250m for
WATERLOGGING -> owner; drain/outfall within 200m for DRAIN_OVERFLOW or
WATERLOGGING -> owner; SEWER_BACKUP -> DJB; corridor jurisdiction -> corridor
agency; default -> jurisdiction civic body (MCD fallback).
Support: MCD for WATERLOGGING when primary is another agency (no underpass);
IFC for catchment jurisdictions; DCP when severity >= 4.
Escalation: DDMA when risk band is CRITICAL. Every link stores a
human-readable reason; actions are created as RECOMMENDED items.

## Duplicate detection

Open-event window: a report within 150m of a non-closed event with last
activity within 48h is a duplicate (attach). Closed-event recurrence: a
report within 100m of an event closed within the last 30 days reopens it.
Clustering (union-find over a proximity graph) is exposed for investigation
with an adjustable radius (50-1000m, default 150m).

## Analytics methodology (src/lib/engine/analytics.ts)

- Candidates: 200m grid over the pilot bounding box (2440 cells at time of
  writing; 18 positive cells, i.e. within 200m of a ground-truth hotspot).
- Baseline score: Gaussian kernel density of reports in the last 72h,
  sigma 150m (complaint frequency field).
- Proposed score: the same 7-factor computeRisk composite fed with
  cell-level features (max event severity, report density, IDW rainfall,
  recurrence sum, drain condition average, maintenance gap, history count).
- Evaluation: precision/recall/F1 at hotspot level with symmetric 250m
  spatial matching; prediction lists non-maximum-suppressed at 400m (one
  prediction per physical location, applied equally to both approaches);
  detection by K (K = 3, 6, 9, 12); rank-based AUC over all cells.
- Duplicate clustering: ARI between proximity clustering (150m/48h) and the
  pipeline's report-to-event groups.
- Routing: engine-assigned primary agency vs seeded ground truth on
  hotspot-linked events; mismatches listed for inspection.
- Assignment delay: counterfactual queue simulation at 2 events/hour
  capacity, ordering by report count (baseline) vs risk score (proposed);
  median wait for ground-truth events.
- Verified resolution / recurrence-after-closure from verification records
  and the seeded lifecycle. Every analytics response carries
  meta.evaluationLabel stating this is a synthetic demo evaluation, not
  measured real-world performance.

## API surface

Envelope: `{ ok: true, data, meta }` or `{ ok: false, error: { code, message,
details } }`. Roles are demo roles via the `x-demo-role` header (default
CITIZEN); all GETs are public reads.

| Endpoint | Method | Notes |
|---|---|---|
| /api | GET | scaffold leftover; hello JSON |
| /api/overview | GET | command center aggregate |
| /api/events | GET | filterable list (status, riskBand, hours, limit, offset) |
| /api/events/:id | GET | full dossier (id or code) |
| /api/events/:id/responsibility | GET | routing chain + reasons |
| /api/events/:id/assign | POST | ANALYST/AGENCY/ADMIN; assign/escalate |
| /api/events/:id/reassess | POST | ANALYST/AGENCY/ADMIN; risk + AI advisory |
| /api/events/:id/merge | POST | ANALYST/AGENCY/ADMIN |
| /api/events/:id/actions | POST/PUT | ANALYST/AGENCY/ADMIN (PUT adds FIELD_TEAM) |
| /api/events/:id/verify | POST/PUT | POST: AGENCY/FIELD_TEAM/ANALYST/ADMIN, ordered stages; PUT: AGENCY/ANALYST/ADMIN, manual reopen |
| /api/reports | POST/GET | POST public, rate limit 12/min, full pipeline, 201; GET list |
| /api/reports/:id | GET | by id or public ref |
| /api/risk | GET | risk register with factors |
| /api/agencies, /api/jurisdictions, /api/assets | GET | public registries |
| /api/hotspots | GET | computed (grid, NMS 300m) + ground truth |
| /api/history, /api/weather | GET | incident archive; rainfall observations |
| /api/analytics/baseline, /api/analytics/proposed | GET | evaluation; evaluationLabel meta |
| /api/ai/classify | POST | rate limit 30/min; structured + provenance |
| /api/ai/cluster, /api/ai/risk | POST | rate limit 20/min each |
| /api/health, /api/data-health, /api/model-health | GET | honest health surfaces |
| /api/admin/seed | POST | ADMIN; confirm:true; regenerates demo data |

## Security posture (documented demo auth)

- Role gates via `x-demo-role` on mutating endpoints (see table);
  unauthenticated requests default to read-only-safe CITIZEN. Transparent,
  testable demo authorization, NOT production auth.
- zod validation at every boundary (bodies and queries); Delhi bounding box
  on lat/lng; Indian mobile regex on optional phone; photo data URLs capped
  at 600_000 characters.
- Rate limits: in-memory, per-process: 12/min report POST, 30/min AI
  classify, 20/min AI risk and cluster.
- Phone numbers hashed at rest (deterministic demo-grade digest).
- Safe error envelopes: unknown errors return a generic 500 message; detail
  is logged server-side only. AuditLog rows for every mutation.
- AI runs recorded in ModelRun including failures; no chain-of-thought is
  stored or exposed.

## Known constraints

- SQLite at demo scale; enrichment does in-memory filtering of small tables.
- In-memory rate limiter is per-process (resets on restart, not shared).
- Demo-role header auth (no sessions, no real identity).
- The sandbox clock reads 2026; seeded timestamps anchor to seed-execution
  time so freshness metrics stay live. Event codes use the runtime year.
