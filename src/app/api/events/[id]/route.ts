import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api-helpers";
import { fromJson, audit } from "@/lib/json";
import type { RiskFactor } from "@/lib/engine/risk";
import type { ClassificationOutput } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

// GET /api/events/:id - full event dossier: evidence, reports, risk, responsibility,
// actions, verification chain, audit history. This powers the event detail view.
export const GET = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const event = await db.urbanEvent.findFirst({
    where: { OR: [{ id }, { code: id }] },
    include: {
      jurisdiction: true,
      reports: {
        orderBy: { submittedAt: "desc" },
        select: {
          id: true, publicRef: true, description: true, category: true, severityReported: true,
          lat: true, lng: true, addressText: true, submittedAt: true, channel: true, status: true,
          isDuplicate: true, classificationProvider: true, classificationModel: true,
          classificationConfidence: true, classificationJson: true, source: true,
        },
      },
      evidence: { orderBy: { capturedAt: "desc" } },
      links: { orderBy: { assignedAt: "asc" }, include: { asset: { select: { code: true, name: true, kind: true, conditionScore: true } } } },
      actions: { orderBy: { createdAt: "asc" } },
      verifications: { orderBy: { verifiedAt: "asc" } },
    },
  });
  if (!event) throw new ApiError(404, "NOT_FOUND", `Event ${id} not found`);

  // contextual enrichment for the dossier
  const [assets, incidents, maintenance, weather, audits, riskHistory] = await Promise.all([
    db.infrastructureAsset.findMany({
      where: { jurisdictionId: event.jurisdictionId ?? "none" },
      select: { code: true, name: true, kind: true, agencyCode: true, lat: true, lng: true, conditionScore: true, pathJson: true, lastInspectedAt: true },
    }),
    db.historicalIncident.findMany({
      where: { jurisdictionId: event.jurisdictionId ?? "none" },
      orderBy: { occurredOn: "desc" },
      take: 40,
    }),
    db.maintenanceAction.findMany({
      where: { jurisdictionId: event.jurisdictionId ?? "none" },
      orderBy: { performedAt: "desc" },
      take: 30,
      include: { asset: { select: { code: true, name: true, kind: true } } },
    }),
    db.weatherObservation.findMany({
      where: { observedAt: { gte: new Date(Date.now() - 72 * 3600_000) } },
      orderBy: { observedAt: "asc" },
    }),
    db.auditLog.findMany({
      where: { entityType: "UrbanEvent", entityId: event.id },
      orderBy: { at: "desc" },
      take: 60,
    }),
    db.riskAssessment.findMany({ where: { eventId: event.id }, orderBy: { computedAt: "desc" }, take: 10 }),
  ]);

  return ok({
    event: {
      ...event,
      riskFactors: fromJson<RiskFactor[]>(event.riskFactorsJson, []),
      reports: event.reports.map((r) => ({
        ...r,
        classification: fromJson<ClassificationOutput | null>(r.classificationJson, null),
        classificationJson: undefined,
      })),
    },
    context: {
      assets,
      historicalIncidents: incidents,
      maintenance,
      rainfallSeries: aggregateRainfall(weather),
    },
    riskHistory: riskHistory.map((r) => ({ ...r, factors: fromJson<RiskFactor[]>(r.factorsJson, []) })),
    auditHistory: audits,
  });
});

function aggregateRainfall(observations: { stationCode: string; stationName: string; observedAt: Date; rainfallMm: number }[]) {
  const bySlot = new Map<number, { t: string; mm: number; stations: number }>();
  for (const o of observations) {
    const key = o.observedAt.getTime();
    const slot = bySlot.get(key) ?? { t: o.observedAt.toISOString(), mm: 0, stations: 0 };
    slot.mm += o.rainfallMm;
    slot.stations += 1;
    bySlot.set(key, slot);
  }
  return [...bySlot.values()].sort((a, b) => a.t.localeCompare(b.t)).map((s) => ({ t: s.t, mm: +(s.mm / s.stations).toFixed(1) }));
}
