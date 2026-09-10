import { z } from "zod";
import { mdb } from "../db";
import { ok, parseBody, requireRole, ApiError, type HandlerResult } from "../envelope";
import { verifySchema, assignSchema, actionCreateSchema, eventMergeSchema } from "@/lib/validation";
import { audit } from "../instrument";
import { VERIFICATION_STAGES, type VerificationStage } from "@/lib/types";
import { reassessEvent, mergeEvents } from "../engine/pipeline";
import { ROUTING_RULE_VERSION } from "../engine/responsibility";
import type { HandlerCtx, RouteDef } from "../router";

// Ports of the former event mutation routes for the in-browser API:
//   POST/PUT /api/events/:id/verify      (src/app/api/events/[id]/verify/route.ts)
//   POST      /api/events/:id/reassess   (src/app/api/events/[id]/reassess/route.ts)
//   POST      /api/events/:id/assign     (src/app/api/events/[id]/assign/route.ts)
//   POST/PUT  /api/events/:id/actions    (src/app/api/events/[id]/actions/route.ts)
//   POST      /api/events/:id/merge      (src/app/api/events/[id]/merge/route.ts)
//   GET       /api/events/:id/responsibility (src/app/api/events/[id]/responsibility/route.ts - GET in the source)
// Semantics preserved 1:1: role gates (403), 404 NOT_FOUND, 409 stage conflicts,
// 201 creation statuses, audit entries, honest labels. Only changes beyond the
// import swaps: `await ctx.params` → `ctx.pathParams.id`, Prisma schema
// @default(now()) fields are set explicitly on create (static db applies no
// schema defaults), and optional include fields are read with `?? []` for the
// typed static rows.

// POST /api/events/:id/verify - field verification workflow transitions:
// ASSIGNED → DISPATCHED → OBSERVED → EVIDENCE_UPLOADED → ACTION_RECORDED →
// VERIFIED → CLOSED. Supports photos, reopen reason, audit logging.
export async function verifyStage(ctx: HandlerCtx): Promise<HandlerResult> {
  const actor = requireRole(ctx, ["AGENCY", "FIELD_TEAM", "ANALYST", "ADMIN"]);
  const id = ctx.pathParams.id;
  const body = parseBody(ctx.body, verifySchema);

  const event = await mdb.urbanEvent.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);

  // ordered stage validation (reopening handled separately below)
  if (body.stage !== "CLOSED") {
    const order = VERIFICATION_STAGES as readonly string[];
    const past = await mdb.verification.findMany({ where: { eventId: event.id } });
    const reached = new Set(past.map((v) => v.stage));
    const stageIdx = order.indexOf(body.stage);
    if (!reached.has(body.stage)) {
      const prev = order[stageIdx - 1];
      if (prev && !reached.has(prev)) {
        throw new ApiError(409, "STAGE_OUT_OF_ORDER", `Stage ${prev} must be recorded before ${body.stage}`);
      }
    }
  }

  let evidenceId: string | null = null;
  if (body.photoDataUrl) {
    const ev = await mdb.evidence.create({
      data: {
        urbanEventId: event.id,
        kind: "FIELD_PHOTO",
        caption: body.photoCaption ?? `Field verification: ${body.stage.toLowerCase().replace(/_/g, " ")}`,
        content: body.photoDataUrl,
        mediaType: body.photoDataUrl.slice(5, body.photoDataUrl.indexOf(";")) || "image/*",
        capturedAt: new Date(),
        capturedBy: "FIELD_TEAM",
        lat: event.lat,
        lng: event.lng,
        source: "FIELD_UI",
        createdAt: new Date(), // prisma @default(now()) translated (static db has no schema defaults)
      },
    });
    evidenceId = ev.id;
  }

  const verification = await mdb.verification.create({
    data: {
      eventId: event.id,
      stage: body.stage,
      observedSeverity: body.observedSeverity ?? undefined,
      waterDepthCm: body.waterDepthCm ?? undefined,
      notes: body.notes ?? undefined,
      verifiedBy: actor,
      beforeEvidenceId: body.stage === "EVIDENCE_UPLOADED" ? evidenceId : undefined,
      afterEvidenceId: body.stage === "ACTION_RECORDED" ? evidenceId : undefined,
      verifiedAt: new Date(), // prisma @default(now()) translated
      createdAt: new Date(), // prisma @default(now()) translated
    },
  });

  const now = new Date();
  const statusByStage: Partial<Record<VerificationStage, string>> = {
    DISPATCHED: "ASSIGNED",
    OBSERVED: "IN_PROGRESS",
    EVIDENCE_UPLOADED: "IN_PROGRESS",
    ACTION_RECORDED: "IN_PROGRESS",
    VERIFIED: "VERIFIED",
    CLOSED: "CLOSED",
  };
  const newStatus = statusByStage[body.stage as VerificationStage];

  await mdb.urbanEvent.update({
    where: { id: event.id },
    data: {
      ...(newStatus ? { status: newStatus } : {}),
      ...(body.stage === "CLOSED" ? { closedAt: now } : {}),
      ...(body.observedSeverity ? { severity: Math.max(event.severity, { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[body.observedSeverity]) } : {}),
      lastActivityAt: now,
    },
  });

  if (body.stage === "CLOSED") {
    await mdb.actionItem.updateMany({
      where: { eventId: event.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
      data: { status: "COMPLETED", completedAt: now },
    });
    await mdb.responsibilityLink.updateMany({ where: { eventId: event.id }, data: { status: "CLOSED" } });
  }

  await audit({
    actor,
    action: `VERIFICATION_${body.stage}`,
    entityType: "UrbanEvent",
    entityId: event.id,
    after: { stage: body.stage, depthCm: body.waterDepthCm ?? null, evidenceId },
    note: body.notes ?? undefined,
  });

  return ok(
    {
      verification: { id: verification.id, stage: verification.stage, verifiedAt: verification.verifiedAt },
      eventStatus: newStatus ?? event.status,
      evidenceId,
    },
    undefined,
    201
  );
}

// PUT /api/events/:id/verify - manual reopen for agency operators
// (normal reopening happens through recurrence reports in the pipeline).
export async function reopenEvent(ctx: HandlerCtx): Promise<HandlerResult> {
  const actor = requireRole(ctx, ["AGENCY", "ANALYST", "ADMIN"]);
  const id = ctx.pathParams.id;
  const body = parseBody(
    ctx.body,
    z.object({ reopenReason: z.string().trim().min(4).max(400) })
  );
  const event = await mdb.urbanEvent.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);

  const reopened = await mdb.urbanEvent.update({
    where: { id: event.id },
    data: {
      status: "REOPENED",
      reopenedAt: new Date(),
      closedAt: null,
      recurrenceCount: event.recurrenceCount + 1,
      lastActivityAt: new Date(),
    },
  });
  await mdb.verification.create({
    data: {
      eventId: event.id,
      stage: "ASSIGNED",
      notes: `Reopened by ${actor}: ${body.reopenReason}`,
      verifiedBy: actor,
      reopenReason: body.reopenReason,
      verifiedAt: new Date(), // prisma @default(now()) translated
      createdAt: new Date(), // prisma @default(now()) translated
    },
  });
  await audit({ actor, action: "EVENT_REOPENED", entityType: "UrbanEvent", entityId: event.id, note: body.reopenReason });
  return ok({ event: { id: reopened.id, code: reopened.code, status: reopened.status, recurrenceCount: reopened.recurrenceCount } });
}

// --- reassess ---------------------------------------------------------------

const reassessBodySchema = z.object({
  useProvider: z.boolean().default(true), // include structured AI advisory
});

// POST /api/events/:id/reassess - recompute risk + optional AI advisory.
export async function reassess(ctx: HandlerCtx): Promise<HandlerResult> {
  const actor = requireRole(ctx, ["ANALYST", "AGENCY", "ADMIN"]);
  const id = ctx.pathParams.id;
  const body = parseBody(ctx.body, reassessBodySchema);
  const result = await reassessEvent(id, actor, body.useProvider);
  return ok({
    event: { id: result.event.id, code: result.event.code, riskScore: result.event.riskScore, riskBand: result.event.riskBand },
    risk: result.risk,
    advisory: result.advisory,
  });
}

// --- assign -----------------------------------------------------------------

// POST /api/events/:id/assign - assign/escalate responsibility to an agency.
export async function assign(ctx: HandlerCtx): Promise<HandlerResult> {
  const actor = requireRole(ctx, ["ANALYST", "AGENCY", "ADMIN"]);
  const id = ctx.pathParams.id;
  const body = parseBody(ctx.body, assignSchema);

  const event = await mdb.urbanEvent.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);
  if (!event.jurisdictionId) throw new ApiError(409, "NO_JURISDICTION", "Event has no resolved jurisdiction; cannot assign");
  const agency = await mdb.agency.findUnique({ where: { code: body.agencyCode } });
  if (!agency) throw new ApiError(404, "NOT_FOUND", `Agency ${body.agencyCode} not found`);

  const link = await mdb.responsibilityLink.create({
    data: {
      eventId: event.id,
      jurisdictionId: event.jurisdictionId,
      agencyCode: body.agencyCode,
      role: body.role,
      status: "ACTIVE",
      reason: body.note ?? `Manually assigned by ${actor}`,
      source: "MANUAL",
      assignedAt: new Date(), // prisma @default(now()) translated (static db has no schema defaults)
    },
  });

  // assign pending recommended actions to this agency when primary
  if (body.role === "PRIMARY") {
    await mdb.actionItem.updateMany({
      where: { eventId: event.id, status: "RECOMMENDED" },
      data: { status: "ASSIGNED", agencyCode: body.agencyCode, assignedAt: new Date(), assignedTo: body.note ? `${actor}: ${body.note}`.slice(0, 80) : actor },
    });
    await mdb.urbanEvent.update({
      where: { id: event.id },
      data: { status: event.status === "TRIAGED" || event.status === "DETECTED" ? "ASSIGNED" : event.status, agencyCode: body.agencyCode, lastActivityAt: new Date() },
    });
  } else if (body.role === "ESCALATION") {
    await mdb.urbanEvent.update({ where: { id: event.id }, data: { lastActivityAt: new Date() } });
  }

  await audit({
    actor,
    action: body.role === "ESCALATION" ? "ESCALATED" : "ASSIGNED",
    entityType: "UrbanEvent",
    entityId: event.id,
    after: { agency: body.agencyCode, role: body.role, note: body.note ?? null },
  });

  return ok({ link: { id: link.id, agencyCode: link.agencyCode, role: link.role, status: link.status } }, undefined, 201);
}

// --- actions ----------------------------------------------------------------

const updateSchema = z.object({
  actionId: z.string().min(1),
  status: z.enum(["ASSIGNED", "IN_PROGRESS", "COMPLETED", "FAILED"]),
  outcome: z.string().trim().max(400).optional(),
});

// POST /api/events/:id/actions - create a new action item.
export async function createAction(ctx: HandlerCtx): Promise<HandlerResult> {
  const actor = requireRole(ctx, ["ANALYST", "AGENCY", "ADMIN"]);
  const id = ctx.pathParams.id;
  const body = parseBody(ctx.body, actionCreateSchema);

  const event = await mdb.urbanEvent.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);

  const action = await mdb.actionItem.create({
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
      createdAt: new Date(), // prisma @default(now()) translated (static db has no schema defaults)
    },
  });
  await mdb.urbanEvent.update({
    where: { id: event.id },
    data: {
      status: event.status === "TRIAGED" || event.status === "DETECTED" ? "ASSIGNED" : event.status,
      lastActivityAt: new Date(),
    },
  });
  await audit({ actor, action: "ACTION_CREATED", entityType: "UrbanEvent", entityId: event.id, after: { actionId: action.id, kind: action.kind } });
  return ok({ action }, undefined, 201);
}

// PUT /api/events/:id/actions - update action status (progress/complete/fail).
export async function updateAction(ctx: HandlerCtx): Promise<HandlerResult> {
  const actor = requireRole(ctx, ["ANALYST", "AGENCY", "ADMIN", "FIELD_TEAM"]);
  const id = ctx.pathParams.id;
  const body = parseBody(ctx.body, updateSchema);

  const event = await mdb.urbanEvent.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);

  const action = await mdb.actionItem.findFirst({ where: { id: body.actionId, eventId: event.id } });
  if (!action) throw new ApiError(404, "NOT_FOUND", `Action ${body.actionId} not found on this event`);

  const updated = await mdb.actionItem.update({
    where: { id: action.id },
    data: {
      status: body.status,
      outcome: body.outcome ?? action.outcome,
      completedAt: body.status === "COMPLETED" ? new Date() : action.completedAt,
      assignedAt: body.status === "ASSIGNED" ? new Date() : action.assignedAt,
    },
  });
  await mdb.urbanEvent.update({ where: { id: event.id }, data: { lastActivityAt: new Date() } });
  if (body.status === "IN_PROGRESS") {
    await mdb.urbanEvent.update({ where: { id: event.id }, data: { status: "IN_PROGRESS" } });
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
}

// --- merge ------------------------------------------------------------------

// POST /api/events/:id/merge - merge a duplicate event into this one.
export async function merge(ctx: HandlerCtx): Promise<HandlerResult> {
  const actor = requireRole(ctx, ["ANALYST", "AGENCY", "ADMIN"]);
  const id = ctx.pathParams.id;
  const body = parseBody(ctx.body, eventMergeSchema);
  const merged = await mergeEvents(id, body.duplicateEventId, body.rationale, actor);
  return ok({ merged: { id: merged.id, code: merged.code, reportCount: merged.reportCount, recurrenceCount: merged.recurrenceCount } });
}

// --- responsibility (GET in the source route; ported with the source method) --

// GET /api/events/:id/responsibility - event → asset → jurisdiction → agency →
// action → escalation chain with routing reasons.
export async function eventResponsibility(ctx: HandlerCtx): Promise<HandlerResult> {
  const id = ctx.pathParams.id;
  const event = await mdb.urbanEvent.findFirst({
    where: { OR: [{ id }, { code: id }] },
    include: {
      jurisdiction: true,
      links: {
        orderBy: [{ role: "asc" }, { assignedAt: "asc" }],
        include: { asset: { select: { code: true, name: true, kind: true, conditionScore: true, agencyCode: true } } },
      },
      actions: { orderBy: { priority: "desc" } },
    },
  });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);

  const agencies = await mdb.agency.findMany();
  const agencyByCode = new Map(agencies.map((a) => [a.code, a]));

  return ok({
    event: { id: event.id, code: event.code, title: event.title, status: event.status, riskBand: event.riskBand, severity: event.severity },
    jurisdiction: event.jurisdiction
      ? { id: event.jurisdiction.id, code: event.jurisdiction.code, name: event.jurisdiction.name, kind: event.jurisdiction.kind, agencyCode: event.jurisdiction.agencyCode }
      : null,
    chain: [
      {
        level: "EVENT",
        ref: event.code,
        label: event.title,
        detail: `${event.reportCount} report(s), risk ${event.riskScore} (${event.riskBand}), severity ${event.severity}/5`,
      },
      {
        level: "JURISDICTION",
        ref: event.jurisdiction?.code ?? "-",
        label: event.jurisdiction?.name ?? "Outside pilot jurisdictions",
        detail: `administered by ${event.jurisdiction?.agencyCode ?? "n/a"}`,
      },
      ...(event.links ?? []).map((l) => ({
        level: l.role === "ESCALATION" ? "ESCALATION" : l.role === "SUPPORT" ? "SUPPORT" : "AGENCY",
        ref: l.agencyCode,
        label: agencyByCode.get(l.agencyCode)?.name ?? l.agencyCode,
        detail: l.reason ?? "",
        asset: l.asset ? { code: l.asset.code, name: l.asset.name, kind: l.asset.kind, condition: l.asset.conditionScore } : null,
        status: l.status,
        assignedAt: l.assignedAt,
        hotline: agencyByCode.get(l.agencyCode)?.hotline ?? null,
      })),
    ],
    actions: (event.actions ?? []).map((a) => ({
      id: a.id, kind: a.kind, instruction: a.instruction, priority: a.priority, status: a.status,
      agencyCode: a.agencyCode, assignedTo: a.assignedTo, assignedAt: a.assignedAt, dueAt: a.dueAt,
      completedAt: a.completedAt, outcome: a.outcome,
    })),
    ruleVersion: ROUTING_RULE_VERSION,
    groundTruth: event.groundTruthAgencyCode
      ? { agency: event.groundTruthAgencyCode, note: "Seeded ground-truth responsible agency (synthetic, for routing evaluation)" }
      : null,
  });
}

// NOTE on segment placeholders: the shipped router (../router.ts) recognizes
// the literal ":param" as the dynamic segment (captured into ctx.pathParams.id).
// The task brief wrote these routes with ":id" notation; ":param" is used here
// so the routes actually match. Flagged for the lead in the worklog.

export const mutationRoutes: RouteDef[] = [
  { method: "POST", segments: ["events", ":param", "verify"], handler: verifyStage },
  { method: "PUT", segments: ["events", ":param", "verify"], handler: reopenEvent },
  { method: "POST", segments: ["events", ":param", "reassess"], handler: reassess },
  { method: "POST", segments: ["events", ":param", "assign"], handler: assign },
  { method: "POST", segments: ["events", ":param", "actions"], handler: createAction },
  { method: "PUT", segments: ["events", ":param", "actions"], handler: updateAction },
  { method: "POST", segments: ["events", ":param", "merge"], handler: merge },
  // Source route (src/app/api/events/[id]/responsibility/route.ts) defines GET
  // only; registered with the source method so the responsibility view works
  // unchanged. (The task brief said POST - flagged in the worklog/report.)
  { method: "GET", segments: ["events", ":param", "responsibility"], handler: eventResponsibility },
];
