import { describe, test, expect } from "bun:test";
import { mulberry32, Rng, hashSeed } from "@/lib/rng";
import { distanceM, pointInRing, jitter, idwInterpolate, polygonCentroid, bboxOf } from "@/lib/geo";
import { computeRisk, RISK_ENGINE_VERSION } from "@/lib/engine/risk";
import { MockProvider } from "@/lib/ai/mock-provider";
import { clusterByProximity, adjustedRandIndex, auc } from "@/lib/engine/duplicate";
import { resolveResponsibility, ROUTING_RULE_VERSION } from "@/lib/engine/responsibility";

// Unit tests for the deterministic core: RNG, geo, risk model, mock provider
// (classification), clustering, routing rules. All pure functions.

describe("deterministic RNG", () => {
  test("mulberry32 is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  test("Rng.pick and shuffle are stable", () => {
    const r1 = new Rng(7);
    const r2 = new Rng(7);
    expect(r1.pick([1, 2, 3, 4])).toBe(r2.pick([1, 2, 3, 4]));
    expect(r1.shuffle([1, 2, 3, 4, 5])).toEqual(r2.shuffle([1, 2, 3, 4, 5]));
  });

  test("hashSeed is stable and different for different strings", () => {
    expect(hashSeed("minto")).toBe(hashSeed("minto"));
    expect(hashSeed("minto")).not.toBe(hashSeed("ito"));
  });
});

describe("geo utilities", () => {
  test("haversine distance ITO to Minto Road is ~2.3km", () => {
    const d = distanceM({ lat: 28.628, lng: 77.246 }, { lat: 28.6284, lng: 77.2215 });
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(2600);
  });

  test("pointInRing detects inside/outside", () => {
    const ring: [number, number][] = [
      [77.213, 28.621], [77.214, 28.636], [77.228, 28.634], [77.229, 28.625], [77.224, 28.6205], [77.213, 28.621],
    ];
    expect(pointInRing({ lat: 28.6284, lng: 77.2215 }, ring)).toBe(true); // Minto Road underpass
    expect(pointInRing({ lat: 28.703, lng: 77.1968 }, ring)).toBe(false); // Model Town
  });

  test("jitter stays within radius and is deterministic", () => {
    const p = { lat: 28.63, lng: 77.22 };
    const rnd = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const j = jitter(p, 100, rnd);
      expect(distanceM(p, j)).toBeLessThanOrEqual(100.5);
    }
    const r1 = mulberry32(9);
    const r2 = mulberry32(9);
    expect(jitter(p, 80, r1)).toEqual(jitter(p, 80, r2));
  });

  test("idwInterpolate approximates nearby station value", () => {
    const p = { lat: 28.6284, lng: 77.2215 };
    const near = { lat: 28.6285, lng: 77.2216, value: 100 };
    const far = { lat: 28.565, lng: 77.205, value: 0 };
    const v = idwInterpolate(p, [near, far]);
    expect(v).toBeGreaterThan(80); // dominated by near station
  });

  test("polygonCentroid and bboxOf", () => {
    const ring: [number, number][] = [[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]];
    expect(polygonCentroid(ring)).toEqual({ lat: 0.8, lng: 0.8 });
    expect(bboxOf(ring)).toEqual([0, 0, 2, 2]);
  });
});

describe("risk factor model (risk-engine v1.3)", () => {
  test("score is bounded 0-100 and factors are explainable", () => {
    const r = computeRisk({
      severity: 5, reportCount: 20, rainfall24hMm: 300, rainfall72hMm: 400,
      recurrenceCount: 9, drainCondition: 5, monthsSinceMaintenance: 30, historicalIncidentsNearby: 20,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.band).toBe("CRITICAL");
    // each factor has label, value in 0-1, weight, contribution
    for (const f of r.factors) {
      expect(f.value).toBeGreaterThanOrEqual(0);
      expect(f.value).toBeLessThanOrEqual(1);
      expect(f.weight).toBeGreaterThan(0);
      expect(f.contribution).toBeGreaterThan(0);
      expect(f.label.length).toBeGreaterThan(3);
    }
    // weights sum to 1
    const w = r.factors.reduce((s, f) => s + f.weight, 0);
    expect(Math.abs(w - 1)).toBeLessThan(0.001);
  });

  test("minimal risk inputs give LOW band", () => {
    const r = computeRisk({
      severity: 1, reportCount: 0, rainfall24hMm: 0, rainfall72hMm: 0,
      recurrenceCount: 0, drainCondition: 100, monthsSinceMaintenance: 0, historicalIncidentsNearby: 0,
    });
    expect(r.score).toBeLessThan(10);
    expect(r.band).toBe("LOW");
  });

  test("band thresholds", () => {
    const mk = (score: number) => {
      // produce a target score by scaling severity+rainfall
      const sev = Math.min(4, Math.max(1, Math.round(score / 25)));
      return computeRisk({
        severity: sev, reportCount: 0, rainfall24hMm: 0, rainfall72hMm: 0,
        recurrenceCount: 0, drainCondition: 100, monthsSinceMaintenance: 0, historicalIncidentsNearby: 0,
      });
    };
    expect(mk(10).band).toBe("LOW");
  });

  test("model version string present", () => {
    expect(RISK_ENGINE_VERSION).toContain("risk-engine");
  });
});

describe("deterministic MockProvider classification", () => {
  const provider = new MockProvider();
  const base = {
    description: "Water logging at test location",
    severityReported: "MEDIUM" as const,
    categoryReported: "WATERLOGGING" as const,
    lat: 28.63,
    lng: 77.22,
  };

  test("deterministic: same input, same output", async () => {
    const a = await provider.classify(base);
    const b = await provider.classify(base);
    expect(a.output).toEqual(b.output);
  });

  test("severity keywords escalate: knee-deep text is CRITICAL", async () => {
    const r = await provider.classify({ ...base, description: "Knee-deep water at the underpass, cars stalled" });
    expect(r.output.severity).toBe("CRITICAL");
  });

  test("mitigating words downgrade: minor puddle", async () => {
    const r = await provider.classify({ ...base, description: "Small puddle near the gate, minor issue only" });
    expect(["LOW", "MEDIUM"]).toContain(r.output.severity);
  });

  test("drain text reclassifies category to DRAIN_OVERFLOW", async () => {
    const r = await provider.classify({ ...base, description: "The drain is overflowing and the nallah is blocked" });
    expect(r.output.category).toBe("DRAIN_OVERFLOW");
  });

  test("confidence within bounds and structure is valid", async () => {
    const r = await provider.classify({ ...base, description: "Severe waterlogging, traffic jam, water flowing fast" });
    expect(r.output.confidence).toBeGreaterThan(0);
    expect(r.output.confidence).toBeLessThanOrEqual(1);
    expect(r.output.summary.length).toBeGreaterThan(6);
    expect(Array.isArray(r.output.factors)).toBe(true);
  });

  test("risk advisory returns structured factors", async () => {
    const r = await provider.riskAdvisory({
      eventTitle: "Test event", category: "WATERLOGGING", severity: 4,
      rainfall24hMm: 100, rainfall72hMm: 150, reportCount: 5, recurrenceCount: 2,
      drainCondition: 30, monthsSinceMaintenance: 10, historicalIncidentsNearby: 6,
    });
    expect(r.output.factors.length).toBeGreaterThan(3);
    expect(r.output.narrative.length).toBeGreaterThan(10);
    expect(r.output.factors.every((f) => f.direction === "AGGRAVATES" || f.direction === "MITIGATES")).toBe(true);
  });
});

describe("proximity clustering + metrics", () => {
  test("clusterByProximity groups close points, keeps singletons", () => {
    const items = [
      { id: "a", lat: 28.630, lng: 77.220 },
      { id: "b", lat: 28.6301, lng: 77.2201 }, // ~15m from a
      { id: "c", lat: 28.6302, lng: 77.2202 }, // ~30m from a
      { id: "d", lat: 28.700, lng: 77.260 }, // far away
    ];
    const { clusters, singletons } = clusterByProximity(items, 150);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members.map((m) => m.id).sort()).toEqual(["a", "b", "c"]);
    expect(singletons.map((s) => s.id)).toEqual(["d"]);
  });

  test("separated points do not cluster", () => {
    const items = [
      { id: "a", lat: 28.630, lng: 77.220 },
      { id: "b", lat: 28.650, lng: 77.240 }, // ~3km away
    ];
    const { clusters, singletons } = clusterByProximity(items, 150);
    expect(clusters).toHaveLength(0);
    expect(singletons).toHaveLength(2);
  });

  test("ARI: identical partitions = 1, disjoint = ~0", () => {
    expect(adjustedRandIndex([1, 1, 2, 2], [1, 1, 2, 2])).toBeCloseTo(1, 5);
    expect(adjustedRandIndex([1, 1, 2, 2], [1, 2, 1, 2])).toBeLessThan(0.1);
  });

  test("AUC: perfect ranking = 1, inverted = 0, random ties = 0.5", () => {
    expect(auc([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0])).toBeCloseTo(1, 5);
    expect(auc([0.1, 0.2, 0.8, 0.9], [1, 1, 0, 0])).toBeCloseTo(0, 5);
    expect(auc([0.5, 0.5, 0.5, 0.5], [1, 1, 0, 0])).toBeCloseTo(0.5, 5);
  });
});

describe("responsibility routing rules", () => {
  const ctx = (over: Partial<Parameters<typeof resolveResponsibility>[0]>) => {
    const base = {
      category: "WATERLOGGING",
      severity: 3,
      jurisdictionKind: "WARD",
      jurisdictionCode: "DL-MT-068",
      jurisdictionAgencyCode: "MCD",
      assets: [],
      riskBand: "HIGH",
    };
    return resolveResponsibility({ ...base, ...over });
  };
  const asset = (kind: string, agencyCode: string, distanceM = 50) => ({
    id: `ast-${kind}`,
    code: `AST-${kind}`,
    kind,
    name: `Test ${kind}`,
    agencyCode,
    jurisdictionId: "j1",
    conditionScore: 50,
    distanceM,
    monthsSinceMaintenance: 6,
  });

  test("underpass routes to its owner agency with barricade action", () => {
    const d = ctx({ assets: [asset("UNDERPASS", "PWD")] });
    expect(d.links[0].agencyCode).toBe("PWD");
    expect(d.links[0].role).toBe("PRIMARY");
    expect(d.recommendedActions.some((a) => a.kind === "BARRICADE" && a.agencyCode === "DCP")).toBe(true);
    expect(d.recommendedActions.some((a) => a.kind === "DEPLOY_PUMP")).toBe(true);
  });

  test("drain within 200m routes to drain agency with desilt action", () => {
    const d = ctx({ assets: [asset("DRAIN", "IFC", 120)] });
    expect(d.links[0].agencyCode).toBe("IFC");
    expect(d.recommendedActions.some((a) => a.kind === "DESILT")).toBe(true);
  });

  test("sewer backup routes to DJB", () => {
    const d = ctx({ category: "SEWER_BACKUP", assets: [] });
    expect(d.links[0].agencyCode).toBe("DJB");
  });

  test("corridor jurisdiction default routes to its agency", () => {
    const d = ctx({ jurisdictionKind: "CORRIDOR", jurisdictionAgencyCode: "NDMC", assets: [] });
    expect(d.links[0].agencyCode).toBe("NDMC");
  });

  test("ward default falls back to civic body", () => {
    const d = ctx({ assets: [] });
    expect(d.links[0].agencyCode).toBe("MCD");
  });

  test("CRITICAL risk band escalates to DDMA with ESCALATE action", () => {
    const d = ctx({ riskBand: "CRITICAL", assets: [] });
    const esc = d.links.find((l) => l.role === "ESCALATION");
    expect(esc?.agencyCode).toBe("DDMA");
    expect(d.recommendedActions.some((a) => a.kind === "ESCALATE" && a.agencyCode === "DDMA")).toBe(true);
  });

  test("severity >= 4 adds DCP support", () => {
    const d = ctx({ severity: 4, assets: [] });
    const support = d.links.find((l) => l.agencyCode === "DCP");
    expect(support?.role).toBe("SUPPORT");
  });

  test("rule version is exposed", () => {
    expect(ROUTING_RULE_VERSION).toContain("routing-rules");
  });
});
