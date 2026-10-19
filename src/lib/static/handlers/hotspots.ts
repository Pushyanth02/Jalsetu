import { mdb } from "../db";
import { ok, type HandlerResult } from "../envelope";
import { computeHotspots } from "../engine/analytics";
import { fromJson } from "../instrument";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/hotspots route (src/app/api/hotspots/route.ts)
// for the in-browser API. Computed risk hotspots + ground truth, both honestly
// labelled. Semantics and envelope shape preserved 1:1.

export async function hotspots(_ctx: HandlerCtx): Promise<HandlerResult> {
  const [computed, ground] = await Promise.all([
    computeHotspots(),
    mdb.hotspot.findMany({ where: { kind: "GROUND_TRUTH" } }),
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
}

export const hotspotsRoutes: RouteDef[] = [
  { method: "GET", segments: ["hotspots"], handler: hotspots },
];
