import { NextRequest } from "next/server";
import { handler, ok, ApiError, parseBody, requireRole } from "@/lib/api-helpers";
import { eventMergeSchema } from "@/lib/validation";
import { mergeEvents } from "@/lib/engine/pipeline";

export const dynamic = "force-dynamic";

// POST /api/events/:id/merge - merge a duplicate event into this one.
export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = requireRole(req, ["ANALYST", "AGENCY", "ADMIN"]);
  const { id } = await ctx.params;
  const body = await parseBody(req, eventMergeSchema);
  const merged = await mergeEvents(id, body.duplicateEventId, body.rationale, actor);
  return ok({ merged: { id: merged.id, code: merged.code, reportCount: merged.reportCount, recurrenceCount: merged.recurrenceCount } });
});
