import ZAI from "z-ai-web-dev-sdk";
import {
  classificationOutputSchema,
  riskAdvisorySchema,
  CLASSIFICATION_VERSION,
  RISK_VERSION,
  type AIProvider,
  type ClassificationInput,
  type ClassificationOutput,
  type ProviderResult,
  type RiskAdvisory,
} from "./provider";
import type { AiProviderId } from "@/lib/types";

// GLMProvider: server-side LLM calls via z-ai-web-dev-sdk. Credentials never
// reach the browser. Output is schema-validated; a failed/invalid call THROWS
// so the engine can fall back honestly (never pretends success).

const REQUEST_TIMEOUT_MS = 30_000;

type ChatRole = "system" | "user" | "assistant";

async function glmComplete(modelId: string, messages: { role: ChatRole; content: string }[]): Promise<string> {
  const zai = await ZAI.create();
  const completion = await Promise.race([
    zai.chat.completions.create({
      model: modelId,
      messages,
      thinking: { type: "disabled" },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("GLM request timed out")), REQUEST_TIMEOUT_MS)
    ),
  ]);
  const content = completion.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("GLM returned empty content");
  }
  return content;
}

/** Extract the first JSON object from a completion (handles code fences). */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callStructured<T>(
  modelId: string,
  messages: { role: ChatRole; content: string }[],
  schema: { parse: (v: unknown) => T }
): Promise<{ parsed: T; latencyMs: number }> {
  const started = Date.now();
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await glmComplete(modelId, messages);
      const parsed = schema.parse(extractJson(raw));
      return { parsed, latencyMs: Date.now() - started };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error("GLM structured call failed");
}

const SYSTEM_PROMPT = `You are the classification engine of a Delhi waterlogging intelligence system.
You analyse citizen reports about urban waterlogging and drainage incidents.
Always answer with a single valid JSON object and nothing else. No markdown, no explanations.
Reasoning steps must never be included in the output.`;

export class GLMProvider implements AIProvider {
  readonly id: AiProviderId = "GLM";
  readonly modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async classify(input: ClassificationInput): Promise<ProviderResult<ClassificationOutput>> {
    const context = input.context ?? {};
    const lines = [
      "Classify this citizen report from Delhi and return JSON with keys:",
      "category (WATERLOGGING|DRAIN_OVERFLOW|SEWER_BACKUP|POTHOLE|DEBRIS_BLOCKAGE),",
      "severity (LOW|MEDIUM|HIGH|CRITICAL), confidence (0-1), isDuplicateSuspected (bool),",
      "duplicateReason (short string, only if suspected), factors (max 6 short strings), summary (one sentence).",
      "",
      `Report: description="${input.description}"`,
      `reported_severity=${input.severityReported}`,
      `reported_category=${input.categoryReported}`,
      `location=(${input.lat.toFixed(5)}, ${input.lng.toFixed(5)})`,
    ];
    if (input.addressText) lines.push(`address="${input.addressText}"`);
    if (context.rainfall24hMm != null) lines.push(`rainfall_last_24h_mm=${context.rainfall24hMm.toFixed(1)}`);
    if (context.nearbyDrainCondition != null) lines.push(`nearest_drain_condition_score=${context.nearbyDrainCondition}`);
    if (context.nearbyOpenEvents != null) lines.push(`open_events_within_150m=${context.nearbyOpenEvents}`);
    if (context.historicalIncidentsNearby != null) lines.push(`historical_incidents_within_200m=${context.historicalIncidentsNearby}`);

    const { parsed, latencyMs } = await callStructured(
      this.modelId,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: lines.join("\n") },
      ],
      classificationOutputSchema
    );
    return { output: parsed, provider: this.id, modelId: `${this.modelId}/${CLASSIFICATION_VERSION}`, latencyMs };
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
    const lines = [
      "Assess contributing factors for this urban waterlogging event and return JSON with keys:",
      "narrative (1-3 sentences), factors (array of {key,label,direction:AGGRAVATES|MITIGATES,weight:0-1}),",
      "recommendedInvestigation (one short sentence).",
      "",
      `Event: title="${input.eventTitle}" category=${input.category} severity_1to5=${input.severity}`,
      `rainfall_24h_mm=${input.rainfall24hMm.toFixed(1)} rainfall_72h_mm=${input.rainfall72hMm.toFixed(1)}`,
      `report_count=${input.reportCount} recurrence_count=${input.recurrenceCount}`,
      input.drainCondition != null
        ? `nearest_drain_condition_score=${input.drainCondition}`
        : "nearest_drain_condition_score=unknown",
      input.monthsSinceMaintenance != null
        ? `months_since_maintenance=${input.monthsSinceMaintenance}`
        : "months_since_maintenance=unknown",
      `historical_incidents_nearby=${input.historicalIncidentsNearby}`,
    ];

    const { parsed, latencyMs } = await callStructured(
      this.modelId,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: lines.join("\n") },
      ],
      riskAdvisorySchema
    );
    return { output: parsed, provider: this.id, modelId: `${this.modelId}/${RISK_VERSION}`, latencyMs };
  }
}
