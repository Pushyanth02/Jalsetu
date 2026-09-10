import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, parseBody, requireRole, ApiError } from "@/lib/api-helpers";
import { assignSchema } from "@/lib/validation";
import { audit } from "@/lib/json";

export const dynamic = "force-dynamic";

// POST /api/events/:id/assign - assign/escalate responsibility to an agency.
export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = requireRole(req, ["ANALYST", "AGENCY", "ADMIN"]);
  const { id } = await ctx.params;
  const body = await parseBody(req, assignSchema);

  const event = await db.urbanEvent.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);
  if (!event.jurisdictionId) throw new ApiError(409, "NO_JURISDICTION", "Event has no resolved jurisdiction; cannot assign");
  const agency = await db.agency.findUnique({ where: { code: body.agencyCode } });
  if (!agency) throw new ApiError(404, "NOT_FOUND", `Agency ${body.agencyCode} not found`);

  const link = await db.responsibilityLink.create({
    data: {
      eventId: event.id,
      jurisdictionId: event.jurisdictionId,
      agencyCode: body.agencyCode,
      role: body.role,
      status: "ACTIVE",
      reason: body.note ?? `Manually assigned by ${actor}`,
      source: "MANUAL",
    },
  });

  // assign pending recommended actions to this agency when primary
  if (body.role === "PRIMARY") {
    await db.actionItem.updateMany({
      where: { eventId: event.id, status: "RECOMMENDED" },
      data: { status: "ASSIGNED", agencyCode: body.agencyCode, assignedAt: new Date(), assignedTo: body.note ? `${actor}: ${body.note}`.slice(0, 80) : actor },
    });
    await db.urbanEvent.update({
      where: { id: event.id },
      data: { status: event.status === "TRIAGED" || event.status === "DETECTED" ? "ASSIGNED" : event.status, agencyCode: body.agencyCode, lastActivityAt: new Date() },
    });
  } else if (body.role === "ESCALATION") {
    await db.urbanEvent.update({ where: { id: event.id }, data: { lastActivityAt: new Date() } });
  }

  await audit({
    actor,
    action: body.role === "ESCALATION" ? "ESCALATED" : "ASSIGNED",
    entityType: "UrbanEvent",
    entityId: event.id,
    after: { agency: body.agencyCode, role: body.role, note: body.note ?? null },
  });

  return ok({ link: { id: link.id, agencyCode: link.agencyCode, role: link.role, status: link.status } }, undefined, 201);
});
