# DECISIONS.md: architecture decision records

## ADR-1: Single-page hash-routed app instead of multiple Next.js routes

Context: The sandbox exposes only the root path `/`; deep routes are not
reachable from the preview panel. The product needs 9 distinct views plus
deep links to individual events.

Decision: One Next.js route (`src/app/page.tsx`) mounting an AppRoot; a
Zustand store drives view state and a hash router (`#/map`, `#/events/UE-...`)
keeps the URL shareable and the back button working.

Rationale: Works within the sandbox constraint; keeps server code (API routes)
and page code cleanly separated; hash links survive reloads.

Alternatives: Multiple app-router pages (unreachable in preview); query-string
routing (worse shareability, no back-button semantics).

## ADR-2: Dark ops-console theme lock, single teal accent

Context: The product is a control-room console for high-stakes triage. Design
discipline (anti-slop, restrained motion) was adopted from the start.

Decision: Dark theme only, no light mode; one monsoon-teal accent; severity
ramp amber to red; dense typography with mono data labels.

Rationale: Control-room convention (dark rooms, glanceable severity); a single
accent keeps attention on evidence, not decoration; one theme halves the visual
QA surface.

Alternatives: Light/dark toggle (double QA, diluted identity); multiple accent
colours per agency (visual noise).

## ADR-3: SQLite with JSON-in-string columns, validated by zod

Context: Prisma on SQLite has no enum or array column types. The demo runs on
one machine with modest data.

Decision: SQLite database; string fields for enums; structured payloads
(classification, risk factors, geometries) stored as JSON strings via
src/lib/json.ts helpers and parsed with zod schemas at boundaries.

Rationale: Zero-ops demo database; deterministic seeding; validation stays in
one place (validation.ts) so the missing column types do not leak type
unsafety.

Alternatives: PostgreSQL (operational cost without demo benefit); separate
normalized tables for every payload (complexity without payoff at this scale).

## ADR-4: GLM via z-ai-web-dev-sdk server-side only + deterministic fallback

Context: An LLM is useful for classifying free-text reports and drafting risk
advisories, but the sandbox AI endpoint can fail or lag, and credentials must
never reach the browser.

Decision: All AI calls happen server-side through the GLMProvider
(z-ai-web-dev-sdk, glm-4-plus, structured JSON, zod-validated, 30s timeout,
2 attempts). On failure the engine falls back to the deterministic
MockProvider and records the failure in ModelRun (honest fallback, surfaced in
the UI).

Rationale: The demo never breaks when the model is down, and never pretends a
fallback was a model call; security boundary is simple (no key in client
code).

Alternatives: Client-side model calls (credential leak, no validation
guarantee); fail closed (demo dies with the provider); silent fallback
(dishonest provenance).

## ADR-5: Explainable rule-based risk engine; LLM for classification + advisory only

Context: The risk score drives queue ordering and DDMA escalation. It must be
defensible to agency officers.

Decision: The risk score is computed by a transparent 7-factor weighted model
(risk-engine v1.3-demo) with per-factor raw evidence and contributions. The
LLM contributes classification (category/severity/confidence) and structured
risk advisories, never the score itself.

Rationale: Scores that route resources need to be explainable and stable; LLM
narrative is additive context, not the decision.

Alternatives: LLM-scored risk (unstable, unexplainable); pure keyword severity
(ignores rainfall, infrastructure, history).

## ADR-6: HTML markers + supercluster over pure GeoJSON cluster layers

Context: Event markers need risk-band colours, severity ticks and click
behaviour; MapLibre symbol layers need glyphs for text.

Decision: Event points render as HTML Marker elements (full CSS control,
glyph-free), clustered with supercluster; jurisdictions, drains and hotspots
remain GeoJSON layers.

Rationale: Styling control without hosting glyph fonts; cluster expansion
animation via DOM; consistent with the design system.

Alternatives: Symbol layers with clustered features (needs glyphs, weaker
styling); no clustering (marker overload).

## ADR-7: CARTO dark raster basemap with OSM attribution

Context: The map must match the dark console and work without an API key.

Decision: Raster basemap from basemaps.cartocdn.com (dark_all tiles) with
OpenStreetMap + CARTO attribution, rendered by MapLibre GL.

Rationale: No key management; visual match with the ops theme; correct
attribution is included.

Alternatives: OSM vector tiles (needs style + glyphs work); Mapbox (key
required); light basemaps (visual clash).

## ADR-8: Seeded timestamps anchored to seed-execution time, deterministic structure

Context: Freshness metrics (data health, TimeAgo labels) must stay live even
though the sandbox clock reads 2026 and the dataset is synthetic.

Decision: The seed uses a fixed PRNG (mulberry32, seed 20351) for structure
while anchoring all timestamps to `Date.now()` at execution time (report waves
at T-70h/T-38h/T-10h, storm peak ~36h ago, lifecycle stages at fixed
hours-ago).

Rationale: Fresh-looking data on every reseed; identical structure for
reproducible analytics; no hardcoded years (event codes use the runtime year).

Alternatives: Fixed historical dates (everything reads stale); fully random
seeding (non-reproducible evaluation).

## ADR-9: Complaint-light hotspots + complaint magnets in the seed

Context: A baseline vs proposed comparison is only meaningful if the dataset
contains cases where the two approaches disagree, without rigging either side.

Decision: Two structurally vulnerable hotspots get only 1-2 reports
(complaint-light: Alipur Road, Barapulla outfall); two busy spots get several
minor reports (complaint magnets: GTB Nagar market, Pragati Maidan gate). Both
approaches are then evaluated on identical candidates and identical labels.

Rationale: The baseline genuinely under-ranks quiet-but-risky spots and
over-ranks busy-but-safe spots, and the proposed model must earn its advantage
through infrastructure and history evidence on the same cells.

Alternatives: Uniform report density (comparison degenerates); reports only at
hotspots (baseline would look perfect).

## ADR-10: Demo-role authorization instead of NextAuth

Context: Real identity management is out of scope for a research demo, but
role separation (citizen, analyst, agency, field team, admin) must be
demonstrable and testable.

Decision: A documented `x-demo-role` header (values CITIZEN, ANALYST, AGENCY,
FIELD_TEAM, ADMIN; default CITIZEN) gates mutating endpoints; the UI api
client passes the role per call. Documented everywhere as NOT production auth.

Rationale: Transparent, trivially testable via curl, no session
infrastructure; honest about its limits.

Alternatives: NextAuth (present in dependencies but unused: real secret
management, overkill for a demo); no gating at all (the workflow integrity
demo would vanish).

## ADR-11: Verification stages validated in order server-side

Context: The verification workflow (ASSIGNED -> ... -> CLOSED) is the product's
answer to unverified closures; skipping stages would hollow out the claim.

Decision: POST /api/events/:id/verify checks that the previous stage was
recorded before accepting the next one and returns 409 STAGE_OUT_OF_ORDER
otherwise; reopen is a separate PUT path.

Rationale: Workflow integrity must be enforced server-side, not just in the
wizard UI; the 409 is also a demonstrable QA case.

Alternatives: Client-only ordering (trivially bypassed); free-form stage
entry (no chain to audit).

## ADR-12: Analytics at hotspot level with NMS

Context: Grid-cell metrics reward many adjacent cells around one hotspot
(grid-alignment artifacts) and let one location consume several top-K slots.

Decision: Predictions are non-maximum-suppressed at 400m before evaluation;
precision/recall are computed at hotspot level with symmetric 250m matching;
the same NMS applies to both baseline and proposed.

Rationale: One prediction per physical location mirrors how a control room
consumes hotspot lists; symmetric treatment keeps the comparison fair.

Alternatives: Cell-level P/R/F1 (inflated, artifact-prone); matching radius
tied to cell size (alignment artifacts).
