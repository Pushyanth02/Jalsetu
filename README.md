# JalSetu — Delhi Waterlogging Intelligence

A research-grade demo of a cross-agency waterlogging intelligence system: citizen
reports → rule-based classification → risk-scored urban events → agency routing → field
verification → learning, shown across 9 interactive views.

[![CI](https://github.com/Pushyanth02/Jalsetu/actions/workflows/ci.yml/badge.svg)](https://github.com/Pushyanth02/Jalsetu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Static](https://img.shields.io/badge/Static-No_API_Keys-No_Backend-2ea44f)

> **Live demo** — the site deploys to GitHub Pages automatically via the included
> workflow. Once: repo **Settings → Pages → Source: GitHub Actions**. After that,
> every push to `main` ships. See [Deploying To GitHub Pages](#deploying-to-github-pages).

**Not an official government system.** All data is synthetic demonstration data,
labelled as such everywhere in the UI. See [Data Ethics](#data-ethics).

## What You Get

One single-page app, 9 hash-routed views, deep-linkable (e.g. `#/events/UE-2026-0001`):

| View | What it shows |
| --- | --- |
| **Command Center** (`#/`) | KPIs, live ops map, rainfall context, alerts, event queue |
| **Waterlogging Map** (`#/map`) | Every event on a keyless MapLibre GL map (Esri World Dark Gray Canvas tiles + OpenStreetMap labels), severity markers, clusters, filters, hotspots, "Locate Me" |
| **Event Dossier** (`#/events/:id`) | The full evidence chain for one event: evidence, investigation, risk factors, response, audit trail |
| **Investigate** (`#/investigate`) | Deterministic tools with full provenance: classification, duplicate clustering, risk advisory |
| **Responsibility** (`#/responsibility`) | Cross-agency register: who owns which asset and who was routed where |
| **Verification** (`#/verify`) | Field-verification board closing the loop from routed action to ground truth |
| **Report Wizard** (`#/report`) | Five-step citizen report: location → issue → evidence → review → submit, with a tracking reference |
| **Analytics** (`#/analytics`) | Does combining evidence types find flooding hotspots better than counting complaints? Counterfactual comparison, honestly reported |
| **Data & Model Health** (`#/health`) | Dataset provenance, missingness, model runs, endpoint checks, plain-language glossary |

## No API Keys, No Backend

The deployed app is a **fully static export**:

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
| `bun run build` | Standard Next.js production build |
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

## Deploying To GitHub Pages

1. Push to `main`. The [Deploy workflow](.github/workflows/deploy.yml) builds
   the static export and publishes it.
2. Enable Pages once: **Settings → Pages → Source: GitHub Actions**.
3. The workflow computes `NEXT_PUBLIC_BASE_PATH` automatically
   (`/<repo-name>`, or empty for an `<owner>.github.io` root repo), so project
   pages work out of the box.
4. **Custom domain**: add a `CNAME` file, set `NEXT_PUBLIC_SITE_URL` to your
   domain (repo → workflow inputs on manual runs, or hardcode), and leave the
   base path empty.
5. Every PR additionally runs CI: lint + typecheck + a full export smoke build
   (`.github/workflows/ci.yml`) — if it builds there, it deploys.

## Editing In VS Code

Open the folder and you are set:

- Accept the workspace TypeScript SDK prompt (uses the repo's `typescript`).
- Recommended extensions are auto-suggested (ESLint, Tailwind IntelliSense,
  pretty TS errors, Error Lens, EditorConfig, GitHub Actions).
- **F5** launches Chrome against the dev server (start it via the
  `Dev: Start Next.js` task or `bun run dev` first).
- Tasks: `Dev: Start Next.js`, `Lint`, `Typecheck`, `Static Export (GitHub Pages)`
  (Terminal → Run Task).

## Project Structure

```text
src/app/            # Single route + SEO metadata routes (robots, sitemap, icons)
src/components/app/ # Shell (nav, top bar), the 9 views, keyless map components
src/components/ui/  # shadcn/ui primitives
src/lib/static/     # In-browser data layer: snapshot store + engine + API shim + seed
src/lib/            # Pure utilities: geo, rng, validation, types
src/data/           # snapshot.json — the committed synthetic demo dataset
src/scripts/        # Offline pipeline: deterministic seed, icon tools
.github/            # CI + Pages deploy workflows, issue/PR templates, Dependabot
.vscode/            # Workspace settings, launch config, tasks
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
bar. Test with devtools device emulation at **320 px, 390 px, 768 px,
1280 px and 1920 px** before shipping UI changes.

## Accessibility & Performance

- WCAG-minded: visible focus states, ARIA on interactive widgets,
  `prefers-reduced-motion` respected by all animation, AA-contrast palettes.
- All 9 views are route-level lazy-loaded; no source maps ship in production
  builds; images are optimized (AVIF/WebP) with explicit dimensions.
- One page, zero runtime backend — it loads like a static site because it is one.

### How the fast loads are achieved

- **Images**: raster art ships as WebP with a PNG fallback (`<picture>`); the
  OG image is a 1200×630 optimized JPEG (~150 KB, down from 370 KB). Every
  image declares explicit dimensions, `sizes`, lazy loading below the fold,
  and `decoding="async"` — so the layout never shifts while media streams in.
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
