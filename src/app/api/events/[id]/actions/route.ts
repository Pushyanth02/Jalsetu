import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, parseBody, requireRole, ApiError } from "@/lib/api-helpers";
import { actionCreateSchema } from "@/lib/validation";
import { audit } from "@/lib/json";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  actionId: z.string().min(1),
  status: z.enum(["ASSIGNED", "IN_PROGRESS", "COMPLETED", "FAILED"]),
  outcome: z.string().trim().max(400).optional(),
});

// POST /api/events/:id/actions - create a new action item.
export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = requireRole(req, ["ANALYST", "AGENCY", "ADMIN"]);
  const { id } = await ctx.params;
  const body = await parseBody(req, actionCreateSchema);

  const event = await db.urbanEvent.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);

  const action = await db.actionItem.create({
    data: {
      eventId: event.id,
      kind: body.kind,
      instruction: body.instruction,
      priority: body.priority,
      status: "ASSIGNED",
      agencyCode: body.agencyCode ?? event.agencyCode ?? undefined,
      assetId: body.assetId ?? undefined,
      assignedTo: body.assignedTo ?? actor,
      assignedAt: new Date(),
      dueAt: body.dueHours ? new Date(Date.now() + body.dueHours * 3600_000) : undefined,
    },
  });
  await db.urbanEvent.update({
    where: { id: event.id },
    data: {
      status: event.status === "TRIAGED" || event.status === "DETECTED" ? "ASSIGNED" : event.status,
      lastActivityAt: new Date(),
    },
  });
  await audit({ actor, action: "ACTION_CREATED", entityType: "UrbanEvent", entityId: event.id, after: { actionId: action.id, kind: action.kind } });
  return ok({ action }, undefined, 201);
});

// PUT /api/events/:id/actions - update action status (progress/complete/fail).
export const PUT = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = requireRole(req, ["ANALYST", "AGENCY", "ADMIN", "FIELD_TEAM"]);
  const { id } = await ctx.params;
  const body = await parseBody(req, updateSchema);

  const event = await db.urbanEvent.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);

  const action = await db.actionItem.findFirst({ where: { id: body.actionId, eventId: event.id } });
  if (!action) throw new ApiError(404, "NOT_FOUND", `Action ${body.actionId} not found on this event`);

  const updated = await db.actionItem.update({
    where: { id: action.id },
    data: {
      status: body.status,
      outcome: body.outcome ?? action.outcome,
      completedAt: body.status === "COMPLETED" ? new Date() : action.completedAt,
      assignedAt: body.status === "ASSIGNED" ? new Date() : action.assignedAt,
    },
  });
  await db.urbanEvent.update({ where: { id: event.id }, data: { lastActivityAt: new Date() } });
  if (body.status === "IN_PROGRESS") {
    await db.urbanEvent.update({ where: { id: event.id }, data: { status: "IN_PROGRESS" } });
  }
  await audit({
    actor,
    action: `ACTION_${body.status}`,
    entityType: "UrbanEvent",
    entityId: event.id,
    before: { status: action.status },
    after: { status: body.status, outcome: body.outcome ?? null },
  });
  return ok({ action: updated });
});
