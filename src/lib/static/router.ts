import { ApiError, fail, type Envelope, type HandlerResult } from "./envelope";
import { eventsRoutes } from "./handlers/events";
import { overviewRoutes } from "./handlers/overview";
import { eventDetailRoutes } from "./handlers/event-detail";
import { reportsRoutes } from "./handlers/reports";
import { reportDetailRoutes } from "./handlers/report-detail";
import { reportSubmitRoutes } from "./handlers/report-submit";
import { hotspotsRoutes } from "./handlers/hotspots";
import { jurisdictionsRoutes } from "./handlers/jurisdictions";
import { assetsRoutes } from "./handlers/assets";
import { weatherRoutes } from "./handlers/weather";
import { healthRoutes } from "./handlers/health";
import { modelHealthRoutes } from "./handlers/model-health";
import { dataHealthRoutes } from "./handlers/data-health";
import { historyRoutes } from "./handlers/history";
import { agenciesRoutes } from "./handlers/agencies";
import { analyticsRoutes } from "./handlers/analytics";
import { mutationRoutes } from "./handlers/mutations";
import { aiRoutes } from "./handlers/ai";

// In-browser API router. The former REST API (src/app/api/**) ran on a Node
// server with Prisma; the static export cannot ship a server, so every
// endpoint is implemented against the in-browser database (`mdb`) and reached
// through `staticApi()` from src/lib/client/api.ts. Paths, methods, envelopes,
// status codes, validation and honest labels are preserved 1:1 so the views
// needed zero changes.

export type Method = "GET" | "POST" | "PUT";

export interface HandlerCtx {
  method: Method;
  path: string;
  /** Path segments after /api (query string removed). */
  segments: string[];
  /** Values captured from ":param" route segments. */
  pathParams: Record<string, string>;
  searchParams: URLSearchParams;
  /** Parsed JSON body (mutations). */
  body: unknown;
  /** Raw x-demo-role value ("CITIZEN" when absent). */
  role: string;
}

export type Handler = (ctx: HandlerCtx) => Promise<HandlerResult>;

export interface RouteDef {
  method: Method;
  /** Segments after /api; the literal ":param" captures one segment. */
  segments: (string | ":param")[];
  handler: Handler;
}

const routes: RouteDef[] = [
  ...eventsRoutes,
  ...overviewRoutes,
  ...eventDetailRoutes,
  ...reportsRoutes,
  ...reportDetailRoutes,
  ...reportSubmitRoutes,
  ...hotspotsRoutes,
  ...jurisdictionsRoutes,
  ...assetsRoutes,
  ...weatherRoutes,
  ...healthRoutes,
  ...modelHealthRoutes,
  ...dataHealthRoutes,
  ...historyRoutes,
  ...agenciesRoutes,
  ...analyticsRoutes,
  ...mutationRoutes,
  ...aiRoutes,
];

function matchSegments(pattern: (string | ":param")[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const expected = pattern[i];
    if (expected.startsWith(":")) {
      // ":id" (and the legacy ":param") both capture the entity id; other
      // ":name" placeholders capture under their own name.
      const name = expected === ":param" || expected === ":id" ? "id" : expected.slice(1);
      params[name] = actual[i];
    } else if (expected.toLowerCase() !== actual[i].toLowerCase()) {
      return null;
    }
  }
  return params;
}

export interface StaticApiResponse {
  status: number;
  envelope: Envelope;
}

/**
 * Dispatch an API call fully in the browser.
 *
 * @param path   API path with optional query string, e.g. "/api/events?limit=5"
 * @param init   method + parsed body + demo role
 */
export async function staticApi(
  path: string,
  init?: { method?: string; body?: unknown; role?: string }
): Promise<StaticApiResponse> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "POST" && method !== "PUT") {
    return fail(405, "METHOD_NOT_ALLOWED", `Method ${method} is not supported by the static API`);
  }
  const [cleanPath, queryString = ""] = path.split("?");
  const searchParams = new URLSearchParams(queryString);
  const segments = cleanPath.split("/").filter(Boolean).slice(1); // drop "api"

  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchSegments(route.segments, segments);
    if (!params) continue;
    const ctx: HandlerCtx = {
      method,
      path: cleanPath,
      segments,
      pathParams: params,
      searchParams,
      body: init?.body,
      role: typeof init?.role === "string" ? init.role : "",
    };
    try {
      const result = await route.handler(ctx);
      const status = result.status ?? 200;
      // Reproduce the JSON wire boundary: the former HTTP API serialized every
      // response to JSON (Date objects -> ISO strings, undefined keys dropped).
      // The views were built against that wire format, so the in-browser router
      // applies the exact same serialization before handing data to the client.
      const envelope = JSON.parse(
        JSON.stringify({
          ok: true,
          data: result.data,
          ...(result.meta ? { meta: result.meta } : {}),
        })
      ) as Envelope;
      return { status, envelope };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, err.code, err.message, err.details);
      }
      const message = err instanceof Error ? err.message : String(err);
      return fail(500, "INTERNAL", `Static engine error: ${message}`);
    }
  }
  return fail(404, "NOT_FOUND", `No static handler for ${method} ${cleanPath}`);
}
