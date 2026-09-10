import { db } from "@/lib/db";
import { distanceM } from "@/lib/geo";

// Duplicate detection + spatial clustering (deterministic, explainable).
// No black-box: every decision carries thresholds and a reason.

export interface DuplicateCandidate {
  eventId: string;
  code: string;
  distanceM: number;
  hoursApart: number;
  sameCategory: boolean;
  reason: string;
}

export interface DuplicateMatch extends DuplicateCandidate {
  isRecurrence: boolean;
}

const DUP_RADIUS_M = 150;
const DUP_WINDOW_H = 48;
const REOPEN_RADIUS_M = 100;
const REOPEN_WINDOW_DAYS = 30;

export async function findDuplicateCandidates(
  p: { lat: number; lng: number; category: string; at: Date }
): Promise<DuplicateMatch[]> {
  const events = await db.urbanEvent.findMany({
    where: { status: { in: ["DETECTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "REOPENED", "CLOSED", "VERIFIED"] } },
    select: { id: true, code: true, lat: true, lng: true, category: true, status: true, lastActivityAt: true, closedAt: true },
  });
  const out: DuplicateMatch[] = [];
  for (const e of events) {
    const d = distanceM(p, { lat: e.lat, lng: e.lng });
    if (d > DUP_RADIUS_M) continue;
    const hours = Math.abs(p.at.getTime() - e.lastActivityAt.getTime()) / 3600_000;

    const closedRecently =
      e.status === "CLOSED" &&
      e.closedAt != null &&
      (Date.now() - e.closedAt.getTime()) / (24 * 3600_000) < REOPEN_WINDOW_DAYS;
    const withinReopenRadius = d <= REOPEN_RADIUS_M;

    if (e.status === "CLOSED" || e.status === "VERIFIED") {
      if (closedRecently && withinReopenRadius) {
        out.push({
          eventId: e.id,
          code: e.code,
          distanceM: Math.round(d),
          hoursApart: +hours.toFixed(1),
          sameCategory: e.category === p.category,
          reason: `Closed event re-reported within ${REOPEN_WINDOW_DAYS}d and ${REOPEN_RADIUS_M}m: recurrence signal`,
          isRecurrence: true,
        });
      }
      continue;
    }
    if (hours <= DUP_WINDOW_H) {
      out.push({
        eventId: e.id,
        code: e.code,
        distanceM: Math.round(d),
        hoursApart: +hours.toFixed(1),
        sameCategory: e.category === p.category,
        reason: `Open event within ${DUP_RADIUS_M}m and ${DUP_WINDOW_H}h${e.category === p.category ? ", same category" : ""}`,
        isRecurrence: false,
      });
    }
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

// --- clustering (union-find over proximity graph) ---------------------------

export interface ClusterMember {
  id: string;
  lat: number;
  lng: number;
}
export interface ClusterResult<T extends ClusterMember> {
  clusters: { centroid: { lat: number; lng: number }; members: T[] }[];
  singletons: T[];
}

export function clusterByProximity<T extends ClusterMember>(
  items: T[],
  radiusM: number
): ClusterResult<T> {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (distanceM(items[i], items[j]) <= radiusM) union(i, j);
    }
  }
  const groups = new Map<number, T[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(items[i]);
  }
  const clusters: ClusterResult<T>["clusters"] = [];
  const singletons: T[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) {
      singletons.push(members[0]);
      continue;
    }
    const centroid = {
      lat: members.reduce((s, m) => s + m.lat, 0) / members.length,
      lng: members.reduce((s, m) => s + m.lng, 0) / members.length,
    };
    clusters.push({ centroid, members });
  }
  return { clusters, singletons };
}

// --- evaluation metrics (honest, computed on synthetic labels) --------------

/** Adjusted Rand Index between two partitions (labels as group id arrays). */
export function adjustedRandIndex(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0) return 1;
  const count = (arr: number[]) => {
    const m = new Map<number, number>();
    for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  };
  const mapA = count(a);
  const mapB = count(b);
  const contingency = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${a[i]}|${b[i]}`;
    contingency.set(key, (contingency.get(key) ?? 0) + 1);
  }
  const comb2 = (x: number) => (x * (x - 1)) / 2;
  let sumPairs = 0;
  for (const c of contingency.values()) sumPairs += comb2(c);
  const sumA = [...mapA.values()].reduce((s, v) => s + comb2(v), 0);
  const sumB = [...mapB.values()].reduce((s, v) => s + comb2(v), 0);
  const total = comb2(n);
  const expected = (sumA * sumB) / (total || 1);
  const maxIndex = (sumA + sumB) / 2;
  if (maxIndex === expected) return 1;
  return (sumPairs - expected) / (maxIndex - expected);
}

/** Rank-based AUC (Mann-Whitney U / n_pos*n_neg). */
export function auc(scores: number[], labels: number[]): number {
  const pairs: { s: number; l: number }[] = scores.map((s, i) => ({ s, l: labels[i] }));
  const pos = pairs.filter((p) => p.l === 1);
  const neg = pairs.filter((p) => p.l === 0);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p.s > n.s) wins += 1;
      else if (p.s === n.s) wins += 0.5;
    }
  }
  return wins / (pos.length * neg.length);
}
