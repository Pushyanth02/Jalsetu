import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, parseQuery } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  jurisdictionId: z.string().optional(),
  years: z.coerce.number().int().min(1).max(6).optional(),
});

// GET /api/history - historical incident archive.
export const GET = handler(async (req: NextRequest) => {
  const q = parseQuery(req, querySchema);
  const since = q.years ? new Date(Date.now() - q.years * 365 * 24 * 3600_000) : new Date(Date.now() - 6 * 365 * 24 * 3600_000);
  const incidents = await db.historicalIncident.findMany({
    where: {
      occurredOn: { gte: since },
      ...(q.jurisdictionId ? { jurisdictionId: q.jurisdictionId } : {}),
    },
    orderBy: { occurredOn: "desc" },
    include: { jurisdiction: { select: { code: true, name: true } } },
  });
  return ok(
    incidents.map((i) => ({
      id: i.id, lat: i.lat, lng: i.lng, occurredOn: i.occurredOn, severity: i.severity,
      durationHours: i.durationHours, waterDepthCm: i.waterDepthCm, reportedVia: i.reportedVia,
      jurisdiction: i.jurisdiction,
      dataLabel: "SYNTHETIC_DEMO (modelled on public reporting patterns)",
    })),
    { total: incidents.length }
  );
});
