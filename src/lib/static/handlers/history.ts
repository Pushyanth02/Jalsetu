import { z } from "zod";
import { mdb } from "../db";
import { ok, parseQuery, type HandlerResult } from "../envelope";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/history route (src/app/api/history/route.ts) for
// the in-browser API. Historical incident archive with the honest
// public-reporting-patterns label. Semantics preserved 1:1.

const querySchema = z.object({
  jurisdictionId: z.string().optional(),
  years: z.coerce.number().int().min(1).max(6).optional(),
});

export async function history(ctx: HandlerCtx): Promise<HandlerResult> {
  const q = parseQuery(ctx.searchParams, querySchema);
  const since = q.years ? new Date(Date.now() - q.years * 365 * 24 * 3600_000) : new Date(Date.now() - 6 * 365 * 24 * 3600_000);
  // NOTE: the static db has no historicalIncident->jurisdiction relation registered
  // (contract gap), so the source's `include: { jurisdiction: { select: { code, name } } }`
  // is reproduced with an explicit join below - the response shape is identical.
  const [incidents, js] = await Promise.all([
    mdb.historicalIncident.findMany({
      where: {
        occurredOn: { gte: since },
        ...(q.jurisdictionId ? { jurisdictionId: q.jurisdictionId } : {}),
      },
      orderBy: { occurredOn: "desc" },
    }),
    mdb.jurisdiction.findMany({ select: { id: true, code: true, name: true } }),
  ]);
  const jurisdictionById = new Map(js.map((j) => [j.id, { code: j.code, name: j.name }]));
  return ok(
    incidents.map((i) => ({
      id: i.id, lat: i.lat, lng: i.lng, occurredOn: i.occurredOn, severity: i.severity,
      durationHours: i.durationHours, waterDepthCm: i.waterDepthCm, reportedVia: i.reportedVia,
      jurisdiction: jurisdictionById.get(i.jurisdictionId) ?? null,
      dataLabel: "SYNTHETIC_DEMO (modelled on public reporting patterns)",
    })),
    { total: incidents.length }
  );
}

export const historyRoutes: RouteDef[] = [
  { method: "GET", segments: ["history"], handler: history },
];
