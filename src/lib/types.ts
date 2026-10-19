// Shared domain types. String enums are validated by zod at boundaries.

export const CATEGORIES = ["WATERLOGGING", "DRAIN_OVERFLOW", "SEWER_BACKUP", "POTHOLE", "DEBRIS_BLOCKAGE"] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const EVENT_STATUSES = [
  "DETECTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "VERIFIED", "CLOSED", "REOPENED",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const RISK_BANDS = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export const VERIFICATION_STAGES = [
  "ASSIGNED", "DISPATCHED", "OBSERVED", "EVIDENCE_UPLOADED", "ACTION_RECORDED", "VERIFIED", "CLOSED",
] as const;
export type VerificationStage = (typeof VERIFICATION_STAGES)[number];

export const AGENCY_CODES = ["MCD", "PWD", "NDMC", "DJB", "IFC", "DDMA", "DCP"] as const;
export type AgencyCode = (typeof AGENCY_CODES)[number];

export const ASSET_KINDS = [
  "DRAIN", "CULVERT", "PUMP_STATION", "ROAD_SEGMENT", "UNDERPASS", "DEPRESSION", "OUTFALL",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ACTION_KINDS = [
  "INSPECT", "DESILT", "DEPLOY_PUMP", "BARRICADE", "REPAIR", "ESCALATE", "NOTIFY", "MONITOR",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const DATA_SOURCES = ["REAL", "SYNTHETIC_DEMO", "MODEL_OUTPUT", "HYPOTHETICAL"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

/** AI provider identity used across classification/risk outputs. */
export const AI_PROVIDERS = ["GLM", "MOCK", "RULE"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export function severityToNumber(s: Severity): number {
  return { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[s];
}
export function numberToSeverity(n: number): Severity {
  if (n >= 4) return "CRITICAL";
  if (n >= 3) return "HIGH";
  if (n >= 2) return "MEDIUM";
  return "LOW";
}
export function riskBandOf(score: number): RiskBand {
  if (score >= 75) return "CRITICAL";
  if (score >= 55) return "HIGH";
  if (score >= 30) return "MODERATE";
  return "LOW";
}

export const SOURCE_LABELS: Record<DataSource, string> = {
  REAL: "Real data",
  SYNTHETIC_DEMO: "Synthetic demo data",
  MODEL_OUTPUT: "Model output",
  HYPOTHETICAL: "Hypothetical / future integration",
};
