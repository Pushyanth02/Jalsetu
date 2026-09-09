import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, parseQuery } from "@/lib/api-helpers";
import { eventListQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET /api/events - filterable event list for map & queues.
export const GET = handler(async (req: NextRequest) => {
  const q = parseQuery(req, eventListQuerySchema);
  const where = {
    ...(q.status ? { status: q.status } : { status: { notIn: [] } }),
    ...(q.jurisdictionId ? { jurisdictionId: q.jurisdictionId } : {}),
    ...(q.riskBand ? { riskBand: q.riskBand } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.hours ? { lastActivityAt: { gte: new Date(Date.now() - q.hours * 3600_000) } } : {}),
    ...(q.minSeverity ? { severity: { gte: q.minSeverity } } : {}),
  };
  const [total, events] = await Promise.all([
    db.urbanEvent.count({ where }),
    db.urbanEvent.findMany({
      where,
      orderBy: [{ riskScore: "desc" }, { lastActivityAt: "desc" }],
      take: q.limit,
      skip: q.offset,
      select: {
        id: true, code: true, title: true, category: true, status: true, severity: true,
        lat: true, lng: true, locationText: true, jurisdictionId: true, agencyCode: true,
        firstReportedAt: true, lastActivityAt: true, reportCount: true, recurrenceCount: true,
        riskScore: true, riskBand: true, riskModelVersion: true, riskAssessedAt: true,
        confidence: true, confidenceNote: true, classificationProvider: true, modelVersion: true,
        rainfall24hMm: true, rainfall72hMm: true, closedAt: true, reopenedAt: true,
        groundTruthHotspotId: true, groundTruthAgencyCode: true, source: true, clusterKey: true,
      },
    }),
  ]);
  return ok(events, { total, limit: q.limit, offset: q.offset, dataLabel: "SYNTHETIC_DEMO + live events" });
});
