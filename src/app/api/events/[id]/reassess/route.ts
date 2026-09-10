import { NextRequest } from "next/server";
import { z } from "zod";
import { handler, ok, parseBody, requireRole, ApiError } from "@/lib/api-helpers";
import { reassessEvent } from "@/lib/engine/pipeline";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  useProvider: z.boolean().default(true), // include structured AI advisory
});

// POST /api/events/:id/reassess - recompute risk + optional AI advisory.
export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = requireRole(req, ["ANALYST", "AGENCY", "ADMIN"]);
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  const result = await reassessEvent(id, actor, body.useProvider);
  return ok({
    event: { id: result.event.id, code: result.event.code, riskScore: result.event.riskScore, riskBand: result.event.riskBand },
    risk: result.risk,
    advisory: result.advisory,
  });
});
