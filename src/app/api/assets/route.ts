import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, parseQuery } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  jurisdictionId: z.string().optional(),
  kind: z.string().optional(),
});

// GET /api/assets - infrastructure asset registry (GeoJSON-ready).
export const GET = handler(async (req: NextRequest) => {
  const q = parseQuery(req, querySchema);
  const assets = await db.infrastructureAsset.findMany({
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
});
