import { mdb } from "../db";
import { ok, type HandlerResult } from "../envelope";
import { providerHealth } from "../ai";
import { getRainfallContext } from "../engine/enrich";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/overview route (src/app/api/overview/route.ts)
// for the in-browser API. Command center aggregate: active events, alerts,
// rainfall context, response & verification status. Semantics, honest labels
// and envelope shape preserved 1:1.

export async function overview(_ctx: HandlerCtx): Promise<HandlerResult> {
  const now = Date.now();
  const [events, hotspots, verifications, agencies, jurisdictions, ai] = await Promise.all([
    mdb.urbanEvent.findMany({ orderBy: { riskScore: "desc" } }),
    mdb.hotspot.findMany({ where: { kind: "GROUND_TRUTH" } }),
    mdb.verification.findMany({ orderBy: { verifiedAt: "desc" } }),
    mdb.agency.findMany(),
    mdb.jurisdiction.findMany(),
    providerHealth(),
  ]);

  const active = events.filter((e) => !["CLOSED"].includes(e.status));
  const unresolved = events.filter((e) => ["DETECTED", "TRIAGED"].includes(e.status));
  const highRisk = events.filter((e) => e.riskBand === "HIGH" || e.riskBand === "CRITICAL");
  const awaitingResponse = events.filter((e) => ["TRIAGED", "REOPENED"].includes(e.status));
  const inField = events.filter((e) => ["ASSIGNED", "IN_PROGRESS"].includes(e.status));
  const verified = events.filter((e) => ["VERIFIED", "CLOSED"].includes(e.status));
  const reopened = events.filter((e) => e.status === "REOPENED" || e.recurrenceCount > 0);

  // rainfall context at pilot centroid
  const rain = await getRainfallContext({ lat: 28.645, lng: 77.225 });

  // operational alerts: honest, rule-based
  const alerts: { severity: string; message: string; eventCode?: string }[] = [];
  for (const e of events.filter((x) => x.riskBand === "CRITICAL" && x.status !== "CLOSED").slice(0, 3)) {
    alerts.push({ severity: "CRITICAL", message: `${e.code} at ${e.locationText} is CRITICAL risk (${e.riskScore}/100) and ${e.status.toLowerCase()}`, eventCode: e.code });
  }
  for (const e of awaitingResponse.filter((x) => x.riskBand === "HIGH").slice(0, 3)) {
    const ageH = Math.round((now - e.lastActivityAt.getTime()) / 3600_000);
    alerts.push({ severity: "HIGH", message: `${e.code} awaiting assignment for ${ageH}h (risk ${e.riskScore})`, eventCode: e.code });
  }
  for (const e of reopened.slice(0, 2)) {
    alerts.push({ severity: "MEDIUM", message: `${e.code} reopened/recurred ${e.recurrenceCount}× at ${e.locationText}`, eventCode: e.code });
  }
  if (rain.rainfall24hMm > 60) {
    alerts.push({ severity: "HIGH", message: `Rainfall ${Math.round(rain.rainfall24hMm)}mm in 24h near pilot area - elevated waterlogging conditions` });
  }

  const responseByAgency = agencies.map((a) => {
    const linked = events.filter((e) => e.agencyCode === a.code);
    return {
      code: a.code,
      name: a.name,
      active: linked.filter((e) => !["CLOSED", "VERIFIED"].includes(e.status)).length,
      verified: linked.filter((e) => ["VERIFIED", "CLOSED"].includes(e.status)).length,
      highRisk: linked.filter((e) => e.riskBand === "HIGH" || e.riskBand === "CRITICAL").length,
    };
  });

  const recentVerifications = verifications.slice(0, 12).map((v) => ({
    id: v.id, stage: v.stage, verifiedAt: v.verifiedAt, verifiedBy: v.verifiedBy, notes: v.notes?.slice(0, 90),
  }));

  return ok({
    generatedAt: new Date().toISOString(),
    counts: {
      activeEvents: active.length,
      highRisk: highRisk.length,
      unresolved: unresolved.length,
      awaitingResponse: awaitingResponse.length,
      inField: inField.length,
      verified: verified.length,
      reopened: reopened.length,
      totalEvents: events.length,
    },
    rainfall: {
      pilot24hMm: rain.rainfall24hMm,
      pilot72hMm: rain.rainfall72hMm,
      nearestStation: rain.nearestStation,
      latestObservedAt: rain.latestObservedAt,
      dataLabel: "SYNTHETIC_DEMO",
    },
    events: events.slice(0, 30).map((e) => ({
      id: e.id, code: e.code, title: e.title, status: e.status, severity: e.severity,
      riskScore: e.riskScore, riskBand: e.riskBand, reportCount: e.reportCount,
      recurrenceCount: e.recurrenceCount, lat: e.lat, lng: e.lng, locationText: e.locationText,
      agencyCode: e.agencyCode, jurisdictionId: e.jurisdictionId, lastActivityAt: e.lastActivityAt,
      confidence: e.confidence, rainfall24hMm: e.rainfall24hMm,
    })),
    alerts: alerts.slice(0, 8),
    responseByAgency,
    recentVerifications,
    pilot: {
      jurisdictions: jurisdictions.map((j) => ({ id: j.id, code: j.code, name: j.name, kind: j.kind, centroid: { lat: j.centroidLat, lng: j.centroidLng } })),
      groundTruthHotspots: hotspots.length,
    },
    ai: { provider: ai.provider, modelId: ai.modelId, available: ai.available, configuredBy: ai.configuredBy },
    dataLabel: "SYNTHETIC_DEMO dataset + live submissions",
  });
}

export const overviewRoutes: RouteDef[] = [
  { method: "GET", segments: ["overview"], handler: overview },
];
