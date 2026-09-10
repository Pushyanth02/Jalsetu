import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api-helpers";
import { ROUTING_RULE_VERSION } from "@/lib/engine/responsibility";

export const dynamic = "force-dynamic";

// GET /api/events/:id/responsibility - event → asset → jurisdiction → agency →
// action → escalation chain with routing reasons.
export const GET = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const event = await db.urbanEvent.findFirst({
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

  const agencies = await db.agency.findMany();
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
      ...event.links.map((l) => ({
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
    actions: event.actions.map((a) => ({
      id: a.id, kind: a.kind, instruction: a.instruction, priority: a.priority, status: a.status,
      agencyCode: a.agencyCode, assignedTo: a.assignedTo, assignedAt: a.assignedAt, dueAt: a.dueAt,
      completedAt: a.completedAt, outcome: a.outcome,
    })),
    ruleVersion: ROUTING_RULE_VERSION,
    groundTruth: event.groundTruthAgencyCode
      ? { agency: event.groundTruthAgencyCode, note: "Seeded ground-truth responsible agency (synthetic, for routing evaluation)" }
      : null,
  });
});
