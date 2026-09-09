import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api-helpers";
import { computeHotspots } from "@/lib/engine/analytics";
import { fromJson } from "@/lib/json";

export const dynamic = "force-dynamic";

// GET /api/hotspots - computed risk hotspots + ground truth (labelled).
export const GET = handler(async () => {
  const [computed, ground] = await Promise.all([
    computeHotspots(),
    db.hotspot.findMany({ where: { kind: "GROUND_TRUTH" } }),
  ]);
  return ok(
    {
      computed: computed.map((h) => ({ ...h, dataLabel: "MODEL_OUTPUT (engine risk grid)" })),
      groundTruth: ground.map((h) => ({
        code: h.code,
        name: h.name,
        lat: h.lat,
        lng: h.lng,
        radiusM: h.radiusM,
        dataLabel: "SYNTHETIC_DEMO (seeded known flood-prone locations)",
        evidence: fromJson<Record<string, unknown>>(h.evidenceJson, {}),
      })),
    },
    { method: "grid-based max-risk, 250m radius, local maxima suppression at 300m" }
  );
});
