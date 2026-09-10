import type { SnapshotFile, SnapshotTables } from "./types";

// In-browser database for the fully static deployment. `src/data/snapshot.json`
// is the committed synthetic demo dataset (exported offline by
// `bun run snapshot`); this module revives it into typed tables and exposes a
// deliberately Prisma-shaped client (`mdb`) so the engine + API logic could be
// ported from the server almost verbatim. Mutations are session-only: they run
// entirely in this browser tab and reset on reload (documented honestly).

type Row = Record<string, unknown>;
type OrderSpec = Record<string, "asc" | "desc">;

interface RelationSpec {
  model: keyof SnapshotTables;
  type: "one" | "many";
  /** to-one: FK field on THIS row pointing at the target's `refField`. */
  localKey?: string;
  refField?: string;
  /** to-many: FK field on the CHILD rows pointing at this row's id. */
  foreignKey?: string;
}

interface IncludeSpec {
  orderBy?: OrderSpec | OrderSpec[];
  take?: number;
  skip?: number;
  select?: Record<string, true>;
  include?: Record<string, IncludeSpec | true>;
}

export interface QueryArgs {
  where?: Record<string, unknown>;
  orderBy?: OrderSpec | OrderSpec[];
  take?: number;
  skip?: number;
  select?: Record<string, true>;
  include?: Record<string, IncludeSpec | true>;
}

// --- model registry: date fields, defaults, relations ------------------------

const DATE_FIELDS: Record<keyof SnapshotTables, string[]> = {
  agency: ["createdAt"],
  jurisdiction: ["createdAt"],
  infrastructureAsset: ["lastInspectedAt", "createdAt"],
  weatherObservation: ["observedAt", "createdAt"],
  historicalIncident: ["occurredOn", "createdAt"],
  maintenanceAction: ["scheduledAt", "performedAt", "createdAt"],
  citizenReport: ["submittedAt", "createdAt"],
  urbanEvent: [
    "firstReportedAt",
    "lastActivityAt",
    "riskAssessedAt",
    "closedAt",
    "reopenedAt",
    "createdAt",
    "updatedAt",
  ],
  evidence: ["capturedAt", "createdAt"],
  responsibilityLink: ["assignedAt"],
  actionItem: ["assignedAt", "dueAt", "completedAt", "createdAt"],
  verification: ["verifiedAt", "createdAt"],
  riskAssessment: ["computedAt"],
  modelRun: ["startedAt", "finishedAt"],
  auditLog: ["at"],
  hotspot: ["createdAt"],
  user: ["createdAt", "updatedAt"],
};

/** Prisma @updatedAt behaviour: bump these fields on every update. */
const UPDATED_AT: Partial<Record<keyof SnapshotTables, string>> = {
  urbanEvent: "updatedAt",
  user: "updatedAt",
};

const RELATIONS: Partial<Record<keyof SnapshotTables, Record<string, RelationSpec>>> = {
  urbanEvent: {
    jurisdiction: { model: "jurisdiction", type: "one", localKey: "jurisdictionId", refField: "id" },
    reports: { model: "citizenReport", type: "many", foreignKey: "urbanEventId" },
    evidence: { model: "evidence", type: "many", foreignKey: "urbanEventId" },
    links: { model: "responsibilityLink", type: "many", foreignKey: "eventId" },
    actions: { model: "actionItem", type: "many", foreignKey: "eventId" },
    verifications: { model: "verification", type: "many", foreignKey: "eventId" },
    riskAssessments: { model: "riskAssessment", type: "many", foreignKey: "eventId" },
  },
  citizenReport: {
    urbanEvent: { model: "urbanEvent", type: "one", localKey: "urbanEventId", refField: "id" },
    evidence: { model: "evidence", type: "many", foreignKey: "reportId" },
  },
  evidence: {
    urbanEvent: { model: "urbanEvent", type: "one", localKey: "urbanEventId", refField: "id" },
    report: { model: "citizenReport", type: "one", localKey: "reportId", refField: "id" },
    verification: { model: "verification", type: "one", localKey: "verificationId", refField: "id" },
  },
  responsibilityLink: {
    event: { model: "urbanEvent", type: "one", localKey: "eventId", refField: "id" },
    asset: { model: "infrastructureAsset", type: "one", localKey: "assetId", refField: "id" },
    jurisdiction: { model: "jurisdiction", type: "one", localKey: "jurisdictionId", refField: "id" },
  },
  actionItem: {
    event: { model: "urbanEvent", type: "one", localKey: "eventId", refField: "id" },
    asset: { model: "infrastructureAsset", type: "one", localKey: "assetId", refField: "id" },
  },
  verification: {
    event: { model: "urbanEvent", type: "one", localKey: "eventId", refField: "id" },
    evidence: { model: "evidence", type: "many", foreignKey: "verificationId" },
  },
  riskAssessment: {
    event: { model: "urbanEvent", type: "one", localKey: "eventId", refField: "id" },
  },
  infrastructureAsset: {
    jurisdiction: { model: "jurisdiction", type: "one", localKey: "jurisdictionId", refField: "id" },
    maintenance: { model: "maintenanceAction", type: "many", foreignKey: "assetId" },
    links: { model: "responsibilityLink", type: "many", foreignKey: "assetId" },
    actions: { model: "actionItem", type: "many", foreignKey: "assetId" },
  },
  jurisdiction: {
    assets: { model: "infrastructureAsset", type: "many", foreignKey: "jurisdictionId" },
    events: { model: "urbanEvent", type: "many", foreignKey: "jurisdictionId" },
    incidents: { model: "historicalIncident", type: "many", foreignKey: "jurisdictionId" },
    maintenance: { model: "maintenanceAction", type: "many", foreignKey: "jurisdictionId" },
    links: { model: "responsibilityLink", type: "many", foreignKey: "jurisdictionId" },
  },
  historicalIncident: {
    jurisdiction: { model: "jurisdiction", type: "one", localKey: "jurisdictionId", refField: "id" },
  },
  maintenanceAction: {
    asset: { model: "infrastructureAsset", type: "one", localKey: "assetId", refField: "id" },
    jurisdiction: { model: "jurisdiction", type: "one", localKey: "jurisdictionId", refField: "id" },
  },
};

// --- snapshot loading + date revival -----------------------------------------

let tables: SnapshotTables | null = null;
let loadPromise: Promise<SnapshotTables> | null = null;
let idCounter = 0;

function newId(): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `c${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

async function ensure(): Promise<SnapshotTables> {
  if (tables) return tables;
  if (!loadPromise) {
    loadPromise = (async () => {
      const mod = (await import("@/data/snapshot.json")) as { default?: unknown };
      const raw = mod.default as SnapshotFile;
      const revived = {} as SnapshotTables;
      for (const name of Object.keys(raw.tables) as (keyof SnapshotTables)[]) {
        const rows = raw.tables[name] as Row[];
        const dateFields = new Set(DATE_FIELDS[name] ?? []);
        revived[name] = rows.map((row) => {
          const out: Row = { ...row };
          for (const field of dateFields) {
            const value = out[field];
            if (typeof value === "string") out[field] = new Date(value);
          }
          return out;
        }) as never;
      }
      tables = revived;
      return revived;
    })();
  }
  return loadPromise;
}

// --- where-clause evaluation --------------------------------------------------

function timeOf(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta != null && tb != null) return ta === tb;
  return false;
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last ascending
  if (b == null) return -1;
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta != null && tb != null) return ta - tb;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

function isOperatorObject(cond: unknown): cond is Record<string, unknown> {
  return (
    typeof cond === "object" &&
    cond !== null &&
    !(cond instanceof Date) &&
    !Array.isArray(cond) &&
    Object.keys(cond).some((k) =>
      ["in", "notIn", "gte", "lte", "gt", "lt", "contains", "not", "some", "every", "is"].includes(k)
    )
  );
}

function matchValue(rowValue: unknown, cond: unknown): boolean {
  if (isOperatorObject(cond)) {
    for (const [op, expected] of Object.entries(cond)) {
      switch (op) {
        case "in":
          if (!(expected as unknown[]).some((v) => eq(rowValue, v))) return false;
          break;
        case "notIn":
          if ((expected as unknown[]).some((v) => eq(rowValue, v))) return false;
          break;
        case "gte":
          if (cmp(rowValue, expected) < 0) return false;
          break;
        case "lte":
          if (cmp(rowValue, expected) > 0) return false;
          break;
        case "gt":
          if (cmp(rowValue, expected) <= 0) return false;
          break;
        case "lt":
          if (cmp(rowValue, expected) >= 0) return false;
          break;
        case "contains":
          if (!String(rowValue ?? "").toLowerCase().includes(String(expected).toLowerCase())) return false;
          break;
        case "not":
          if (eq(rowValue, expected)) return false;
          break;
        case "is":
          if (!eq(rowValue, expected)) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }
  return eq(rowValue, cond);
}

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR" && Array.isArray(cond)) {
      if (!cond.some((w) => matches(row, w as Record<string, unknown>))) return false;
      continue;
    }
    if (key === "AND" && Array.isArray(cond)) {
      if (!cond.every((w) => matches(row, w as Record<string, unknown>))) return false;
      continue;
    }
    if (key === "NOT" && cond && typeof cond === "object" && !Array.isArray(cond)) {
      if (matches(row, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (!matchValue(row[key], cond)) return false;
  }
  return true;
}

// --- sorting / projection / relations -----------------------------------------

function applyOrderBy<T extends Row>(rows: T[], orderBy?: OrderSpec | OrderSpec[]): T[] {
  if (!orderBy) return rows;
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  const sorted = [...rows];
  sorted.sort((a, b) => {
    for (const spec of specs) {
      for (const [field, dir] of Object.entries(spec)) {
        const result = cmp(a[field], b[field]);
        if (result !== 0) return dir === "desc" ? -result : result;
      }
    }
    return 0;
  });
  return sorted;
}

function project<T extends Row>(row: T, select?: Record<string, true>): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const key of Object.keys(select)) out[key] = row[key];
  return out;
}

function attachRelations(row: Row, modelName: keyof SnapshotTables, include?: Record<string, IncludeSpec | true>): void {
  if (!include) return;
  const relations = RELATIONS[modelName];
  if (!relations) return;
  for (const [name, spec] of Object.entries(include)) {
    const relation = relations[name];
    if (!relation) continue;
    const nested = (spec && spec !== true ? spec : {}) as IncludeSpec;
    if (relation.type === "many" && relation.foreignKey) {
      const children = (getRowsSync(modelName, relation.model) as Row[]).filter(
        (child) => eq(child[relation.foreignKey as string], row.id)
      );
      const ordered = applyOrderBy(children, nested.orderBy).slice(
        nested.skip ?? 0,
        nested.take != null ? (nested.skip ?? 0) + nested.take : undefined
      );
      row[name] = ordered.map((child) => decorate(child, relation.model, nested));
    } else if (relation.type === "one" && relation.localKey && relation.refField) {
      const localValue = row[relation.localKey];
      if (localValue == null) {
        row[name] = null;
      } else {
        const target = (getRowsSync(modelName, relation.model) as Row[]).find((child) =>
          eq(child[relation.refField as string], localValue)
        );
        row[name] = target ? decorate({ ...target }, relation.model, nested) : null;
      }
    }
  }
}

/** project + attachRelations for a single result row. */
function decorate(row: Row, modelName: keyof SnapshotTables, args: IncludeSpec): Row {
  const out = project(row, args.select);
  attachRelations(out, modelName, args.include);
  return out;
}

// getRowsSync: reads from the already-loaded table registry. All public query
// methods are async and await ensure() first, so sync access is safe here.
function getRowsSync(_parent: keyof SnapshotTables, model: keyof SnapshotTables): Row[] {
  const t = tables as unknown as Record<keyof SnapshotTables, Row[]> | null;
  if (!t) throw new Error("static-db: tables accessed before load (internal error)");
  return t[model] ?? [];
}

// --- write guards --------------------------------------------------------------

function assertPlainData(data: Record<string, unknown>, context: string): void {
  for (const [key, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Array.isArray(value) &&
      Object.keys(value).some((k) => ["connect", "disconnect", "set", "create", "update"].includes(k))
    ) {
      throw new Error(
        `static-db: nested relation ${context}.${key} is not supported - translate prisma connect into a plain FK field`
      );
    }
  }
}

// --- model client ---------------------------------------------------------------

export interface ModelClient<T> {
  findMany(args?: QueryArgs): Promise<T[]>;
  findFirst(args?: QueryArgs): Promise<T | null>;
  findUnique(args: { where: Record<string, unknown> }): Promise<T | null>;
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
  create(args: { data: Record<string, unknown> }): Promise<T>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<T>;
  updateMany(args: { where?: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  deleteMany(args?: { where?: Record<string, unknown> }): Promise<{ count: number }>;
  groupBy(args: { by: string[]; where?: Record<string, unknown>; _count?: boolean }): Promise<Array<Record<string, unknown>>>;
}

function notFound(where: Record<string, unknown>): Error {
  const first = Object.entries(where)[0];
  const label = first ? `${first[0]}=${String(first[1])}` : "unknown";
  return new Error(`static-db: record not found (${label})`);
}

function modelClient<T>(name: keyof SnapshotTables): ModelClient<T> {
  return {
    async findMany(args?: QueryArgs): Promise<T[]> {
      await ensure();
      let rows = getRowsSync(name, name).filter((row) => matches(row, args?.where));
      rows = applyOrderBy(rows, args?.orderBy);
      if (args?.skip) rows = rows.slice(args.skip);
      if (args?.take != null) rows = rows.slice(0, args.take);
      return rows.map((row) => decorate({ ...row }, name, args ?? {}) as T);
    },
    async findFirst(args?: QueryArgs): Promise<T | null> {
      await ensure();
      let rows = getRowsSync(name, name).filter((row) => matches(row, args?.where));
      rows = applyOrderBy(rows, args?.orderBy);
      if (args?.skip) rows = rows.slice(args.skip);
      if (args?.take != null) rows = rows.slice(0, args.take);
      const row = rows[0];
      return row ? (decorate({ ...row }, name, args ?? {}) as T) : null;
    },
    async findUnique(args: { where: Record<string, unknown> }): Promise<T | null> {
      await ensure();
      const [field, value] = Object.entries(args.where)[0];
      const row = getRowsSync(name, name).find((r) => eq(r[field], value));
      return row ? ({ ...row } as T) : null;
    },
    async count(args?: { where?: Record<string, unknown> }): Promise<number> {
      await ensure();
      return getRowsSync(name, name).filter((row) => matches(row, args?.where)).length;
    },
    async create(args: { data: Record<string, unknown> }): Promise<T> {
      await ensure();
      assertPlainData(args.data, `${name}.create`);
      const row: Row = { id: newId(), ...args.data };
      const store = getRowsSync(name, name);
      store.push(row);
      return { ...row } as T;
    },
    async update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<T> {
      await ensure();
      assertPlainData(args.data, `${name}.update`);
      const [field, value] = Object.entries(args.where)[0];
      const row = getRowsSync(name, name).find((r) => eq(r[field], value));
      if (!row) throw notFound(args.where);
      Object.assign(row, args.data);
      const updatedAtField = UPDATED_AT[name];
      if (updatedAtField) row[updatedAtField] = new Date();
      return { ...row } as T;
    },
    async updateMany(args: { where?: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }> {
      await ensure();
      assertPlainData(args.data, `${name}.updateMany`);
      const updatedAtField = UPDATED_AT[name];
      const rows = getRowsSync(name, name).filter((r) => matches(r, args.where));
      for (const row of rows) {
        Object.assign(row, args.data);
        if (updatedAtField) row[updatedAtField] = new Date();
      }
      return { count: rows.length };
    },
    async deleteMany(args?: { where?: Record<string, unknown> }): Promise<{ count: number }> {
      await ensure();
      const store = getRowsSync(name, name);
      const condemned = new Set(store.filter((r) => matches(r, args?.where)));
      if (condemned.size === 0) return { count: 0 };
      const remaining = store.filter((r) => !condemned.has(r));
      store.length = 0;
      store.push(...remaining);
      return { count: condemned.size };
    },
    async groupBy(args: { by: string[]; where?: Record<string, unknown>; _count?: boolean }): Promise<Array<Record<string, unknown>>> {
      await ensure();
      const rows = getRowsSync(name, name).filter((r) => matches(r, args.where));
      const groups = new Map<string, Record<string, unknown>>();
      for (const row of rows) {
        const key = args.by.map((field) => String(row[field] ?? "null")).join("\u0000");
        const group = groups.get(key) ?? Object.fromEntries(args.by.map((field) => [field, row[field]]));
        if (args._count) group._count = ((group._count as number) ?? 0) + 1;
        groups.set(key, group);
      }
      return [...groups.values()];
    },
  };
}

/** The in-browser Prisma-compatible client. Semantics follow the subset of
 *  Prisma actually used by the ported routes/engine (see handlers/engine). */
export const mdb = {
  agency: modelClient<import("./types").AgencyRow>("agency"),
  jurisdiction: modelClient<import("./types").JurisdictionRow>("jurisdiction"),
  infrastructureAsset: modelClient<import("./types").InfrastructureAssetRow>("infrastructureAsset"),
  weatherObservation: modelClient<import("./types").WeatherObservationRow>("weatherObservation"),
  historicalIncident: modelClient<import("./types").HistoricalIncidentRow>("historicalIncident"),
  maintenanceAction: modelClient<import("./types").MaintenanceActionRow>("maintenanceAction"),
  citizenReport: modelClient<import("./types").CitizenReportRow>("citizenReport"),
  urbanEvent: modelClient<import("./types").UrbanEventRow>("urbanEvent"),
  evidence: modelClient<import("./types").EvidenceRow>("evidence"),
  responsibilityLink: modelClient<import("./types").ResponsibilityLinkRow>("responsibilityLink"),
  actionItem: modelClient<import("./types").ActionItemRow>("actionItem"),
  verification: modelClient<import("./types").VerificationRow>("verification"),
  riskAssessment: modelClient<import("./types").RiskAssessmentRow>("riskAssessment"),
  modelRun: modelClient<import("./types").ModelRunRow>("modelRun"),
  auditLog: modelClient<import("./types").AuditLogRow>("auditLog"),
  hotspot: modelClient<import("./types").HotspotRow>("hotspot"),
  user: modelClient<import("./types").UserRow>("user"),
};

export type StaticDb = typeof mdb;

/** Reset to the pristine snapshot (used by tests / demo reset). */
export function resetStaticDb(): void {
  tables = null;
  loadPromise = null;
}

/** Dump the live in-memory tables (used by the offline seed script to persist
 *  a regenerated dataset back to src/data/snapshot.json). Serialize the result
 *  immediately - rows are live references. */
export async function dumpTables(): Promise<SnapshotTables> {
  await ensure();
  return tables as SnapshotTables;
}
