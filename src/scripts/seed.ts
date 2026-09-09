// Run: bun run src/scripts/seed.ts
import { seedDatabase } from "../lib/seed/generate";
import { db } from "../lib/db";

async function main() {
  const result = await seedDatabase();
  console.log(
    `Seeded: ${result.reports} reports, ${result.events} urban events, ${result.observations} weather observations.`
  );
  const counts = {
    jurisdictions: await db.jurisdiction.count(),
    assets: await db.infrastructureAsset.count(),
    incidents: await db.historicalIncident.count(),
    maintenance: await db.maintenanceAction.count(),
    evidence: await db.evidence.count(),
    verifications: await db.verification.count(),
    actions: await db.actionItem.count(),
    hotspots: await db.hotspot.count(),
    audit: await db.auditLog.count(),
  };
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
