import { mdb } from "../db";
import { ok, ApiError, type HandlerResult } from "../envelope";
import { fromJson } from "../instrument";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/reports/:id route (src/app/api/reports/[id]/route.ts)
// for the in-browser API. Full report detail by internal id or public tracking
// ref; the reporter phone is masked exactly as the server did. Semantics and
// honest labels preserved 1:1.

export async function reportDetail(ctx: HandlerCtx): Promise<HandlerResult> {
  const id = ctx.pathParams.id;
  const report = await mdb.citizenReport.findFirst({
    where: { OR: [{ id }, { publicRef: id }] },
    include: {
      evidence: true,
      urbanEvent: { select: { id: true, code: true, title: true, status: true, riskBand: true, riskScore: true } },
    },
  });
  if (!report) throw new ApiError(404, "NOT_FOUND", `Report ${id} not found`);
  const classification = fromJson<Record<string, unknown> | null>(report.classificationJson, null);
  return ok({
    ...report,
    reporterPhone: report.reporterPhone ? "(hashed, on file)" : null,
    classification,
  });
}

export const reportDetailRoutes: RouteDef[] = [
  { method: "GET", segments: ["reports", ":id"], handler: reportDetail },
];
