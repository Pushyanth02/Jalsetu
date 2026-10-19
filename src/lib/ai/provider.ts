import { z } from "zod";
import type { Category, Severity, AiProviderId } from "@/lib/types";

// AIProvider abstraction. Every provider returns STRUCTURED, SCHEMA-VALIDATED
// output plus provenance (provider id, model version, confidence). Raw LLM
// text is never surfaced and chain-of-thought is never exposed.

export const CLASSIFICATION_VERSION = "classify-1.3-demo";
export const RISK_VERSION = "risk-1.3-demo";
export const CLUSTER_VERSION = "cluster-1.1-demo";

/** Structured classification output (schema-validated in every provider). */
export const classificationOutputSchema = z.object({
  category: z.enum(["WATERLOGGING", "DRAIN_OVERFLOW", "SEWER_BACKUP", "POTHOLE", "DEBRIS_BLOCKAGE"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  confidence: z.number().min(0).max(1),
  isDuplicateSuspected: z.boolean(),
  duplicateReason: z.string().max(200).optional(),
  factors: z.array(z.string().max(120)).max(6).default([]),
  summary: z.string().min(6).max(220),
});
export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;

/** Structured contributing-factor + risk advisory output. */
export const riskAdvisorySchema = z.object({
  narrative: z.string().min(10).max(400),
  factors: z
    .array(
      z.object({
        key: z.string().max(40),
        label: z.string().max(80),
        direction: z.enum(["AGGRAVATES", "MITIGATES"]),
        weight: z.number().min(0).max(1),
      })
    )
    .max(8)
    .default([]),
  recommendedInvestigation: z.string().max(300).optional(),
});
export type RiskAdvisory = z.infer<typeof riskAdvisorySchema>;

export interface ClassificationInput {
  description: string;
  severityReported: Severity;
  categoryReported: Category;
  lat: number;
  lng: number;
  addressText?: string | null;
  /** Context windows fed to the model (no personal identifiers). */
  context?: {
    rainfall24hMm?: number | null;
    nearbyDrainCondition?: number | null;
    nearbyOpenEvents?: number;
    historicalIncidentsNearby?: number;
  };
}

export interface ProviderResult<T> {
  output: T;
  provider: AiProviderId;
  modelId: string;
  latencyMs: number;
}

export interface AIProvider {
  readonly id: AiProviderId;
  readonly modelId: string;
  classify(input: ClassificationInput): Promise<ProviderResult<ClassificationOutput>>;
  riskAdvisory(input: {
    eventTitle: string;
    category: string;
    severity: number;
    rainfall24hMm: number;
    rainfall72hMm: number;
    reportCount: number;
    recurrenceCount: number;
    drainCondition: number | null;
    monthsSinceMaintenance: number | null;
    historicalIncidentsNearby: number;
  }): Promise<ProviderResult<RiskAdvisory>>;
}

// --- provider health (cached, honest) ---------------------------------------

export type ProviderHealth = {
  provider: AiProviderId;
  modelId: string;
  available: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  configuredBy: string;
};

let healthCache: ProviderHealth | null = null;
let probePromise: Promise<ProviderHealth> | null = null;

export function aiProviderEnvConfig(): { mode: string; modelOverride: string | null } {
  const mode = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  const modelOverride = process.env.AI_MODEL ?? null;
  return { mode, modelOverride };
}

export function invalidateProviderHealth(): void {
  healthCache = null;
  probePromise = null;
}

export function getCachedProviderHealth(): ProviderHealth | null {
  return healthCache;
}

export function setCachedProviderHealth(h: ProviderHealth): void {
  healthCache = h;
}

export function setProviderProbe(p: Promise<ProviderHealth> | null): void {
  probePromise = p;
}

export function getProviderProbe(): Promise<ProviderHealth> | null {
  return probePromise;
}
