import type { RiskBand } from "@/lib/types";
import { riskBandOf } from "@/lib/types";

// Transparent, explainable risk factor model (risk-engine v1.3-demo).
// Every factor, weight and contribution is returned so the UI can show
// exactly WHY a score is what it is. No black boxes.

export const RISK_ENGINE_VERSION = "risk-engine v1.3-demo";

export interface RiskFactorInput {
  severity: number; // 1-5
  reportCount: number;
  rainfall24hMm: number;
  rainfall72hMm: number;
  recurrenceCount: number;
  drainCondition: number | null; // nearest drain 0-100, null if none nearby
  monthsSinceMaintenance: number | null;
  historicalIncidentsNearby: number;
}

export interface RiskFactor {
  key: string;
  label: string;
  value: number; // normalised 0-1
  weight: number;
  contribution: number; // value * weight * 100
  raw: string; // human-readable raw evidence
}

export interface RiskResult {
  score: number; // 0-100
  band: RiskBand;
  factors: RiskFactor[];
  modelVersion: string;
  computedAt: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function computeRisk(input: RiskFactorInput): RiskResult {
  const severityNorm = clamp01((input.severity - 1) / 3);
  const reportNorm = clamp01(input.reportCount / 8);
  const rainNorm = clamp01(input.rainfall24hMm / 150);
  const recurrenceNorm = clamp01(input.recurrenceCount / 4);
  const infraNorm = input.drainCondition == null ? 0.4 : clamp01(1 - input.drainCondition / 100);
  const maintenanceNorm = input.monthsSinceMaintenance == null ? 0.5 : clamp01(input.monthsSinceMaintenance / 12);
  const historyNorm = clamp01(input.historicalIncidentsNearby / 8);

  const defs: {
    key: string;
    label: string;
    value: number;
    weight: number;
    raw: string;
  }[] = [
    { key: "severity", label: "Assessed severity", value: severityNorm, weight: 0.2, raw: `severity ${input.severity}/5` },
    { key: "reportIntensity", label: "Report intensity", value: reportNorm, weight: 0.16, raw: `${input.reportCount} report(s)` },
    { key: "rainfall24h", label: "Rainfall (24h)", value: rainNorm, weight: 0.18, raw: `${input.rainfall24hMm.toFixed(0)} mm` },
    { key: "recurrence", label: "Recurrence", value: recurrenceNorm, weight: 0.14, raw: `${input.recurrenceCount} recurrence(s)` },
    {
      key: "infrastructure",
      label: "Drainage deficit",
      value: infraNorm,
      weight: 0.12,
      raw: input.drainCondition == null ? "no drain within 250m" : `condition ${input.drainCondition}/100`,
    },
    {
      key: "maintenance",
      label: "Maintenance gap",
      value: maintenanceNorm,
      weight: 0.1,
      raw: input.monthsSinceMaintenance == null ? "no record" : `${input.monthsSinceMaintenance} month(s)`,
    },
    { key: "history", label: "Historical incidents", value: historyNorm, weight: 0.1, raw: `${input.historicalIncidentsNearby} within 200m` },
  ];

  const factors: RiskFactor[] = defs.map((d) => ({
    ...d,
    contribution: +(d.value * d.weight * 100).toFixed(1),
  }));
  const score = Math.round(factors.reduce((s, f) => s + f.value * f.weight, 0) * 100);
  return {
    score: Math.max(0, Math.min(100, score)),
    band: riskBandOf(score),
    factors,
    modelVersion: RISK_ENGINE_VERSION,
    computedAt: new Date().toISOString(),
  };
}
