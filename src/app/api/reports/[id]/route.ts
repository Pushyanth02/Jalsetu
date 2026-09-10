import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api-helpers";
import { fromJson } from "@/lib/json";

export const dynamic = "force-dynamic";

// GET /api/reports/:id - full report detail (by internal id or public tracking ref).
export const GET = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const report = await db.citizenReport.findFirst({
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
});
