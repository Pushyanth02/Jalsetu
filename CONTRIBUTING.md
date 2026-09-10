# Contributing To JalSetu

Thanks for helping! This is a small repo with strong opinions — the short
version: keep it honest, keep it static.

## Setup

```bash
bun install
bun run dev          # http://localhost:3000
```

Node 20+ / Bun 1.1+. No database or API keys needed for everyday work — the
demo data ships in the repo (`src/data/snapshot.json`).

## Ground Rules

- **Branches**: `feature/<short-name>`, `fix/<short-name>` or `docs/<short-name>`
  off `main`. Keep PRs focused.
- **Before every commit**: `bun run lint` and `bun run typecheck` must pass
  (CI runs both plus a full static-export smoke build on every PR).
- **Honest-data rules (non-negotiable)**: never present synthetic data as real.
  Keep the `SYNTHETIC_DEMO` / `MOCK` / "deterministic" labels and provenance
  badges intact. New data must be regenerated with `bun run seed` and committed
  via `src/data/snapshot.json`.
- **Performance**: images ship as WebP with a PNG fallback (or optimized
  JPEG for the OG image); every `<img>` needs explicit dimensions, lazy
  loading below the fold, and `sizes` when responsive. New views must lazy-load
  and respect `prefers-reduced-motion`. Check that the layout survives 320 px
  to 2560 px before opening the PR.
- **No backend, no keys**: everything runs in the browser. If your change needs
  an API key, a server or a database at runtime, open an issue first — it
  probably belongs in the offline pipeline instead.
- **UI changes**: include screenshots (desktop + narrow viewport when layout
  moves) in your PR.
- **Sign-off**: by contributing you agree your work is licensed MIT (code) /
  CC-BY-4.0 (the demo dataset).

Found a bug or have an idea? Open an issue — the templates will guide you.
