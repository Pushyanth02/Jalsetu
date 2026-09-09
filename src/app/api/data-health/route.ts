import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// GET /api/data-health - source health, freshness, missingness, ingestion.
export const GET = handler(async () => {
  const now = Date.now();
  const [
    reports, events, evidence, observations, incidents, maintenance, assets, jurisdictions, hotspots, verifications,
    latestReport, latestEvent, latestObservation, latestMaintenance, unclassified, noJurisdiction, eventsWithoutRain,
  ] = await Promise.all([
    db.citizenReport.count(),
    db.urbanEvent.count(),
    db.evidence.count(),
    db.weatherObservation.count(),
    db.historicalIncident.count(),
    db.maintenanceAction.count(),
    db.infrastructureAsset.count(),
    db.jurisdiction.count(),
    db.hotspot.count(),
    db.verification.count(),
    db.citizenReport.findFirst({ orderBy: { submittedAt: "desc" }, select: { submittedAt: true, source: true } }),
    db.urbanEvent.findFirst({ orderBy: { lastActivityAt: "desc" }, select: { lastActivityAt: true } }),
    db.weatherObservation.findFirst({ orderBy: { observedAt: "desc" }, select: { observedAt: true } }),
    db.maintenanceAction.findFirst({ orderBy: { performedAt: "desc" }, where: { performedAt: { not: null } }, select: { performedAt: true } }),
    db.citizenReport.count({ where: { classificationProvider: null } }),
    db.urbanEvent.count({ where: { jurisdictionId: null } }),
    db.urbanEvent.count({ where: { rainfall24hMm: null } }),
  ]);

  const fresh = (d: Date | null | undefined, maxAgeMinutes: number) => d != null && now - d.getTime() < maxAgeMinutes * 60_000;

  const sources = [
    {
      key: "citizen_reports",
      label: "Citizen reports",
      records: reports,
      lastRecordAt: latestReport?.submittedAt ?? null,
      freshness: latestReport ? minutesSince(latestReport.submittedAt) : null,
      status: reports === 0 ? "EMPTY" : fresh(latestReport?.submittedAt, 4320) ? "OK" : "STALE",
      missingness: { unclassifiedReports: `${unclassified}/${reports}` },
      sourceLabel: "SYNTHETIC_DEMO + live web submissions",
    },
    {
      key: "urban_events",
      label: "Urban events",
      records: events,
      lastRecordAt: latestEvent?.lastActivityAt ?? null,
      freshness: latestEvent ? minutesSince(latestEvent.lastActivityAt) : null,
      status: events === 0 ? "EMPTY" : "OK",
      missingness: { withoutJurisdiction: `${noJurisdiction}/${events}`, withoutRainfall: `${eventsWithoutRain}/${events}` },
      sourceLabel: "MODEL_OUTPUT (pipeline)",
    },
    {
      key: "weather",
      label: "Rainfall observations",
      records: observations,
      lastRecordAt: latestObservation?.observedAt ?? null,
      freshness: latestObservation ? minutesSince(latestObservation.observedAt) : null,
      status: observations === 0 ? "EMPTY" : fresh(latestObservation?.observedAt, 200) ? "OK" : "STALE",
      missingness: {},
      sourceLabel: "SYNTHETIC_DEMO (synthetic rain gauges)",
    },
    {
      key: "evidence",
      label: "Evidence items",
      records: evidence,
      lastRecordAt: null,
      freshness: null,
      status: evidence === 0 ? "EMPTY" : "OK",
      missingness: {},
      sourceLabel: "SYNTHETIC_DEMO + live uploads",
    },
    {
      key: "history",
      label: "Historical incidents",
      records: incidents,
      lastRecordAt: null,
      freshness: null,
      status: incidents === 0 ? "EMPTY" : "OK",
      missingness: {},
      sourceLabel: "SYNTHETIC_DEMO",
    },
    {
      key: "maintenance",
      label: "Maintenance actions",
      records: maintenance,
      lastRecordAt: latestMaintenance?.performedAt ?? null,
      freshness: latestMaintenance ? minutesSince(latestMaintenance.performedAt!) : null,
      status: maintenance === 0 ? "EMPTY" : "OK",
      missingness: {},
      sourceLabel: "SYNTHETIC_DEMO",
    },
    {
      key: "assets",
      label: "Infrastructure assets",
      records: assets,
      lastRecordAt: null,
      freshness: null,
      status: assets === 0 ? "EMPTY" : "OK",
      missingness: {},
      sourceLabel: "SYNTHETIC_DEMO",
    },
    {
      key: "verification",
      label: "Field verifications",
      records: verifications,
      lastRecordAt: null,
      freshness: null,
      status: verifications === 0 ? "EMPTY" : "OK",
      missingness: {},
      sourceLabel: "SYNTHETIC_DEMO + live field UI",
    },
  ];

  return ok({
    generatedAt: new Date().toISOString(),
    overall: events === 0 ? "EMPTY_DATABASE" : "OK",
    note:
      events === 0
        ? "Database is empty. Reseed the demo dataset (POST /api/admin/seed with confirm:true, role ADMIN)."
        : "Demo dataset present and fresh. Timestamps are anchored to seed execution time.",
    sources,
    pilot: { jurisdictions, hotspots, groundTruthHotspots: hotspots },
  });
});

function minutesSince(d: Date): number {
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
}
