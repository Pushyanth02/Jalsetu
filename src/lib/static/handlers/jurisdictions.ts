import { mdb } from "../db";
import { ok, type HandlerResult } from "../envelope";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/jurisdictions route
// (src/app/api/jurisdictions/route.ts) for the in-browser API. Pilot
// jurisdictions with GeoJSON polygons and the honest approximate-boundaries
// label. Semantics preserved 1:1.

export async function jurisdictions(_ctx: HandlerCtx): Promise<HandlerResult> {
  const js = await mdb.jurisdiction.findMany({ orderBy: { code: "asc" } });
  return ok(
    js.map((j) => ({
      id: j.id,
      code: j.code,
      name: j.name,
      kind: j.kind,
      agencyCode: j.agencyCode,
      pilot: j.pilot,
      centroid: { lat: j.centroidLat, lng: j.centroidLng },
      geometry: { type: "Polygon", coordinates: JSON.parse(j.geometryJson) },
      dataLabel: "SYNTHETIC_DEMO (approximate pilot boundaries)",
    }))
  );
}

export const jurisdictionsRoutes: RouteDef[] = [
  { method: "GET", segments: ["jurisdictions"], handler: jurisdictions },
];
