## Summary

<!-- One or two sentences: what does this PR do and why? -->

## Changes

<!-- Bullet list of the meaningful changes (files/folders is fine for big PRs). -->

-

## Screenshots

<!-- For any visible UI change: before/after, desktop + mobile if the layout moved. -->

## Verification checklist

- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] Checked the affected views in the browser (`bun run dev`, desktop + narrow viewport if layout changed)
- [ ] Static export still builds (`bun run build:pages`) if anything in the data layer, map or shell changed
- [ ] **Honest-data rules respected** — synthetic data never presented as real; SYNTHETIC_DEMO / MOCK / "deterministic" labels kept intact; no new API keys or runtime backend introduced
