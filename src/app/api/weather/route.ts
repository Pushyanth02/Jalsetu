import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, parseQuery } from "@/lib/api-helpers";
import { weatherQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET /api/weather - synthetic rainfall observations + station summaries.
export const GET = handler(async (req: NextRequest) => {
  const q = parseQuery(req, weatherQuerySchema);
  const since = new Date(Date.now() - q.hours * 3600_000);
  const obs = await db.weatherObservation.findMany({
    where: { observedAt: { gte: since } },
    orderBy: { observedAt: "asc" },
  });

  const stations = new Map<string, { code: string; name: string; lat: number; lng: number; sum: number; slots: number; latest: Date | null }>();
  for (const o of obs) {
    let s = stations.get(o.stationCode);
    if (!s) {
      s = { code: o.stationCode, name: o.stationName, lat: o.lat, lng: o.lng, sum: 0, slots: 0, latest: null };
      stations.set(o.stationCode, s);
    }
    s.sum += o.rainfallMm;
    s.slots += 1;
    if (!s.latest || o.observedAt > s.latest) s.latest = o.observedAt;
  }

  return ok({
    stations: [...stations.values()].map((s) => ({
      code: s.code, name: s.name, lat: s.lat, lng: s.lng,
      totalMm: +s.sum.toFixed(1),
      avgMmPer3h: +(s.sum / Math.max(1, s.slots)).toFixed(1),
      latestObservedAt: s.latest,
      dataLabel: "SYNTHETIC_DEMO (modelled monsoon storm)",
    })),
    series: obs.map((o) => ({
      stationCode: o.stationCode, t: o.observedAt.toISOString(), mm: o.rainfallMm,
    })),
    windowHours: q.hours,
  });
});
