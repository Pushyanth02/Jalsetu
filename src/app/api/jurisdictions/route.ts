import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// GET /api/jurisdictions - pilot jurisdictions with GeoJSON polygons.
export const GET = handler(async () => {
  const js = await db.jurisdiction.findMany({ orderBy: { code: "asc" } });
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
});
