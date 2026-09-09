import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api-helpers";
import { fromJson } from "@/lib/json";
import type { RiskFactor } from "@/lib/engine/risk";

export const dynamic = "force-dynamic";

// GET /api/risk - risk register: all events with factor breakdown.
export const GET = handler(async () => {
  const events = await db.urbanEvent.findMany({
    orderBy: { riskScore: "desc" },
    select: {
      id: true, code: true, title: true, status: true, severity: true, riskScore: true, riskBand: true,
      riskFactorsJson: true, riskModelVersion: true, riskAssessedAt: true, reportCount: true,
      recurrenceCount: true, rainfall24hMm: true, lat: true, lng: true, agencyCode: true,
      jurisdictionId: true, confidence: true, lastActivityAt: true,
    },
  });
  return ok(
    events.map((e) => ({
      ...e,
      factors: fromJson<RiskFactor[]>(e.riskFactorsJson, []),
      riskFactorsJson: undefined,
    })),
    { modelVersion: events[0]?.riskModelVersion ?? "risk-engine v1.3-demo", dataLabel: "SYNTHETIC_DEMO + live events" }
  );
});
