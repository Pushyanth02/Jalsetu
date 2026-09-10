import { mdb } from "../db";
import { riskBandOf } from "@/lib/types";
import { audit, fromJson, toJson } from "../instrument";
import type { AssetWithContext } from "./enrich";
import { RISK_ENGINE_VERSION } from "./risk";
import type { RiskResult } from "./risk";

// Port of src/lib/engine/responsibility.ts (read-only server reference) for the
// static deployment. Changes: Prisma `db` → in-browser `mdb`; `@/lib/json` →
// `../instrument`; mdb findUnique has no `select` arg (full row read instead)
// and Prisma schema @default(now()) fields are set explicitly. Business logic
// verbatim.

// Responsibility resolution: Urban Event → Asset → Jurisdiction → Agency →
// Action → Escalation. Deterministic, rule-based, fully explainable.

export interface RoutingDecision {
  links: {
    agencyCode: string;
    role: "PRIMARY" | "SUPPORT" | "ESCALATION";
    reason: string;
    assetId: string | null;
  }[];
  recommendedActions: {
    kind: string;
    instruction: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    agencyCode: string;
    assetId: string | null;
  }[];
  ruleVersion: string;
}

export const ROUTING_RULE_VERSION = "routing-rules v1.2-demo";

interface RoutingContext {
  category: string;
  severity: number;
  jurisdictionKind: string;
  jurisdictionCode: string;
  jurisdictionAgencyCode: string | null;
  assets: AssetWithContext[];
  riskBand: string;
}

export function resolveResponsibility(ctx: RoutingContext): RoutingDecision {
  const links: RoutingDecision["links"] = [];
  const actions: RoutingDecision["recommendedActions"] = [];
  const nearest = ctx.assets[0] ?? null;
  const underpass = ctx.assets.find((a) => a.kind === "UNDERPASS" && a.distanceM <= 150);
  const pump = ctx.assets.find((a) => a.kind === "PUMP_STATION" && a.distanceM <= 250);
  const drain = ctx.assets.find((a) => (a.kind === "DRAIN" || a.kind === "OUTFALL") && a.distanceM <= 200);
  const depression = ctx.assets.find((a) => a.kind === "DEPRESSION" && a.distanceM <= 200);

  // --- primary responsibility ------------------------------------------------
  if (underpass) {
    links.push({
      agencyCode: underpass.agencyCode,
      role: "PRIMARY",
      reason: `Underpass asset ${underpass.code} (${underpass.name}) within 150m is owned by ${underpass.agencyCode}`,
      assetId: underpass.id,
    });
    actions.push({
      kind: "BARRICADE",
      instruction: `Barricade ${underpass.name} and divert traffic; deploy signage.`,
      priority: ctx.severity >= 4 ? "URGENT" : "HIGH",
      agencyCode: "DCP",
      assetId: null,
    });
    actions.push({
      kind: "DEPLOY_PUMP",
      instruction: `Deploy mobile pumping at ${underpass.name}; verify sump and discharge line.`,
      priority: "HIGH",
      agencyCode: underpass.agencyCode,
      assetId: underpass.id,
    });
  } else if (pump && ctx.category === "WATERLOGGING") {
    links.push({
      agencyCode: pump.agencyCode,
      role: "PRIMARY",
      reason: `Pump station ${pump.code} (${pump.name}) within 250m; pumping response is primary`,
      assetId: pump.id,
    });
    actions.push({
      kind: "DEPLOY_PUMP",
      instruction: `Activate/inspect pumping at ${pump.name}; log discharge rate.`,
      priority: "HIGH",
      agencyCode: pump.agencyCode,
      assetId: pump.id,
    });
  } else if (drain && (ctx.category === "DRAIN_OVERFLOW" || ctx.category === "WATERLOGGING")) {
    links.push({
      agencyCode: drain.agencyCode,
      role: "PRIMARY",
      reason: `Drain ${drain.code} (${drain.name}) within 200m falls under ${drain.agencyCode} maintenance`,
      assetId: drain.id,
    });
    actions.push({
      kind: "DESILT",
      instruction: `Inspect and desilt ${drain.name}; check blockage and outfall connectivity.`,
      priority: ctx.severity >= 4 ? "HIGH" : "MEDIUM",
      agencyCode: drain.agencyCode,
      assetId: drain.id,
    });
  } else if (ctx.category === "SEWER_BACKUP") {
    links.push({
      agencyCode: "DJB",
      role: "PRIMARY",
      reason: "Sewer backup category routed to Delhi Jal Board (sewer network authority)",
      assetId: nearest?.id ?? null,
    });
    actions.push({
      kind: "INSPECT",
      instruction: "Inspect sewer line for blockage/backflow; coordinate with drain desilting.",
      priority: "HIGH",
      agencyCode: "DJB",
      assetId: null,
    });
  } else if (ctx.jurisdictionKind === "CORRIDOR" && ctx.jurisdictionAgencyCode) {
    links.push({
      agencyCode: ctx.jurisdictionAgencyCode,
      role: "PRIMARY",
      reason: `Corridor jurisdiction ${ctx.jurisdictionCode} is administered by ${ctx.jurisdictionAgencyCode}`,
      assetId: nearest?.id ?? null,
    });
  } else {
    // default: jurisdiction's civic body
    const agency = ctx.jurisdictionAgencyCode ?? "MCD";
    links.push({
      agencyCode: agency,
      role: "PRIMARY",
      reason: `No specific asset matched; falls to jurisdiction ${ctx.jurisdictionCode} civic body (${agency})`,
      assetId: nearest?.id ?? null,
    });
  }

  // --- support ---------------------------------------------------------------
  const primary = links[0].agencyCode;
  if (ctx.category === "WATERLOGGING" && primary !== "MCD" && !underpass) {
    links.push({
      agencyCode: "MCD",
      role: "SUPPORT",
      reason: "MCD supports local drain clearing and road-side desilting",
      assetId: null,
    });
  }
  if (ctx.jurisdictionKind === "CATCHMENT" && !links.some((l) => l.agencyCode === "IFC")) {
    links.push({
      agencyCode: "IFC",
      role: "SUPPORT",
      reason: "Drainage catchment falls within I&FC trunk drain network",
      assetId: drain?.id ?? null,
    });
  }
  if (ctx.severity >= 4) {
    links.push({
      agencyCode: "DCP",
      role: "SUPPORT",
      reason: "Critical/high severity: traffic police support for diversion and barricading",
      assetId: null,
    });
  }
  if (depression && !underpass) {
    actions.push({
      kind: "INSPECT",
      instruction: `Inspect depression ${depression.name} for inlet blockage and standing water.`,
      priority: "MEDIUM",
      agencyCode: depression.agencyCode,
      assetId: depression.id,
    });
  }
  actions.push({
    kind: "INSPECT",
    instruction: "Field verification of water extent, depth and drain intake at reported location.",
    priority: ctx.severity >= 4 ? "HIGH" : "MEDIUM",
    agencyCode: primary,
    assetId: null,
  });

  // --- escalation ------------------------------------------------------------
  if (ctx.riskBand === "CRITICAL") {
    links.push({
      agencyCode: "DDMA",
      role: "ESCALATION",
      reason: "Risk band CRITICAL: escalate to DDMA for cross-agency coordination",
      assetId: null,
    });
    actions.push({
      kind: "ESCALATE",
      instruction: "Escalate to DDMA duty officer; cross-agency coordination required.",
      priority: "URGENT",
      agencyCode: "DDMA",
      assetId: null,
    });
  }

  return { links, recommendedActions: actions, ruleVersion: ROUTING_RULE_VERSION };
}

/** Persist responsibility links + recommended actions for an event. */
export async function applyResponsibility(eventId: string, decision: RoutingDecision, actor: string) {
  await mdb.responsibilityLink.deleteMany({ where: { eventId, source: "ENGINE" } });
  const event = await mdb.urbanEvent.findUnique({ where: { id: eventId } });
  const jurisdiction = event?.jurisdictionId;
  if (!jurisdiction) return;

  for (const link of decision.links) {
    await mdb.responsibilityLink.create({
      data: {
        eventId,
        assetId: link.assetId,
        jurisdictionId: jurisdiction,
        agencyCode: link.agencyCode,
        role: link.role,
        status: "ACTIVE",
        reason: link.reason,
        source: "ENGINE",
        assignedAt: new Date(), // prisma @default(now()) translated (static db has no schema defaults)
      },
    });
  }
  const existing = await mdb.actionItem.findMany({ where: { eventId, status: "RECOMMENDED" } });
  const existingInstructions = new Set(existing.map((a) => a.instruction));
  for (const action of decision.recommendedActions) {
    if (existingInstructions.has(action.instruction)) continue;
    await mdb.actionItem.create({
      data: {
        eventId,
        kind: action.kind,
        instruction: action.instruction,
        priority: action.priority,
        status: "RECOMMENDED",
        agencyCode: action.agencyCode,
        assetId: action.assetId,
        createdAt: new Date(), // prisma @default(now()) translated (static db has no schema defaults)
      },
    });
  }
  await audit({
    actor,
    action: "RESPONSIBILITY_RESOLVED",
    entityType: "UrbanEvent",
    entityId: eventId,
    note: `${decision.links.length} links, ${decision.recommendedActions.length} recommended actions (${decision.ruleVersion})`,
    after: { links: decision.links.map((l) => ({ agency: l.agencyCode, role: l.role })) },
  });
}

export interface EventRecord {
  id: string;
  code: string;
  title: string;
  category: string;
  status: string;
  severity: number;
  riskScore: number;
  riskBand: string;
  riskFactorsJson: string | null;
  reportCount: number;
  recurrenceCount: number;
  lat: number;
  lng: number;
  locationText: string;
  jurisdictionId: string | null;
  agencyCode: string | null;
  confidence: number;
  classificationProvider: string | null;
  modelVersion: string | null;
  firstReportedAt: Date;
  lastActivityAt: Date;
  rainfall24hMm: number | null;
  rainfall72hMm: number | null;
  closedAt: Date | null;
  groundTruthHotspotId: string | null;
}

export function riskOf(event: { riskScore: number; riskFactorsJson: string | null }): RiskResult | null {
  const factors = fromJson<RiskResult["factors"]>(event.riskFactorsJson, []);
  if (factors.length === 0) return null;
  return {
    score: event.riskScore,
    band: riskBandOf(event.riskScore),
    factors,
    modelVersion: RISK_ENGINE_VERSION,
    computedAt: new Date().toISOString(),
  };
}

export { toJson };
