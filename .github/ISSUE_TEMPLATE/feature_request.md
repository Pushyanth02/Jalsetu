---
name: Feature request
about: Suggest a new capability or improvement
title: "[Feature]: "
labels: enhancement
assignees: ""
---

**The problem you're trying to solve**
What are you trying to do, and what gets in the way today? (One or two sentences is plenty.)

**The change you'd like**
Describe the idea. Sketches, wireframes or a rough list of steps all help.

**Which view or area does it touch?**
Check all that apply:

- [ ] Command Center (`#/`)
- [ ] Waterlogging Map (`#/map`)
- [ ] Event Dossier (`#/events/...`)
- [ ] Investigate (`#/investigate`)
- [ ] Responsibility (`#/responsibility`)
- [ ] Verification (`#/verify`)
- [ ] Report Wizard (`#/report`)
- [ ] Analytics (`#/analytics`)
- [ ] Data & Model Health (`#/health`)
- [ ] Something else (shell, SEO, docs, build, CI, deploy)

**Constraints to respect (this project is intentionally static)**
Check the ones you have considered:

- [ ] No new API keys or paid services — everything runs in the browser
- [ ] Data changes would need to ship inside `src/data/snapshot.json`
- [ ] Any "AI" behaviour in static mode comes from the deterministic mock provider
- [ ] Synthetic data stays clearly labelled (SYNTHETIC_DEMO / MOCK / deterministic)
- [ ] Not presented as an official government system

**Anything else?**
Context, links to research, prior art, wild ideas — all welcome.
