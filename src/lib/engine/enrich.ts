import { db } from "@/lib/db";
import { distanceM, idwInterpolate, type LatLng } from "@/lib/geo";

// Enrichment layer: joins a location with rainfall, infrastructure, historical
// and maintenance context. Loads are in-memory filtered (demo-scale data),
// deterministic, and safe on empty databases.

export interface RainfallContext {
  rainfall24hMm: number;
  rainfall72hMm: number;
  nearestStation: { code: string; name: string; distanceM: number } | null;
  latestObservedAt: string | null;
}

export async function getRainfallContext(p: LatLng): Promise<RainfallContext> {
  const since = new Date(Date.now() - 72 * 3600_000);
  const obs = await db.weatherObservation.findMany({
    where: { observedAt: { gte: since } },
    orderBy: { observedAt: "desc" },
  });
  if (obs.length === 0) {
    return { rainfall24hMm: 0, rainfall72hMm: 0, nearestStation: null, latestObservedAt: null };
  }
  const stations = new Map<
    string,
    { name: string; lat: number; lng: number; sum72: number; sum24: number; latest: Date }
  >();
  const cutoff24 = Date.now() - 24 * 3600_000;
  for (const o of obs) {
    let s = stations.get(o.stationCode);
    if (!s) {
      s = { name: o.stationName, lat: o.lat, lng: o.lng, sum72: 0, sum24: 0, latest: o.observedAt };
      stations.set(o.stationCode, s);
    }
    s.sum72 += o.rainfallMm;
    if (o.observedAt.getTime() >= cutoff24) s.sum24 += o.rainfallMm;
    if (o.observedAt > s.latest) s.latest = o.observedAt;
  }
  const stationList = [...stations.entries()].map(([code, s]) => ({
    code,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    sum24: s.sum24,
    sum72: s.sum72,
    latest: s.latest,
  }));
  const nearest = stationList
    .map((s) => ({ s, d: distanceM(p, s) }))
    .sort((a, b) => a.d - b.d)[0];
  const sum24 = idwInterpolate(
    p,
    stationList.map((s) => ({ lat: s.lat, lng: s.lng, value: s.sum24 }))
  );
  const sum72 = idwInterpolate(
    p,
    stationList.map((s) => ({ lat: s.lat, lng: s.lng, value: s.sum72 }))
  );
  return {
    rainfall24hMm: +sum24.toFixed(1),
    rainfall72hMm: +sum72.toFixed(1),
    nearestStation: nearest
      ? { code: nearest.s.code, name: nearest.s.name, distanceM: Math.round(nearest.d) }
      : null,
    latestObservedAt: latestOf(stationList)?.toISOString() ?? null,
  };
}

function latestOf(list: { latest: Date }[]): Date | null {
  return list.reduce<Date | null>((acc, s) => (!acc || s.latest > acc ? s.latest : acc), null);
}

export interface AssetWithContext {
  id: string;
  code: string;
  kind: string;
  name: string;
  agencyCode: string;
  jurisdictionId: string;
  conditionScore: number;
  distanceM: number;
  monthsSinceMaintenance: number | null;
}

export async function getNearbyAssets(p: LatLng, radiusM = 250): Promise<AssetWithContext[]> {
  const [assets, maintenance] = await Promise.all([
    db.infrastructureAsset.findMany(),
    db.maintenanceAction.findMany({
      where: { status: "COMPLETED", kind: { in: ["DESILTING", "PUMP_SERVICE", "REPAIR", "GRADING", "INSPECTION"] } },
      orderBy: { performedAt: "desc" },
    }),
  ]);
  const lastMaint = new Map<string, Date>();
  for (const m of maintenance) {
    if (m.performedAt && !lastMaint.has(m.assetId)) lastMaint.set(m.assetId, m.performedAt);
  }
  return assets
    .map((a) => ({
      id: a.id,
      code: a.code,
      kind: a.kind,
      name: a.name,
      agencyCode: a.agencyCode,
      jurisdictionId: a.jurisdictionId,
      conditionScore: a.conditionScore,
      distanceM: Math.round(distanceM(p, { lat: a.lat, lng: a.lng })),
      monthsSinceMaintenance: lastMaint.has(a.id)
        ? monthsSince(lastMaint.get(a.id)!)
        : null,
    }))
    .filter((a) => a.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

export async function getHistoricalContext(p: LatLng, radiusM = 200) {
  const since = new Date(Date.now() - 365 * 8 * 24 * 3600_000); // 8y: robust to clock skew
  const incidents = await db.historicalIncident.findMany({
    where: { occurredOn: { gte: since } },
  });
  const nearby = incidents
    .map((i) => ({ ...i, distanceM: Math.round(distanceM(p, { lat: i.lat, lng: i.lng })) }))
    .filter((i) => i.distanceM <= radiusM)
    .sort((a, b) => b.occurredOn.getTime() - a.occurredOn.getTime());
  return {
    count: nearby.length,
    criticalCount: nearby.filter((i) => i.severity === "CRITICAL").length,
    lastOccurredOn: nearby[0]?.occurredOn ?? null,
    recent: nearby.slice(0, 5),
  };
}

export async function resolveJurisdiction(p: LatLng) {
  const js = await db.jurisdiction.findMany();
  for (const j of js) {
    try {
      const rings = JSON.parse(j.geometryJson) as [number, number][][];
      if (pointInPoly(p, rings)) return j;
    } catch {
      // malformed geometry: skip
    }
  }
  return null;
}

function pointInPoly(p: LatLng, rings: [number, number][][]): boolean {
  let inside = false;
  const ring = rings[0] ?? [];
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xk = ring[k][0], yk = ring[k][1];
    const intersect = yi > p.lat !== yk > p.lat && p.lng < ((xk - xi) * (p.lat - yi)) / (yk - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function monthsSince(date: Date): number {
  return Math.max(0, Math.round((Date.now() - date.getTime()) / (30.44 * 24 * 3600_000)));
}
