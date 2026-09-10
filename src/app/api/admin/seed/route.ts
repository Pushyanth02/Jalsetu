import { db } from "@/lib/db";
import { handler, ok, requireRole, parseBody, ApiError } from "@/lib/api-helpers";
import { seedAdminSchema } from "@/lib/validation";
import { seedDatabase } from "@/lib/seed/generate";
import { invalidateProviderHealth } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/admin/seed - regenerate the deterministic demo dataset (ADMIN only).
export const POST = handler(async (req) => {
  requireRole(req, ["ADMIN"]);
  const body = await parseBody(req, seedAdminSchema);
  if (!body.confirm) throw new ApiError(400, "CONFIRM_REQUIRED", "Pass confirm:true");
  const result = await seedDatabase();
  invalidateProviderHealth();
  return ok(result, { note: "Deterministic synthetic demo dataset regenerated. All prior data destroyed." });
});
