import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, parseBody, parseQuery, rateLimit, clientKey, ApiError, resolveActor } from "@/lib/api-helpers";
import { reportCreateSchema, reportsListQuerySchema } from "@/lib/validation";
import { ingestReport } from "@/lib/engine/pipeline";

export const dynamic = "force-dynamic";

// POST /api/reports - citizen report ingestion (public, rate-limited).
// Runs the full Urban Event Engine pipeline.
export const POST = handler(async (req: NextRequest) => {
  rateLimit(clientKey(req, "reports-post"), 12, 60_000);
  const input = await parseBody(req, reportCreateSchema);
  const actor = resolveActor(req);
  const outcome = await ingestReport(input, actor === "CITIZEN" ? "CITIZEN" : actor);

  return ok(
    {
      reportId: outcome.reportId,
      publicRef: outcome.publicRef,
      event: { id: outcome.eventId, code: outcome.eventCode, status: outcome.eventStatus },
      pipelineAction: outcome.action,
      duplicateOf: outcome.duplicateOf
        ? { code: outcome.duplicateOf.code, distanceM: outcome.duplicateOf.distanceM, reason: outcome.duplicateOf.reason, recurrence: outcome.duplicateOf.isRecurrence }
        : null,
      classification: {
        provider: outcome.classification.provider,
        modelId: outcome.classification.modelId,
        fallbackUsed: outcome.classification.fallbackUsed,
        category: outcome.classification.output.category,
        severity: outcome.classification.output.severity,
        confidence: outcome.classification.output.confidence,
        summary: outcome.classification.output.summary,
      },
      risk: { score: outcome.risk.score, band: outcome.risk.band },
      routing: outcome.routing.links.map((l) => ({ agency: l.agencyCode, role: l.role })),
    },
    { pipeline: "ingest-report v1", liveSubmission: true },
    201
  );
});

// GET /api/reports - list reports with classification status.
export const GET = handler(async (req: NextRequest) => {
  const q = parseQuery(req, reportsListQuerySchema);
  const where = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.hours ? { submittedAt: { gte: new Date(Date.now() - q.hours * 3600_000) } } : {}),
  };
  const [total, reports] = await Promise.all([
    db.citizenReport.count({ where }),
    db.citizenReport.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      take: q.limit,
      skip: q.offset,
      select: {
        id: true, publicRef: true, description: true, category: true, severityReported: true,
        lat: true, lng: true, addressText: true, submittedAt: true, channel: true, status: true,
        isDuplicate: true, urbanEventId: true, source: true,
        classificationProvider: true, classificationModel: true, classificationConfidence: true,
      },
    }),
  ]);
  return ok(
    reports.map((r) => ({
      ...r,
      classification: r.classificationProvider
        ? { provider: r.classificationProvider, modelId: r.classificationModel, confidence: r.classificationConfidence }
        : null,
    })),
    { total, limit: q.limit, offset: q.offset, dataLabel: "SYNTHETIC_DEMO + live submissions" }
  );
});
