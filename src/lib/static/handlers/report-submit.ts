import { ok, parseBody, rateLimit, resolveActor, type HandlerResult } from "../envelope";
import { reportCreateSchema } from "@/lib/validation";
import { ingestReport } from "../engine/pipeline";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former POST /api/reports route (src/app/api/reports/route.ts)
// for the in-browser API. Only the POST lives here; the GET list route is
// ported by agent 17-a (handlers/reports.ts). Runs the full Urban Event
// Engine pipeline against the static db: same rate limit, same 201 envelope,
// same meta labels ("ingest-report v1", liveSubmission: true). Rate-limit key
// mirrors the server's clientKey("reports-post") with the local client ip.

// POST /api/reports - citizen report ingestion (public, rate-limited).
// Runs the full Urban Event Engine pipeline.
export async function submitReport(ctx: HandlerCtx): Promise<HandlerResult> {
  rateLimit("reports-post:local", 12, 60_000);
  const input = parseBody(ctx.body, reportCreateSchema);
  const actor = resolveActor(ctx.role);
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
}

export const reportSubmitRoutes: RouteDef[] = [
  { method: "POST", segments: ["reports"], handler: submitReport },
];
