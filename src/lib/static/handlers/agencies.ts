import { mdb } from "../db";
import { ok, type HandlerResult } from "../envelope";
import type { HandlerCtx, RouteDef } from "../router";

// Port of the former GET /api/agencies route (src/app/api/agencies/route.ts)
// for the in-browser API. Agency registry with routing notes. The Prisma
// groupBy _count is unknown-typed in the static client, so it is cast with
// Number() where consumed (per the static-db contract). Semantics preserved
// 1:1.

export async function agencies(_ctx: HandlerCtx): Promise<HandlerResult> {
  const agencies = await mdb.agency.findMany({ orderBy: { code: "asc" } });
  const links = await mdb.responsibilityLink.groupBy({ by: ["agencyCode"], where: { status: "ACTIVE" }, _count: true });
  const byCode = new Map<string, number>(
    links.map((l) => [String(l.agencyCode), Number(l._count)])
  );
  return ok(
    agencies.map((a) => ({
      code: a.code, name: a.name, kind: a.kind, hotline: a.hotline, notes: a.notes,
      activeEvents: byCode.get(a.code) ?? 0,
    }))
  );
}

export const agenciesRoutes: RouteDef[] = [
  { method: "GET", segments: ["agencies"], handler: agencies },
];
