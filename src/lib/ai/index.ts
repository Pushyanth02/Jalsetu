import { GLMProvider } from "./glm-provider";
import { MockProvider } from "./mock-provider";
import {
  aiProviderEnvConfig,
  getCachedProviderHealth,
  getProviderProbe,
  setCachedProviderHealth,
  setProviderProbe,
  type AIProvider,
  type ProviderHealth,
} from "./provider";

// Provider factory: resolves the active provider from environment config.
//   AI_PROVIDER = auto | glm | mock   (default auto)
//   AI_MODEL     = optional model id override for GLM
// GLM availability is probed once and cached; a failed probe falls back to the
// deterministic MockProvider and the failure is reported honestly in health.

export const DEFAULT_GLM_MODEL = "glm-4-plus";

const mock = new MockProvider();

export function getMockProvider(): MockProvider {
  return mock;
}

async function probeGlm(modelId: string): Promise<ProviderHealth> {
  const base: ProviderHealth = {
    provider: "GLM",
    modelId,
    available: true,
    lastCheckedAt: new Date().toISOString(),
    lastError: null,
    configuredBy: aiProviderEnvConfig().mode,
  };
  try {
    const provider = new GLMProvider(modelId);
    await provider.classify({
      description: "Probe request: minor water pooling near road edge after light rain.",
      severityReported: "LOW",
      categoryReported: "WATERLOGGING",
      lat: 28.61,
      lng: 77.21,
    });
    return base;
  } catch (err) {
    return {
      ...base,
      available: false,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function providerHealth(): Promise<ProviderHealth> {
  const { mode, modelOverride } = aiProviderEnvConfig();
  const modelId = modelOverride ?? DEFAULT_GLM_MODEL;
  const cached = getCachedProviderHealth();
  const fresh = cached && Date.now() - new Date(cached.lastCheckedAt ?? 0).getTime() < 5 * 60_000;
  if (cached && fresh) return cached;

  if (mode === "mock") {
    const h: ProviderHealth = {
      provider: "MOCK",
      modelId: mock.modelId,
      available: true,
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
      configuredBy: "env:AI_PROVIDER=mock",
    };
    setCachedProviderHealth(h);
    return h;
  }

  // auto or glm: probe (deduplicated under concurrency)
  let probe = getProviderProbe();
  if (!probe) {
    probe = probeGlm(modelId);
    setProviderProbe(probe);
    const health = await probe;
    setProviderProbe(null);
    setCachedProviderHealth(health);
    return health;
  }
  return probe;
}

/** Returns the best available provider (GLM if healthy, else deterministic mock). */
export async function getActiveProvider(): Promise<AIProvider> {
  const health = await providerHealth();
  if (health.provider === "GLM" && health.available) {
    return new GLMProvider(health.modelId);
  }
  return mock;
}
