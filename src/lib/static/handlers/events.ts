import { mdb } from "../db";
import { ok, parseQuery, type HandlerResult } from "../envelope";
import { eventListQuerySchema } from "@/lib/validation";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/events route (src/app/api/events/route.ts) for
// the in-browser API. Semantics preserved 1:1: same filters, same ordering,
// same envelope meta and honest data labels. This file is the reference
// exemplar for all other static handler ports.

export async function listEvents(ctx: HandlerCtx): Promise<HandlerResult> {
  const q = parseQuery(ctx.searchParams, eventListQuerySchema);
  const where = {
    ...(q.status ? { status: q.status } : { status: { notIn: [] } }),
    ...(q.jurisdictionId ? { jurisdictionId: q.jurisdictionId } : {}),
    ...(q.riskBand ? { riskBand: q.riskBand } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.hours ? { lastActivityAt: { gte: new Date(Date.now() - q.hours * 3600_000) } } : {}),
    ...(q.minSeverity ? { severity: { gte: q.minSeverity } } : {}),
  };
  const [total, events] = await Promise.all([
    mdb.urbanEvent.count({ where }),
    mdb.urbanEvent.findMany({
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
}

export const eventsRoutes: RouteDef[] = [
  { method: "GET", segments: ["events"], handler: listEvents },
];
