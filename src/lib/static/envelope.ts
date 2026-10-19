import { ZodError, type ZodType } from "zod";

// Client-safe API helpers for the in-browser API shim. Mirrors the semantics
// of the former server-side src/lib/api-helpers.ts (envelopes, status codes,
// zod validation, roles, demo-grade rate limiting) without next/server.

export type Actor = "ANALYST" | "AGENCY" | "ADMIN" | "CITIZEN" | "FIELD_TEAM";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export interface HandlerResult {
  status?: number;
  data: unknown;
  meta?: Record<string, unknown>;
}

export type ApiOk<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown } };
export type Envelope = ApiOk<unknown> | ApiErr;

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200): HandlerResult {
  return { status, data, ...(meta ? { meta } : {}) };
}

export function fail(status: number, code: string, message: string, details?: unknown): { status: number; envelope: ApiErr } {
  return {
    status,
    envelope: { ok: false, error: { code, message, ...(details !== undefined ? { details } : {}) } },
  };
}

/** Resolve demo role (sent as `role` alongside the request). Default CITIZEN. */
export function resolveActor(role: unknown): Actor {
  const raw = typeof role === "string" ? role : "CITIZEN";
  const allowed: Actor[] = ["ANALYST", "AGENCY", "ADMIN", "CITIZEN", "FIELD_TEAM"];
  const upper = raw.toUpperCase() as Actor;
  return allowed.includes(upper) ? upper : "CITIZEN";
}

export function requireRole(ctx: { role: unknown }, roles: Actor[]): Actor {
  const actor = resolveActor(ctx.role);
  if (!roles.includes(actor)) {
    throw new ApiError(403, "FORBIDDEN", `Requires role: ${roles.join(" or ")}. Current: ${actor}`);
  }
  return actor;
}

export function parseQuery<T>(searchParams: URLSearchParams, schema: ZodType<T>): T {
  const params = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Query parameters failed validation", flattenZod(result.error));
  }
  return result.data;
}

export function parseBody<T>(body: unknown, schema: ZodType<T>): T {
  if (body === undefined || body === null) {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Request body failed validation", flattenZod(result.error));
  }
  return result.data;
}

function flattenZod(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    out[issue.path.join(".") || "_"] = issue.message;
  }
  return out;
}

// --- demo-grade in-memory rate limiter (per browser tab) ----------------------

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const retryIn = Math.ceil((bucket.resetAt - now) / 1000);
    throw new ApiError(429, "RATE_LIMITED", `Too many requests. Retry in ${retryIn}s.`);
  }
}
