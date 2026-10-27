# JalSetu — Delhi Waterlogging Intelligence

A research-grade demo of a cross-agency waterlogging intelligence system: citizen
reports → rule-based classification → risk-scored urban events → agency routing → field
verification → learning, shown across 12 interactive views.

[![CI](https://github.com/Pushyanth02/Jalsetu/actions/workflows/ci.yml/badge.svg)](https://github.com/Pushyanth02/Jalsetu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Static](https://img.shields.io/badge/Static-No_API_Keys-No_Backend-2ea44f)

> **Live demo** — deploy with **Vercel** (recommended, zero configuration) or
> **GitHub Pages** (workflow included). Both paths are documented in
> [Deploying](#deploying).

**Not an official government system.** All data is synthetic demonstration data,
labelled as such everywhere in the UI. See [Data Ethics](#data-ethics).

## What You Get

One single-page app, 12 hash-routed views, deep-linkable (e.g. `#/events/UE-2026-0001`):

| View | What it shows |
| --- | --- |
| **Landing** (`#/`) | What JalSetu is, the seven-step pipeline, live pilot numbers, entry points to every tool |
| **Command Center** (`#/command`) | KPIs, live ops map, rainfall context, alerts, event queue |
| **Waterlogging Map** (`#/map`) | Every event on a keyless MapLibre GL map (Esri World Dark Gray Canvas tiles + OpenStreetMap labels), severity markers, clusters, filters, hotspots, "Locate Me" |
| **Event Dossier** (`#/events/:code`) | The full evidence chain for one event: evidence, investigation, risk factors, responsibility, verification, audit trail |
| **Investigation Tools** (`#/investigate`) | Deterministic tools with full provenance: classification, duplicate clustering, risk advisory |
| **Responsibility Register** (`#/responsibility`) | Cross-agency register: who owns which asset and who was routed where |
| **Field Verification Board** (`#/verify`) | Assignment to verified closure, closing the loop from routed action to ground truth |
| **Citizen Report** (`#/report`) | Guided report wizard (location → issue → evidence → review → result) with a tracking reference; submissions are auto-classified and merged into events live |
| **Research & Analytics** (`#/analytics`) | Does combining evidence types find flooding hotspots better than counting complaints? Counterfactual comparison, honestly reported (F1, AUC, ARI) |
| **Data & Model Health** (`#/health`) | Dataset provenance, missingness, model runs, endpoint checks, plain-language glossary |
| **Terms of Service** (`#/terms`) | Scope of the research prototype, permitted research use, licences, liability |
| **Privacy Policy** (`#/privacy`) | No accounts, no cookies, no analytics, no server; third-party map tiles only |

## Design System ("Monsoon Ledger")

Deliberate, documented choices — not defaults. v2 replaces the v1
"Monsoon Atlas" glass-HUD language with a flat civic ledger: ink paper,
tabular figures, one signal colour, and no atmospheric effects.

- **Typography** — *Fraunces* (display serif: the human face of a printed
  government atlas; view titles and the landing headline only, no italics
  inside headings), *Public Sans* (UI + body: the civic face designed for
  government digital services, best-in-class at 12–14px — and, since v2,
  the face of every label too), and *IBM Plex Mono* (data readouts only:
  codes, coordinates, tabular numerals). All three are self-hosted via
  `next/font` — zero third-party font requests.
- **Labels** — sentence case, body face, one step smaller, untracked
  (`.micro-label`). v1's uppercase letter-spaced mono labels were the
  loudest AI-template tell in the product; the 2026 redesign removed them
  everywhere.
- **Colour** — true-neutral ink surfaces (no navy cast) split by 1px
  hairlines; one rain-teal accent (`--aqua`) on data and at most one
  control per screen; warm severity ramp reserved for status; colour
  says good or bad, never up or down.
- **Surfaces** — flat panels, a border or a tone step but never both,
  no gradients, no glows, no glass, no shadows on resting cards
  (shadows only on what floats: menus, popovers, dialogs, map popups).
- **Motion** — feedback only: press, hover, focus, view transitions,
  transient loading states. No endless pulses, no entrance choreography
  on app screens, no hover lifts.
- **Contrast** — AA floors enforced across all views: body text ≥ 4.5:1
  (most tokens sit at 6–17:1), labels ≥ 4.5:1, input affordances ≥ 3:1,
  no text under 11px.

## No API Keys, No Backend

The deployed app runs entirely in the browser:

- All data ships as [`src/data/snapshot.json`](src/data/snapshot.json) — clearly
  labelled **synthetic demonstration data** — generated once by the offline
  pipeline (see below) and committed to the repo.
- An in-browser typed data layer (`src/lib/static`) reimplements the API
  surface, so the app code consumes the same interfaces it would in a server
  deployment — there just is no server.
- Mutations (filing a report, verifying an event, …) run **client-side**.
  They are deterministic and **reset on reload** — refresh for a clean demo.
- Classification runs through the **deterministic rule provider** in static
  mode. No model calls, no keys, no network. Every synthetic/model artefact is
  labelled in the UI: `SYNTHETIC_DEMO`, `MOCK`, "deterministic".
- The map needs **no key**: MapLibre GL with free Esri/OSM tile services.

## SEO & AI Discoverability

Built for both crawlers and AI assistants:

- **JSON-LD** (`@graph`: WebSite, LocalBusiness, BreadcrumbList, Dataset)
  server-rendered on `/` — the site graph is readable without JavaScript.
- **Per-view metadata**: each hash view updates `<title>` and description on
  activation (12 views, one H1 each, view breadcrumbs in the UI).
- **`/llms.txt`** — the [llmstxt.org](https://llmstxt.org) discovery file,
  generated as a route so its `Site:`/`Sitemap:` lines always match the real
  deployment origin (localhost in dev, the production domain when deployed).
- `sitemap.xml`, `robots.txt`, Open Graph + Twitter cards, favicon set and a
  branded 404 — all production-ready.

## Data Ethics

- Every record is labelled synthetic demo data. The discipline is:
  **REAL / SYNTHETIC / MODEL OUTPUT / HYPOTHETICAL** — never mixed silently.
- The dataset is licensed **CC-BY-4.0**; keep the attribution line if you reuse it.
- This is a research demo, **not** a deployed government service, and no
  municipal feed is live. Claims about system performance describe the demo only.
- Map tiles: © OpenStreetMap contributors; © Esri (World Dark Gray Canvas).

## Quick Start

Prerequisites: **Node 20+** and **Bun 1.1+**.

```bash
bun install
bun run dev        # http://localhost:3000
```

No database, no env vars, no keys needed to run the demo — the snapshot ships
with the repo.

## Scripts

| Script | What it does |
| --- | --- |
| `bun run dev` | Dev server on port 3000 |
| `bun run lint` | ESLint across the repo |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run build` | Standard Next.js production build (what Vercel runs) |
| `bun run build:pages` | Static export with `STATIC_EXPORT=true` → `out/` (GitHub Pages artifact) |
| `bun run seed` | Regenerate `src/data/snapshot.json` deterministically (no database, no network) |

## Regenerating The Demo Dataset

The generator runs the full in-memory pipeline (deterministic PRNG +
rule-based classification) and writes the snapshot directly — there is no
database anywhere in the pipeline:

```bash
bun run seed                 # overwrites src/data/snapshot.json (also --out <path> to preview)
```

Then commit the changed `src/data/snapshot.json` — that file **is** the app's
data at runtime, so the commit is the release.

## Editing In VS Code

Open the folder and you are set:

- Accept the workspace TypeScript SDK prompt (uses the repo's `typescript`).
- Recommended extensions are auto-suggested (ESLint, Tailwind IntelliSense,
  pretty TS errors, Error Lens, EditorConfig, GitHub Actions).
- **F5** launches Chrome against the dev server (start it via the
  `Dev: Start Next.js` task or `bun run dev` first).
- Tasks: `Dev: Start Next.js`, `Lint`, `Typecheck`, `Static Export (GitHub Pages)`
  (Terminal → Run Task).

## Deploying

### Vercel (recommended)

1. Push to `main` (repository: `Pushyanth02/Jalsetu`).
2. In Vercel: **Add New → Project → Import** the repository.
3. The **Next.js** preset is auto-detected; the build command (`next build`)
   needs no changes. **No environment variables are required.**
4. Deploy. Canonical URLs, `sitemap.xml`, JSON-LD identifiers, Open Graph and
   `llms.txt` automatically switch to your production domain —
   `src/lib/site-config.ts` falls back to `VERCEL_PROJECT_PRODUCTION_DOMAIN`
   and `VERCEL_URL` when `NEXT_PUBLIC_SITE_URL` is unset.
5. **Custom domain**: attach it in Vercel (it is picked up automatically), or
   set `NEXT_PUBLIC_SITE_URL=https://your.domain` for full control.

Every pull request gets a preview deployment with its own correct canonicals.
CI (`.github/workflows/ci.yml`) additionally gates every push and PR with
lint + typecheck + a full static-export smoke build — if CI is green, the
Vercel build is green.

#### Environment variables

| Variable | Required | Behavior when unset |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | no | Auto-resolved: Vercel production domain → Vercel deployment URL → `http://localhost:3000` (dev) |
| `NEXT_PUBLIC_BASE_PATH` | no | Empty. Set only when hosting under a subdirectory (the Pages workflow sets it automatically) |
| `STATIC_EXPORT` | no | Unset. Only `bun run build:pages` sets it (`true`) |

### GitHub Pages

1. Push to `main`. The [Deploy workflow](.github/workflows/deploy.yml) builds
   the static export and publishes it.
2. Enable Pages once: **Settings → Pages → Source: GitHub Actions**.
3. The workflow computes `NEXT_PUBLIC_BASE_PATH` automatically
   (`/<repo-name>`, or empty for an `<owner>.github.io` root repo), so project
   pages work out of the box.
4. **Custom domain**: run the workflow manually with the `site_url` input
   (or hardcode `NEXT_PUBLIC_SITE_URL`), add your `CNAME` file, and leave the
   base path empty.

## Project Structure

```text
src/app/            # Single route + metadata routes (robots, sitemap, llms.txt) + 404
src/components/app/ # Shell (nav, top bar), the 12 views, keyless map components
src/components/ui/  # shadcn/ui primitives
src/lib/static/     # In-browser data layer: snapshot store, engine, API shim, seed
src/lib/client/     # Client runtime: hash-router store, SEO shim, media, asset paths
src/lib/            # Pure utilities: geo, rng, validation, types, site-config
src/data/           # snapshot.json — the committed synthetic demo dataset
src/scripts/        # Offline pipeline: deterministic seed, image tools
.github/            # CI + Pages deploy workflows
docs/               # Responsive wireframes & breakpoint specification
```

## Responsive Behavior

The interface adapts at four tiers — no separate mobile app, one code path:

| Tier | Breakpoint | What changes |
| --- | --- | --- |
| Phone | `< 640px` | Bottom tab bar with a center **Report** action, drawer navigation, expandable search, filters in a drag-handle bottom sheet, map legend starts collapsed, 44px touch targets everywhere |
| Tablet | `640–1023px` | Desktop search visible, header condenses (location/time chips hidden), map filter rail stays a bottom sheet |
| Desktop | `≥ 1024px` | Full sidebar rail, filter rail beside the map, all header chips, keyboard shortcuts (`/` focuses search) |
| Ultrawide | `≥ 1600px` (`3xl`) | Content capped at 1440px and centered; extra header detail appears (`2xl` tiers) |

Safe-area insets are respected on notched phones (bottom bar + footer), and
`100dvh` keeps the app shell correct when mobile browsers collapse their URL
bar. Full layout contracts live in
[`docs/wireframes.md`](docs/wireframes.md). Test with devtools device
emulation at **320 px, 390 px, 768 px, 1280 px and 1920 px** before shipping
UI changes.

## Accessibility & Performance

- WCAG-minded: visible focus states, ARIA on interactive widgets,
  `prefers-reduced-motion` respected by all animation, AA-contrast palettes
  with enforced text floors.
- All 12 views are route-level lazy-loaded; no source maps ship in production
  builds; fonts are self-hosted variable fonts (single file per family).
- Images are optimized (AVIF/WebP) with explicit dimensions; the OG image is a
  1200×630 optimized JPEG.
- One page, zero runtime backend — it loads like a static site because it
  is one.

### How the fast loads are achieved

- **Images**: raster art ships as WebP with a PNG fallback (`<picture>`);
  every image declares explicit dimensions, `sizes`, lazy loading below the
  fold, and `decoding="async"` — so the layout never shifts while media
  streams in.
- **Tailwind v4 breakpoints**: `xs` (380 px) and `3xl` (1600 px) are defined
  via `@theme` in `src/app/globals.css` (Tailwind v4 ignores
  `tailwind.config.ts`); use them freely for one-extra-item phone layouts and
  ultrawide comfort.
- **Rendering budget**: all views are code-split and render only their own
  data subscriptions; search, filters and menus adjust state during render
  instead of cascading effects; below-fold panels stay cheap via
  `content-visibility` where applied.
- **Map**: MapLibre loads only the tiles in view; markers cluster
  (supercluster) and off-screen markers are skipped entirely.
- **Type scale**: fluid `clamp()` tokens prevent text overflow on small
  screens without media-query soup; touch targets stay ≥44 px on mobile.

## License

- Code: **MIT** (see [LICENSE](LICENSE)).
- Demo dataset (`src/data/snapshot.json`): **CC-BY-4.0** — keep the attribution
  line (© OpenStreetMap contributors / © Esri for map tiles) if you reuse it.
