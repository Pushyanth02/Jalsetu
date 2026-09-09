import { db } from "@/lib/db";

// JSON helpers for SQLite string-typed columns. Never throw on read.

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

export function fromJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// --- audit + model-run instrumentation -------------------------------------

export async function audit(entry: {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  note?: string;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeJson: entry.before === undefined ? undefined : JSON.stringify(entry.before),
      afterJson: entry.after === undefined ? undefined : JSON.stringify(entry.after),
      note: entry.note,
    },
  });
}

export async function startModelRun(input: {
  modelId: string;
  version: string;
  provider: string;
  inputCount?: number;
  notes?: string;
}): Promise<string> {
  const run = await db.modelRun.create({
    data: {
      modelId: input.modelId,
      version: input.version,
      provider: input.provider,
      inputCount: input.inputCount ?? 0,
      status: "RUNNING",
      notes: input.notes,
    },
  });
  return run.id;
}

export async function finishModelRun(
  id: string,
  outcome: { status: "SUCCEEDED" | "FAILED"; outputCount?: number; inputCount?: number; latencyMs?: number; error?: string; notes?: string }
): Promise<void> {
  await db.modelRun.update({
    where: { id },
    data: {
      status: outcome.status,
      outputCount: outcome.outputCount ?? 0,
      ...(outcome.inputCount !== undefined ? { inputCount: outcome.inputCount } : {}),
      latencyMs: outcome.latencyMs,
      error: outcome.error,
      notes: outcome.notes,
      finishedAt: new Date(),
    },
  });
}
