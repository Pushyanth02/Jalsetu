import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { dumpTables } from "./db";
import type { SnapshotFile, SnapshotTables } from "./types";

// OFFLINE ONLY (bun/node) persistence for the static deployment.
//
// This module imports `node:fs` and must NEVER be imported by app/browser
// code - it exists solely for the offline seed script
// (`bun run src/scripts/seed.ts`), which regenerates the synthetic demo
// dataset deterministically in memory (src/lib/static/seed/generate.ts, no
// Prisma, no SQLite, no network) and writes it straight into
// `src/data/snapshot.json`. The committed snapshot is then loaded in the
// browser by src/lib/static/db.ts.

/** Canonical table order - identical to the committed src/data/snapshot.json. */
const TABLE_ORDER: (keyof SnapshotTables)[] = [
  "agency",
  "jurisdiction",
  "infrastructureAsset",
  "weatherObservation",
  "historicalIncident",
  "maintenanceAction",
  "citizenReport",
  "urbanEvent",
  "evidence",
  "responsibilityLink",
  "actionItem",
  "verification",
  "riskAssessment",
  "modelRun",
  "auditLog",
  "hotspot",
  "user",
];

export interface SaveSnapshotResult {
  bytes: number;
  counts: Record<string, number>;
}

/**
 * Dump the live in-memory tables (via `dumpTables()`) and write them to
 * `outPath` as a snapshot file with the same `meta` block shape as the
 * committed `src/data/snapshot.json`. Rows are serialized immediately
 * (dumpTables returns live references; Date values become ISO strings through
 * JSON.stringify). Returns the written byte count and per-table row counts.
 */
export async function saveSnapshotToFile(outPath: string): Promise<SaveSnapshotResult> {
  const live = await dumpTables();

  const tables = {} as Record<keyof SnapshotTables, unknown[]>;
  for (const name of TABLE_ORDER) {
    tables[name] = live[name];
  }

  const snapshot: SnapshotFile = {
    meta: {
      generatedAt: new Date().toISOString(),
      dataset: "JalSetu - Delhi Waterlogging Intelligence, Synthetic Demo Dataset",
      license: "https://creativecommons.org/licenses/by/4.0/",
      provenance:
        "Deterministic seeded demonstration data (mulberry32 RNG) generated offline by the in-memory static engine (no database, no server). Every record is synthetic demonstration data and must never be quoted as a real measurement.",
      notOfficial:
        "Research prototype. Not a deployed government system and not an official warning service.",
    },
    tables: tables as SnapshotFile["tables"],
  };

  const json = JSON.stringify(snapshot, null, 0);
  const out = resolve(outPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json, "utf8");

  const counts: Record<string, number> = {};
  for (const name of TABLE_ORDER) {
    counts[name] = tables[name].length;
  }
  return { bytes: Buffer.byteLength(json, "utf8"), counts };
}
