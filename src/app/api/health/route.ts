import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api-helpers";
import { providerHealth } from "@/lib/ai";

export const dynamic = "force-dynamic";

// GET /api/health - system + AI provider health (honest, no pretending).
export const GET = handler(async () => {
  const started = Date.now();
  const [events, reports, observations, lastRun] = await Promise.all([
    db.urbanEvent.count(),
    db.citizenReport.count(),
    db.weatherObservation.count(),
    db.modelRun.findFirst({ orderBy: { startedAt: "desc" } }),
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
});
