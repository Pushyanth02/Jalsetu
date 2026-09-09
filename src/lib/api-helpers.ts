import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

// Structured API helpers: consistent envelopes, status codes, logging, errors.

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

export type ApiOk<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type ApiErr = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data, ...(meta ? { meta } : {}) }, { status });
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json<ApiErr>(
    { ok: false, error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status }
  );
}

/** Resolve demo role from header. Default CITIZEN (read-only-safe) for unauthenticated. */
export function resolveActor(req: NextRequest): Actor {
  const raw = req.headers.get("x-demo-role") ?? "CITIZEN";
  const allowed: Actor[] = ["ANALYST", "AGENCY", "ADMIN", "CITIZEN", "FIELD_TEAM"];
  const upper = raw.toUpperCase() as Actor;
  return allowed.includes(upper) ? upper : "CITIZEN";
}

export function requireRole(req: NextRequest, roles: Actor[]): Actor {
  const actor = resolveActor(req);
  if (!roles.includes(actor)) {
    throw new ApiError(403, "FORBIDDEN", `Requires role: ${roles.join(" or ")}. Current: ${actor}`);
  }
  return actor;
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Request body failed validation", flattenZod(result.error));
  }
  return result.data;
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Query parameters failed validation", flattenZod(result.error));
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

/** Wrap a handler with structured errors + request logging. */
export function handler<A extends unknown[]>(
  fn: (req: NextRequest, ...args: A) => Promise<Response>
) {
  return async (req: NextRequest, ...args: A): Promise<Response> => {
    const started = Date.now();
    try {
      const res = await fn(req, ...args);
      if (process.env.NODE_ENV !== "production") {
         
        console.log(
          `[api] ${req.method} ${req.nextUrl.pathname} → ${res.status} (${Date.now() - started}ms)`
        );
      }
      return res;
    } catch (err) {
      if (err instanceof ApiError) {
         
        console.warn(
          `[api] ${req.method} ${req.nextUrl.pathname} → ${err.status} ${err.code}: ${err.message}`
        );
        return fail(err.status, err.code, err.message, err.details);
      }
      if (err instanceof ZodError) {
        return fail(422, "VALIDATION_ERROR", "Validation failed", flattenZod(err));
      }
      // Unknown error: log server-side detail, return safe message.
       
      console.error(`[api] ${req.method} ${req.nextUrl.pathname} → 500`, err);
      return fail(500, "INTERNAL", "Internal server error. The incident has been logged.");
    }
  };
}

// --- in-memory rate limiter (per-process, demo-grade) ----------------------

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

export function clientKey(req: NextRequest, scope: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "local";
  return `${scope}:${ip}`;
}
