import { describe, test, expect, beforeAll } from "bun:test";

// API integration tests. REQUIRE the dev server on localhost:3000
// (bun run dev) and a seeded database (bun run src/scripts/seed.ts).
// These tests exercise the real HTTP surface including validation,
// authorization boundaries and the ingestion pipeline.

const BASE = "http://127.0.0.1:3000";

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, init);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

let seededEventCode: string | null = null;
let submittedRef: string | null = null;

beforeAll(async () => {
  const health = await call("/api/health");
  if (health.status !== 200) {
    throw new Error(`Dev server not reachable at ${BASE}. Start it with: bun run dev`);
  }
  const events = await call("/api/events?limit=5");
  if (events.body?.ok && events.body.data.length > 0) {
    seededEventCode = events.body.data[0].code;
  }
});

describe("health & data endpoints", () => {
  test("GET /api/health returns honest provider info", async () => {
    const { status, body } = await call("/api/health");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(["GLM", "MOCK"]).toContain(body.data.ai.provider);
    expect(typeof body.data.ai.available).toBe("boolean");
    expect(body.data.db.events).toBeGreaterThan(0);
  });

  test("GET /api/data-health lists sources with labels", async () => {
    const { status, body } = await call("/api/data-health");
    expect(status).toBe(200);
    expect(body.data.sources.length).toBeGreaterThanOrEqual(6);
    for (const s of body.data.sources) {
      expect(["OK", "STALE", "EMPTY"]).toContain(s.status);
      expect(s.sourceLabel).toBeTruthy();
    }
  });

  test("GET /api/model-health returns versions, runs and confidence stats", async () => {
    const { status, body } = await call("/api/model-health");
    expect(status).toBe(200);
    expect(body.data.versions.riskEngine).toContain("risk-engine");
    expect(body.data.versions.classification).toContain("classify");
    expect(Array.isArray(body.data.runs)).toBe(true);
    expect(body.data.confidenceDistribution.buckets.length).toBe(5);
  });
});

describe("static registries", () => {
  test("jurisdictions expose GeoJSON polygons", async () => {
    const { status, body } = await call("/api/jurisdictions");
    expect(status).toBe(200);
    expect(body.data).toHaveLength(3);
    for (const j of body.data) {
      expect(j.geometry.type).toBe("Polygon");
      expect(j.geometry.coordinates[0].length).toBeGreaterThan(4);
      expect(j.dataLabel).toContain("SYNTHETIC");
    }
  });

  test("agencies include the seven pilot agencies", async () => {
    const { body } = await call("/api/agencies");
    const codes = body.data.map((a: any) => a.code);
    expect(codes).toContain("MCD");
    expect(codes).toContain("PWD");
    expect(codes).toContain("NDMC");
    expect(codes).toContain("IFC");
    expect(codes).toContain("DDMA");
  });

  test("assets include drains with condition scores", async () => {
    const { body } = await call("/api/assets");
    expect(body.data.length).toBeGreaterThanOrEqual(18);
    const drains = body.data.filter((a: any) => a.kind === "DRAIN");
    expect(drains.length).toBeGreaterThan(4);
    for (const a of body.data) {
      expect(a.conditionScore).toBeGreaterThanOrEqual(0);
      expect(a.conditionScore).toBeLessThanOrEqual(100);
    }
  });

  test("weather returns synthetic stations with series", async () => {
    const { body } = await call("/api/weather?hours=72");
    expect(body.data.stations).toHaveLength(4);
    expect(body.data.series.length).toBeGreaterThan(50);
    expect(body.data.stations.every((s: any) => s.dataLabel.includes("SYNTHETIC"))).toBe(true);
  });

  test("history returns labelled incidents", async () => {
    const { body } = await call("/api/history");
    expect(body.data.length).toBeGreaterThan(30);
    expect(body.data.every((i: any) => i.dataLabel.includes("SYNTHETIC"))).toBe(true);
  });
});

describe("event & report surface", () => {
  test("GET /api/events returns risk-sorted events with envelope", async () => {
    const { status, body } = await call("/api/events?limit=30");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThan(5);
    const scores = body.data.map((e: any) => e.riskScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
    for (const e of body.data) {
      expect(e.code).toMatch(/^UE-\d{4}-\d{4}$/);
      expect(["LOW", "MODERATE", "HIGH", "CRITICAL"]).toContain(e.riskBand);
    }
  });

  test("GET /api/events filters by risk band", async () => {
    const { body } = await call("/api/events?riskBand=HIGH");
    expect(body.data.every((e: any) => e.riskBand === "HIGH")).toBe(true);
  });

  test("GET /api/events/:code returns full dossier with audit history", async () => {
    expect(seededEventCode).toBeTruthy();
    const { status, body } = await call(`/api/events/${seededEventCode}`);
    expect(status).toBe(200);
    const d = body.data;
    expect(d.event.code).toBe(seededEventCode);
    expect(d.event.riskFactors.length).toBe(7);
    expect(Array.isArray(d.event.reports)).toBe(true);
    expect(Array.isArray(d.auditHistory)).toBe(true);
    expect(d.context.assets.length).toBeGreaterThan(3);
  });

  test("GET /api/events/:id/responsibility returns chain + rules", async () => {
    const { body } = await call(`/api/events/${seededEventCode}/responsibility`);
    expect(body.ok).toBe(true);
    expect(body.data.chain.length).toBeGreaterThanOrEqual(3);
    expect(body.data.chain[0].level).toBe("EVENT");
    expect(body.data.ruleVersion).toContain("routing-rules");
    expect(body.data.actions.length).toBeGreaterThan(0);
  });

  test("GET /api/reports lists with classification provenance", async () => {
    const { body } = await call("/api/reports?limit=10");
    expect(body.data.length).toBeGreaterThan(0);
    for (const r of body.data) {
      expect(r.publicRef).toMatch(/^CR-/);
      if (r.classification) {
        expect(["GLM", "MOCK", "RULE"]).toContain(r.classification.provider);
      }
    }
  });

  test("GET /api/reports/:unknownRef returns 404 structured error", async () => {
    const { status, body } = await call("/api/reports/CR-XXXXX");
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("report ingestion pipeline (live submission)", () => {
  test("POST /api/reports runs the full engine and returns provenance", { timeout: 60_000 }, async () => {
    const { status, body } = await call("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description:
          "Integration test: waterlogging on the road near the market after heavy rain, autos avoiding the stretch.",
        category: "WATERLOGGING",
        severityReported: "MEDIUM",
        lat: 28.7005,
        lng: 77.2042,
        addressText: "Integration test location",
        channel: "WEB",
        consentGiven: true,
      }),
    });
    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    const d = body.data;
    submittedRef = d.publicRef;
    expect(d.publicRef).toMatch(/^CR-/);
    expect(["EVENT_CREATED", "ATTACHED_DUPLICATE", "REOPENED_RECURRENCE"]).toContain(d.pipelineAction);
    expect(d.classification.category).toBeTruthy();
    expect(d.classification.severity).toBeTruthy();
    expect(d.classification.confidence).toBeGreaterThan(0);
    expect(["GLM", "MOCK"]).toContain(d.classification.provider);
    expect(d.risk.score).toBeGreaterThanOrEqual(0);
    expect(d.risk.score).toBeLessThanOrEqual(100);
    expect(d.routing.length).toBeGreaterThan(0);
    expect(d.routing[0].agency).toBeTruthy();
  });

  test("submitted report is retrievable by publicRef", async () => {
    expect(submittedRef).toBeTruthy();
    const { status, body } = await call(`/api/reports/${submittedRef}`);
    expect(status).toBe(200);
    expect(body.data.publicRef).toBe(submittedRef);
    expect(body.data.classification).toBeTruthy();
  });

  test("POST /api/reports rejects invalid body with 422", async () => {
    const { status, body } = await call("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "too short", lat: 99, lng: 99 }),
    });
    expect(status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeTruthy();
  });

  test("POST /api/reports rejects missing consent", async () => {
    const { status } = await call("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "A long enough description for validation testing",
        lat: 28.63,
        lng: 77.22,
        consentGiven: false,
      }),
    });
    expect(status).toBe(422);
  });
});

describe("AI endpoints", () => {
  test("POST /api/ai/cluster returns deterministic clusters with method label", async () => {
    const { status, body } = await call("/api/ai/cluster", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-role": "ANALYST" },
      body: JSON.stringify({ radiusM: 150 }),
    });
    expect(status).toBe(200);
    expect(body.data.clusters.length).toBeGreaterThan(0);
    expect(body.meta.method).toContain("union-find");
    for (const c of body.data.clusters) {
      expect(c.members.length).toBeGreaterThanOrEqual(2);
      expect(c.centroid.lat).toBeGreaterThan(28);
    }
  });

  test("POST /api/ai/risk recomputes risk and returns advisory with provenance", { timeout: 60_000 }, async () => {
    const { body } = await call("/api/ai/risk", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-role": "ANALYST" },
      body: JSON.stringify({ eventId: seededEventCode }),
    });
    expect(body.ok).toBe(true);
    expect(body.data.risk.factors).toHaveLength(7);
    expect(body.data.risk.score).toBeGreaterThanOrEqual(0);
    // advisory: either GLM or honest deterministic fallback
    expect(["GLM", "MOCK"]).toContain(body.data.advisory.provider);
    if (body.data.advisory.fallbackUsed) {
      expect(typeof body.data.advisory.error).toBe("string");
    }
  });
});

describe("authorization boundaries & workflow validation", () => {
  test("assign without operator role is forbidden (403)", async () => {
    const { status, body } = await call(`/api/events/${seededEventCode}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // no x-demo-role → CITIZEN
      body: JSON.stringify({ agencyCode: "PWD" }),
    });
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("verification stage out of order is rejected (409)", async () => {
    // OBSERVED requires DISPATCHED first on a fresh event
    const events = await call("/api/events?status=TRIAGED&limit=1");
    const target = events.body.data[0];
    expect(target).toBeTruthy();
    const { status, body } = await call(`/api/events/${target.id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-role": "FIELD_TEAM" },
      body: JSON.stringify({ stage: "OBSERVED", waterDepthCm: 30 }),
    });
    expect(status).toBe(409);
    expect(body.error.code).toBe("STAGE_OUT_OF_ORDER");
  });

  test("merge requires confirmation body and role", async () => {
    const { status } = await call(`/api/events/${seededEventCode}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duplicateEventId: "x", rationale: "test rationale" }),
    });
    expect(status).toBe(403); // CITIZEN cannot merge
  });

  test("admin reseed refuses without confirm:true", async () => {
    const { status, body } = await call("/api/admin/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-role": "ADMIN" },
      body: JSON.stringify({}),
    });
    expect(status).toBe(422);
  });
});

describe("analytics (synthetic evaluation, labelled)", () => {
  test("baseline endpoint returns metrics in 0-1 with label", async () => {
    const { status, body } = await call("/api/analytics/baseline");
    expect(status).toBe(200);
    const m = body.data.metrics;
    for (const key of ["precision", "recall", "f1", "auc"]) {
      expect(m[key]).toBeGreaterThanOrEqual(0);
      expect(m[key]).toBeLessThanOrEqual(1);
    }
    expect(body.meta.evaluationLabel).toContain("SYNTHETIC");
  });

  test("proposed endpoint returns comparison + operational metrics", async () => {
    const { body } = await call("/api/analytics/proposed");
    const d = body.data;
    expect(d.comparison.baseline).toBeTruthy();
    expect(d.comparison.proposed).toBeTruthy();
    expect(d.responsibilityRouting.evaluated).toBeGreaterThan(0);
    expect(d.responsibilityRouting.accuracy).toBeGreaterThanOrEqual(0);
    expect(d.duplicateClustering.ari).toBeLessThanOrEqual(1);
    expect(d.methodology.length).toBeGreaterThan(100);
    expect(body.meta.evaluationLabel).toContain("NOT measured real-world performance");
  });

  test("hotspots return computed + ground truth, labelled separately", async () => {
    const { body } = await call("/api/hotspots");
    expect(body.data.groundTruth).toHaveLength(6);
    expect(body.data.computed.length).toBeGreaterThan(0);
    expect(body.data.groundTruth.every((h: any) => h.dataLabel.includes("SYNTHETIC"))).toBe(true);
    expect(body.data.computed.every((h: any) => h.dataLabel.includes("MODEL_OUTPUT"))).toBe(true);
  });
});
