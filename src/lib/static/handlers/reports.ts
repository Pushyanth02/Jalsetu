import { mdb } from "../db";
import { ok, parseQuery, type HandlerResult } from "../envelope";
import { reportsListQuerySchema } from "@/lib/validation";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/reports route (src/app/api/reports/route.ts) for
// the in-browser API. Only the list endpoint lives here; the POST ingestion
// route is ported alongside the pipeline engine (agent 17-b). Semantics, honest
// labels and envelope shape preserved 1:1.

export async function listReports(ctx: HandlerCtx): Promise<HandlerResult> {
  const q = parseQuery(ctx.searchParams, reportsListQuerySchema);
  const where = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.hours ? { submittedAt: { gte: new Date(Date.now() - q.hours * 3600_000) } } : {}),
  };
  const [total, reports] = await Promise.all([
    mdb.citizenReport.count({ where }),
    mdb.citizenReport.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      take: q.limit,
      skip: q.offset,
      select: {
        id: true, publicRef: true, description: true, category: true, severityReported: true,
        lat: true, lng: true, addressText: true, submittedAt: true, channel: true, status: true,
        isDuplicate: true, urbanEventId: true, source: true,
        classificationProvider: true, classificationModel: true, classificationConfidence: true,
      },
    }),
  ]);
  return ok(
    reports.map((r) => ({
      ...r,
      classification: r.classificationProvider
        ? { provider: r.classificationProvider, modelId: r.classificationModel, confidence: r.classificationConfidence }
        : null,
    })),
    { total, limit: q.limit, offset: q.offset, dataLabel: "SYNTHETIC_DEMO + live submissions" }
  );
}

export const reportsRoutes: RouteDef[] = [
  { method: "GET", segments: ["reports"], handler: listReports },
];
