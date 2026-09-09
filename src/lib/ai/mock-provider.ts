import {
  CLASSIFICATION_VERSION,
  RISK_VERSION,
  type AIProvider,
  type ClassificationInput,
  type ClassificationOutput,
  type ProviderResult,
  type RiskAdvisory,
} from "./provider";
import { hashSeed } from "@/lib/rng";
import { severityToNumber, numberToSeverity, type AiProviderId, type Severity } from "@/lib/types";

// MockProvider: DETERMINISTIC rule-based inference. Same input → same output,
// no network. Used as fallback when GLM is unavailable, and in tests.

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  WATERLOGGING: ["waterlog", "water logging", "flooded", "flood", "stagnant", "water on road", "khad", "paani"],
  DRAIN_OVERFLOW: ["drain", "nallah", "nala", "overflow", "nullah", "sewage on"],
  SEWER_BACKUP: ["sewer", "sewage", "backflow", "manhole", "ganda paani", "smell"],
  POTHOLE: ["pothole", "gaddha", "broken road", "crater"],
  DEBRIS_BLOCKAGE: ["debris", "garbage", "construction waste", "malba", "blocked", "silt"],
};

const SEVERITY_KEYWORDS: { words: string[]; severity: Severity }[] = [
  { words: ["knee-deep", "knee deep", "waist", "chest", "stranded", "submerged", "vehicle stuck", "car stalled"], severity: "CRITICAL" },
  { words: ["ankle", "footpath", "traffic jam", "slow", "blocked", "flowing"], severity: "HIGH" },
  { words: ["puddle", "small", "patch", "collection"], severity: "LOW" },
];

function detectCategory(text: string, reported: string): string {
  const lower = text.toLowerCase();
  let best: { cat: string; score: number } = { cat: reported, score: 0 };
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = words.reduce((s, w) => (lower.includes(w) ? s + 1 : s), 0);
    if (score > best.score) best = { cat, score };
  }
  return best.score > 0 ? best.cat : reported;
}

const MITIGATING_WORDS = ["minor", "small", "shallow", "only ankle", "manageable", "not deep", "sweeping", "slight", "mostly dried", "few cm"];

function detectSeverity(text: string, reported: Severity, rainfall24h: number | null): Severity {
  const lower = text.toLowerCase();
  const mitigated = MITIGATING_WORDS.some((w) => lower.includes(w));
  for (const { words, severity } of SEVERITY_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) {
      let byKeyword = severityToNumber(severity);
      const byCitizen = severityToNumber(reported);
      if (mitigated) byKeyword = Math.max(1, byKeyword - 2); // mitigation downgrades keyword evidence
      const n = mitigated ? Math.max(byKeyword, Math.min(byCitizen, 2)) : Math.max(byKeyword, byCitizen);
      return numberToSeverity(Math.min(4, n));
    }
  }
  if (mitigated) {
    return numberToSeverity(Math.min(2, severityToNumber(reported)));
  }
  // rainfall context raises severity during heavy rain
  if (rainfall24h != null && rainfall24h > 90 && severityToNumber(reported) < 3) {
    return numberToSeverity(severityToNumber(reported) + 1);
  }
  return reported;
}

export class MockProvider implements AIProvider {
  readonly id: AiProviderId = "MOCK";
  readonly modelId = `deterministic-rules/${CLASSIFICATION_VERSION}`;

  async classify(input: ClassificationInput): Promise<ProviderResult<ClassificationOutput>> {
    const started = Date.now();
    const output = this.classifySync(input);
    return {
      output,
      provider: this.id,
      modelId: this.modelId,
      latencyMs: Date.now() - started,
    };
  }

  /** Pure deterministic core (also used directly by tests). */
  classifySync(input: ClassificationInput): ClassificationOutput {
    const category = detectCategory(input.description, input.categoryReported);
    const severity = detectSeverity(input.description, input.severityReported, input.context?.rainfall24hMm ?? null);
    const lower = input.description.toLowerCase();

    // confidence: agreement between citizen report and extracted evidence
    let confidence = 0.55;
    if (category !== input.categoryReported) confidence += 0.1;
    else confidence += 0.15;
    if (severity !== input.severityReported) confidence -= 0.05;
    if (input.description.length > 60) confidence += 0.1;
    if (lower.includes("not sure") || lower.includes("maybe") || lower.includes("i think")) confidence -= 0.15;
    const nearbyOpen = input.context?.nearbyOpenEvents ?? 0;
    if (nearbyOpen > 0) confidence += 0.05;

    // duplicate suspicion: same text signature or strong proximity signal
    const signatureSeed = hashSeed(`${category}|${severity}|${Math.round(input.lat * 1000)}|${Math.round(input.lng * 1000)}`);
    const isDuplicateSuspected = nearbyOpen > 0 && signatureSeed % 4 !== 0;

    const factors: string[] = [];
    if (severity !== input.severityReported) factors.push("Severity adjusted from text evidence");
    if (category !== input.categoryReported) factors.push("Category adjusted from text evidence");
    if ((input.context?.rainfall24hMm ?? 0) > 50) factors.push("Heavy rainfall in the last 24h");
    if (nearbyOpen > 0) factors.push(`${nearbyOpen} open event(s) within 150m`);
    if ((input.context?.historicalIncidentsNearby ?? 0) > 2) factors.push("Recurring historical incident location");

    const summary = `${category.replace(/_/g, " ").toLowerCase()} reported as ${input.severityReported.toLowerCase()}${
      severity !== input.severityReported ? `, assessed ${severity.toLowerCase()} from evidence` : ""
    } at (${input.lat.toFixed(4)}, ${input.lng.toFixed(4)}).`;

    return {
      category: category as ClassificationOutput["category"],
      severity,
      confidence: Math.max(0.05, Math.min(0.97, +confidence.toFixed(2))),
      isDuplicateSuspected,
      duplicateReason: isDuplicateSuspected ? "Nearby open events at same category and severity within 150m" : undefined,
      factors: factors.slice(0, 6),
      summary,
    };
  }

  async riskAdvisory(input: {
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
  }): Promise<ProviderResult<RiskAdvisory>> {
    const started = Date.now();
    const factors: RiskAdvisory["factors"] = [];
    if (input.rainfall24hMm > 60) factors.push({ key: "rainfall24h", label: "Rainfall in last 24h", direction: "AGGRAVATES", weight: 0.8 });
    if (input.recurrenceCount > 0) factors.push({ key: "recurrence", label: `Recurred ${input.recurrenceCount}× recently`, direction: "AGGRAVATES", weight: 0.7 });
    if (input.reportCount > 3) factors.push({ key: "reportIntensity", label: `${input.reportCount} citizen reports`, direction: "AGGRAVATES", weight: 0.6 });
    if (input.drainCondition != null && input.drainCondition < 50)
      factors.push({ key: "drainCondition", label: "Nearest drain in poor condition", direction: "AGGRAVATES", weight: 0.5 });
    if (input.monthsSinceMaintenance != null && input.monthsSinceMaintenance > 6)
      factors.push({ key: "maintenanceGap", label: `No maintenance for ${input.monthsSinceMaintenance} months`, direction: "AGGRAVATES", weight: 0.4 });
    if (input.historicalIncidentsNearby >= 3)
      factors.push({ key: "history", label: `${input.historicalIncidentsNearby} historical incidents nearby`, direction: "AGGRAVATES", weight: 0.6 });
    if (input.drainCondition != null && input.drainCondition > 75)
      factors.push({ key: "drainGood", label: "Nearest drain recently maintained", direction: "MITIGATES", weight: 0.3 });

    const narrative =
      factors.length > 0
        ? `Assessment indicates elevated waterlogging risk driven primarily by ${factors
            .slice(0, 3)
            .map((f) => f.label.toLowerCase())
            .join(", ")}.`
        : `No single strong aggravator; risk is driven mainly by reported severity at this location.`;

    const output: RiskAdvisory = {
      narrative,
      factors,
      recommendedInvestigation:
        input.drainCondition != null && input.drainCondition < 50
          ? "Inspect nearest drain for blockage and siltation; verify outfall connectivity."
          : "Verify field water depth and drain intake capacity at peak rainfall.",
    };
    return { output, provider: this.id, modelId: `deterministic-rules/${RISK_VERSION}`, latencyMs: Date.now() - started };
  }
}
