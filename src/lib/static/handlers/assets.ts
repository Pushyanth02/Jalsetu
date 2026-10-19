import { z } from "zod";
import { mdb } from "../db";
import { ok, parseQuery, type HandlerResult } from "../envelope";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/assets route (src/app/api/assets/route.ts) for
// the in-browser API. Infrastructure asset registry (GeoJSON-ready). Semantics
// and honest labels preserved 1:1.

const querySchema = z.object({
  jurisdictionId: z.string().optional(),
  kind: z.string().optional(),
});

export async function assets(ctx: HandlerCtx): Promise<HandlerResult> {
  const q = parseQuery(ctx.searchParams, querySchema);
  const assets = await mdb.infrastructureAsset.findMany({
    where: {
      ...(q.jurisdictionId ? { jurisdictionId: q.jurisdictionId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
    },
    include: { jurisdiction: { select: { code: true, name: true } } },
  });
  return ok(
    assets.map((a) => ({
      id: a.id, code: a.code, kind: a.kind, name: a.name, agencyCode: a.agencyCode,
      lat: a.lat, lng: a.lng, conditionScore: a.conditionScore, lastInspectedAt: a.lastInspectedAt,
      path: a.pathJson ? JSON.parse(a.pathJson) : null,
      jurisdiction: a.jurisdiction,
      dataLabel: "SYNTHETIC_DEMO",
    })),
    { total: assets.length }
  );
}

export const assetsRoutes: RouteDef[] = [
  { method: "GET", segments: ["assets"], handler: assets },
];
