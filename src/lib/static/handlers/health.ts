import { mdb } from "../db";
import { ok, type HandlerResult } from "../envelope";
import { providerHealth } from "../ai";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/health route (src/app/api/health/route.ts) for
// the in-browser API. System + AI provider health, honest, no pretending: in
// static mode the provider is the deterministic MOCK and the db counts come
// from the in-browser snapshot tables. Semantics preserved 1:1.

export async function health(_ctx: HandlerCtx): Promise<HandlerResult> {
  const started = Date.now();
  const [events, reports, observations, lastRun] = await Promise.all([
    mdb.urbanEvent.count(),
    mdb.citizenReport.count(),
    mdb.weatherObservation.count(),
    mdb.modelRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);
  const ai = await providerHealth();
  return ok({
    status: "ok",
    checkedAt: new Date().toISOString(),
    db: { reachable: true, events, reports, observations },
    ai: {
      provider: ai.provider,
      modelId: ai.modelId,
      available: ai.available,
      lastCheckedAt: ai.lastCheckedAt,
      lastError: ai.lastError,
      configuredBy: ai.configuredBy,
      fallback: "deterministic rules engine (always available)",
    },
    lastModelRun: lastRun ? { modelId: lastRun.modelId, status: lastRun.status, provider: lastRun.provider, startedAt: lastRun.startedAt } : null,
    latencyMs: Date.now() - started,
    dataLabel: "SYNTHETIC_DEMO dataset + live submissions",
  });
}

export const healthRoutes: RouteDef[] = [
  { method: "GET", segments: ["health"], handler: health },
];
