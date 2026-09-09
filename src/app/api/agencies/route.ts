import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// GET /api/agencies - agency registry with routing notes.
export const GET = handler(async () => {
  const agencies = await db.agency.findMany({ orderBy: { code: "asc" } });
  const links = await db.responsibilityLink.groupBy({ by: ["agencyCode"], where: { status: "ACTIVE" }, _count: true });
  const byCode = new Map(links.map((l) => [l.agencyCode, l._count]));
  return ok(
    agencies.map((a) => ({
      code: a.code, name: a.name, kind: a.kind, hotline: a.hotline, notes: a.notes,
      activeEvents: byCode.get(a.code) ?? 0,
    }))
  );
});
