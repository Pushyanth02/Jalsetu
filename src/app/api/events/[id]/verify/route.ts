import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, parseBody, requireRole, ApiError } from "@/lib/api-helpers";
import { verifySchema } from "@/lib/validation";
import { z } from "zod";
import { audit } from "@/lib/json";
import { VERIFICATION_STAGES, type VerificationStage } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST /api/events/:id/verify - field verification workflow transitions:
// ASSIGNED → DISPATCHED → OBSERVED → EVIDENCE_UPLOADED → ACTION_RECORDED →
// VERIFIED → CLOSED. Supports photos, reopen reason, audit logging.
export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = requireRole(req, ["AGENCY", "FIELD_TEAM", "ANALYST", "ADMIN"]);
  const { id } = await ctx.params;
  const body = await parseBody(req, verifySchema);

  const event = await db.urbanEvent.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);

  // ordered stage validation (reopening handled separately below)
  if (body.stage !== "CLOSED") {
    const order = VERIFICATION_STAGES as readonly string[];
    const past = await db.verification.findMany({ where: { eventId: event.id } });
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
    const ev = await db.evidence.create({
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
      },
    });
    evidenceId = ev.id;
  }

  const verification = await db.verification.create({
    data: {
      eventId: event.id,
      stage: body.stage,
      observedSeverity: body.observedSeverity ?? undefined,
      waterDepthCm: body.waterDepthCm ?? undefined,
      notes: body.notes ?? undefined,
      verifiedBy: actor,
      beforeEvidenceId: body.stage === "EVIDENCE_UPLOADED" ? evidenceId : undefined,
      afterEvidenceId: body.stage === "ACTION_RECORDED" ? evidenceId : undefined,
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

  await db.urbanEvent.update({
    where: { id: event.id },
    data: {
      ...(newStatus ? { status: newStatus } : {}),
      ...(body.stage === "CLOSED" ? { closedAt: now } : {}),
      ...(body.observedSeverity ? { severity: Math.max(event.severity, { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[body.observedSeverity]) } : {}),
      lastActivityAt: now,
    },
  });

  if (body.stage === "CLOSED") {
    await db.actionItem.updateMany({
      where: { eventId: event.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
      data: { status: "COMPLETED", completedAt: now },
    });
    await db.responsibilityLink.updateMany({ where: { eventId: event.id }, data: { status: "CLOSED" } });
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
});

// PUT /api/events/:id/verify - manual reopen for agency operators
// (normal reopening happens through recurrence reports in the pipeline).
export const PUT = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = requireRole(req, ["AGENCY", "ANALYST", "ADMIN"]);
  const { id } = await ctx.params;
  const body = await parseBody(
    req,
    z.object({ reopenReason: z.string().trim().min(4).max(400) })
  );
  const event = await db.urbanEvent.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);

  const reopened = await db.urbanEvent.update({
    where: { id: event.id },
    data: {
      status: "REOPENED",
      reopenedAt: new Date(),
      closedAt: null,
      recurrenceCount: event.recurrenceCount + 1,
      lastActivityAt: new Date(),
    },
  });
  await db.verification.create({
    data: {
      eventId: event.id,
      stage: "ASSIGNED",
      notes: `Reopened by ${actor}: ${body.reopenReason}`,
      verifiedBy: actor,
      reopenReason: body.reopenReason,
    },
  });
  await audit({ actor, action: "EVENT_REOPENED", entityType: "UrbanEvent", entityId: event.id, note: body.reopenReason });
  return ok({ event: { id: reopened.id, code: reopened.code, status: reopened.status, recurrenceCount: reopened.recurrenceCount } });
});
