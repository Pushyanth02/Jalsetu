// bun run src/scripts/seed.ts [--out path]
// Regenerates src/data/snapshot.json deterministically (synthetic demo data).
//
// Fully offline + database-free: the dataset is rebuilt in memory through the
// static engine (mdb + deterministic MockProvider classification, no Prisma,
// no SQLite, no network) and written directly to the snapshot file that the
// deployed app loads in the browser. With --out the result goes to an
// arbitrary path (smoke tests) - the committed snapshot is only touched when
// run without arguments.

import { resolve } from "node:path";
import { mdb, resetStaticDb } from "../lib/static/db";
import { seedDatabase } from "../lib/static/seed/generate";
import { saveSnapshotToFile } from "../lib/static/persist";

function parseOutPath(argv: string[]): string {
  const i = argv.indexOf("--out");
  if (i !== -1) {
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      // fail fast rather than silently falling back to the committed snapshot
      throw new Error("--out requires a file path argument");
    }
    return resolve(value);
  }
  return resolve(process.cwd(), "src/data/snapshot.json");
}

async function main(): Promise<void> {
  const out = parseOutPath(process.argv.slice(2));

  // Start from the pristine committed snapshot (any query force-loads it);
  // seedDatabase() then wipes all 17 tables and rebuilds them deterministically.
  resetStaticDb();
  await mdb.agency.count();

  const result = await seedDatabase();
  console.log(
    `Seeded: ${result.reports} reports, ${result.events} urban events, ${result.observations} weather observations.`
  );

  const { bytes, counts } = await saveSnapshotToFile(out);
  const kb = (bytes / 1024).toFixed(0);
  console.log(`[seed] written ${out} (${kb} KB)`);
  console.log("[seed] row counts:", counts);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
