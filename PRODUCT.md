# PRODUCT.md: JalSetu product definition

## Problem statement

Delhi waterlogging recurs every monsoon at the same physical locations, yet the
evidence about it stays fragmented. Citizens report to hotlines and apps; drains,
pumps and underpasses belong to different agencies (MCD, PWD, NDMC, DJB, I&FC);
rainfall sits with the weather department; incident history sits in archives. A
control-room analyst triaging a flooded underpass cannot see, in one place: what is
happening now, how risky it is compared with elsewhere, who owns the nearest
drain, what was promised last time, and whether last month's "resolution" actually
held. The result is duplicate dispatches, complaint-volume-driven attention
(structurally vulnerable but quiet spots get ignored), and closures that are never
verified.

## Research question

Primary question: does multi-source evidence fusion (citizen reports + rainfall +
infrastructure condition + maintenance history + recurrence + verified field
observations) identify, prioritise and route urban waterlogging events better than
the common baseline of complaint-frequency ranking?

Evaluation design: baseline and proposed approaches are scored on identical
candidate cells against the same seeded ground-truth labels, so differences are
attributable to the scoring function, not the data.

Core chain (one data spine, end to end):

REPORT -> EVIDENCE -> URBAN EVENT -> RISK -> ASSET -> RESPONSIBILITY -> ACTION ->
VERIFICATION -> LEARNING

Every arrow is auditable in the AuditLog, and every score is explainable
factor-by-factor.

## The nine primary experiences

1. Command Center (`#/`): live counts, operational alerts (critical risk, response
   delay, recurrence, rainfall), agency response status, top event queue.
2. Map (`#/map`): dark ops basemap with pilot jurisdictions, drains, ground-truth
   hotspots and clustered event markers (risk-coloured); layers and legend.
3. Event Detail (`#/events/<code>`): full dossier per urban event: overview,
   evidence gallery, AI investigation tab (risk factor bars + advisory),
   response & verification stepper, audit trail.
4. AI Investigation (`#/investigate`): three analyst tools with provenance:
   report classification (re-run or ad-hoc), duplicate clustering (adjustable
   radius), risk assessment with structured advisory. Honest fallback notices.
5. Responsibility (`#/responsibility`): cross-agency register (filters, escalate
   view), agency workload, chain inspector (event -> jurisdiction -> asset ->
   agency -> action, with reasons and hotlines), escalation matrix reference.
6. Field Verification (`#/verify`): workflow board by status; record ordered
   stages with observed severity, water depth, notes and photos; reopen closed
   events with a reason; out-of-order submissions rejected server-side.
7. Citizen Report (`#/report`): 5-step wizard (location, issue, evidence, review,
   result) with map picking, geolocation, photo downscaling, consent gate,
   tracking ref lookup.
8. Analytics (`#/analytics`): baseline vs proposed comparison, detection by K,
   operational metrics (ARI, routing accuracy, assignment delay, verified
   resolution, recurrence), methodology, predictions vs truth. Permanent
   research-integrity banner: synthetic evaluation.
9. Data & Model Health (`#/health`): source health (freshness, missingness,
   provenance per table), provider health, model run log with failures,
   confidence distribution, live endpoint checks.

## Pilot scope

Three bounded jurisdictions, modelled on real Delhi geography:

- DL-MT-068: Ward 68 Model Town (MCD North City Zone), ward.
- DL-MR-C01: Minto Road corridor (NDMC), corridor.
- DL-ITO-C02: ITO-Barapullah drainage catchment (MCD Central / PWD / I&FC),
  catchment.

Six ground-truth hotspots (known flood-prone locations in the synthetic scenario):
Model Town underpass approach (PWD), Alipur Road low stretch (MCD, complaint-light),
Minto Road underpass (PWD), Baba Kharak Singh Marg depression (NDMC), ITO crossing
(MCD, deliberately ambiguous ownership), Barapullah drain outfall (I&FC,
complaint-light).

Seven agencies with routing notes and hotlines: MCD, PWD, NDMC, DJB, IFC
(Irrigation & Flood Control), DDMA (escalation), DCP (traffic support).

Supporting data: 20 infrastructure assets, 4 synthetic rain gauges (96h monsoon
storm, 3-hourly), 58 historical incidents, 20 maintenance actions, a full report
timeline in three waves (pre-storm, storm peak, aftermath), complaint magnets,
noise reports, and a seeded verification lifecycle (one closure that recurs).

## Personas

- Control-room analyst: triages new events, runs AI tools, orders the queue by
  risk, escalates. Views: command, map, investigate, event detail.
- Field team: receives assigned actions, records ordered verification stages
  with photos and water depth. Views: verification, event detail.
- Agency officer: sees workload and routing reasons, reassigns or reopens,
  closes events. Views: responsibility, verification.
- Citizen: files a report in under a minute, tracks it by public ref, sees the
  outcome. View: report.
- Researcher: reads the methodology, checks metrics with labels, inspects model
  runs and data health. Views: analytics, health.

## Alignment with the SMART CITY 2030 competition framing

| Element | JalSetu answer |
|---|---|
| Urban problem | Recurring monsoon waterlogging in Delhi with fragmented evidence, complaint-volume attention and unverified closures. |
| Methodology | Evidence fusion over a single event spine (report to learning); explainable 7-factor risk model; rule-based responsibility routing; baseline vs proposed evaluation on identical labels. |
| Technology | Next.js 16 + TypeScript single-page ops console; Prisma/SQLite; MapLibre GL map with clustering; GLM (glm-4-plus) structured classification and advisory with deterministic fallback; zod validation everywhere. |
| Stakeholders | Control-room analysts, field teams, agency officers (MCD, PWD, NDMC, DJB, I&FC, DDMA, DCP), citizens, researchers. |
| Measurable outcomes | Hotspot detection P/R/F1 and AUC vs baseline; duplicate clustering ARI; routing accuracy; assignment delay (counterfactual); verified-resolution rate; recurrence-after-closure. All computed on labelled synthetic data and labelled as such. |
| Monitoring | Data & Model Health view: source freshness, model run log with honest failures, confidence distribution, endpoint pings; audit log for every mutation. |
| Feasibility | Runs on one machine with a SQLite file and a single AI provider; seeded demo works offline of municipal systems; documented limits (demo auth, in-memory rate limits, synthetic feeds) mark what production would need. |
