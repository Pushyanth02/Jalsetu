import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, parseBody, rateLimit, clientKey } from "@/lib/api-helpers";
import { clusterSchema } from "@/lib/validation";
import { clusterByProximity } from "@/lib/engine/duplicate";
import { CLUSTER_VERSION } from "@/lib/ai/provider";
import { startModelRun, finishModelRun, audit } from "@/lib/json";

export const dynamic = "force-dynamic";

// POST /api/ai/cluster - deterministic proximity clustering of reports
// (duplicate detection investigation). Explainable, no black box.
export const POST = handler(async (req: NextRequest) => {
  rateLimit(clientKey(req, "ai-cluster"), 20, 60_000);
  const body = await parseBody(req, clusterSchema);

  const reports = body.reportIds
    ? await db.citizenReport.findMany({ where: { id: { in: body.reportIds } } })
    : await db.citizenReport.findMany({ where: { submittedAt: { gte: new Date(Date.now() - 72 * 3600_000) } } });

  const runId = await startModelRun({
    modelId: "cluster",
    version: CLUSTER_VERSION,
    provider: "RULE",
    inputCount: reports.length,
    notes: `radius ${body.radiusM}m`,
  });

  const { clusters, singletons } = clusterByProximity(
    reports.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, publicRef: r.publicRef, category: r.category, severityReported: r.severityReported, description: r.description.slice(0, 90), submittedAt: r.submittedAt.toISOString(), urbanEventId: r.urbanEventId })),
    body.radiusM
  );

  await finishModelRun(runId, { status: "SUCCEEDED", outputCount: clusters.length, latencyMs: 0, notes: `${clusters.length} clusters, ${singletons.length} singletons` });
  await audit({ actor: "SYSTEM", action: "CLUSTERED", entityType: "CitizenReport", entityId: "batch", after: { clusters: clusters.length, radiusM: body.radiusM } });

  return ok(
    {
      clusters: clusters.map((c, i) => ({
        id: `CL-${String(i + 1).padStart(3, "0")}`,
        centroid: c.centroid,
        size: c.members.length,
        members: c.members,
        spatialDiameterM: Math.round(
          Math.max(...c.members.flatMap((m) => c.members.map((n) => haversine(m, n))))
        ),
      })),
      singletons: singletons.length,
    },
    {
      method: `union-find proximity clustering, radius ${body.radiusM}m`,
      version: CLUSTER_VERSION,
      evaluated: reports.length,
    }
  );
});

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
