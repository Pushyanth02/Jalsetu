import { MockProvider } from "@/lib/ai/mock-provider";
import type { AIProvider, ProviderHealth } from "@/lib/ai/provider";

// Static AI layer for the API-key-less, server-less deployment.
//
// The full system supports a GLM provider through a server-side SDK; that path
// only exists in the (removed) server runtime. In the static export the
// deterministic MockProvider is the ONLY provider - it needs no network, no key
// and returns the same output for the same input. Health reporting stays
// honest: provider "MOCK", availability true, configuredBy explains the mode.

const mock = new MockProvider();

export function getMockProvider(): MockProvider {
  return mock;
}

export async function providerHealth(): Promise<ProviderHealth> {
  return {
    provider: "MOCK",
    modelId: mock.modelId,
    available: true,
    lastCheckedAt: new Date().toISOString(),
    lastError: null,
    configuredBy: "static-export (deterministic rules, no server AI, no API key)",
  };
}

/** Returns the active provider - always the deterministic mock in static mode. */
export async function getActiveProvider(): Promise<AIProvider> {
  return mock;
}
