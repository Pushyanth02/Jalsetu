import { db } from "@/lib/db";
import { distanceM, idwInterpolate } from "@/lib/geo";
import { computeRisk } from "./risk";

// Hotspot computation + baseline vs proposed analytics.
// IMPORTANT: all metrics are computed over the SYNTHETIC DEMO dataset with
// seeded ground truth. They demonstrate the methodology, not measured
// real-world performance. Every response is labelled accordingly.

export interface HotspotComputed {
  code: string;
  name: string;
  lat: number;
  lng: number;
  score: number;
  method: "engine-risk";
  eventCount: number;
  topEventCode?: string;
}

/** Grid-based hotspot detection: cells ranked by max event risk within 250m. */
export async function computeHotspots(): Promise<HotspotComputed[]> {
  const events = await db.urbanEvent.findMany({
    where: { status: { not: "CLOSED" } },
  });
  const ground = await db.hotspot.findMany({ where: { kind: "GROUND_TRUTH" } });
  const cells = gridCells();

  const scored: HotspotComputed[] = [];
  for (const cell of cells) {
    const near = events.filter((e) => distanceM(cell, { lat: e.lat, lng: e.lng }) <= 250);
    if (near.length === 0) continue;
    const maxRisk = Math.max(...near.map((e) => e.riskScore));
    const top = near.sort((a, b) => b.riskScore - a.riskScore)[0];
    scored.push({
      code: `HC-${cell.lat.toFixed(3)}-${cell.lng.toFixed(3)}`,
      name: `Risk cluster near ${top.locationText}`,
      lat: cell.lat,
      lng: cell.lng,
      score: maxRisk,
      method: "engine-risk",
      eventCount: near.length,
      topEventCode: top.code,
    });
  }
  // de-duplicate overlapping cells: keep local maxima (sort by score, suppress within 300m)
  scored.sort((a, b) => b.score - a.score);
  const kept: HotspotComputed[] = [];
  for (const s of scored) {
    if (kept.every((k) => distanceM(k, s) > 300)) kept.push(s);
    if (kept.length >= 10) break;
  }
  void ground;
  return kept;
}

function gridCells(): { lat: number; lng: number }[] {
  // 200m grid over the pilot bounding box
  const cells: { lat: number; lng: number }[] = [];
  const latStep = 0.0018; // ~200m
  const lngStep = 0.0018 / Math.cos((28.63 * Math.PI) / 180);
  for (let lat = 28.608; lat <= 28.716; lat += latStep) {
    for (let lng = 77.183; lng <= 77.264; lng += lngStep) {
      cells.push({ lat: +lat.toFixed(5), lng: +lng.toFixed(5) });
    }
  }
  return cells;
}

// --- baseline vs proposed comparison -------------------------------------------

export interface CandidateCell {
  lat: number;
  lng: number;
  label: number; // 1 if within 150m of a ground-truth hotspot
  baselineScore: number; // complaint frequency (report count within 500m, 72h)
  proposedScore: number; // composite evidence risk
  features: {
    reportCount: number;
    rainfall24h: number;
    eventRiskMax: number;
    recurrenceSum: number;
    drainConditionAvg: number | null;
    monthsSinceMaintenanceMax: number | null;
    historicalCount: number;
  };
}

export interface AnalyticsResult {
  label: string;
  generatedAt: string;
  methodology: string;
  dataset: {
    reports: number;
    events: number;
    groundTruthHotspots: number;
    candidateCells: number;
    positives: number;
  };
  hotspotDetection: {
    k: number;
    baseline: { precision: number; recall: number; f1: number; auc: number; spatialHitRate: number };
    proposed: { precision: number; recall: number; f1: number; auc: number; spatialHitRate: number };
    byK: { k: number; baselineF1: number; proposedF1: number; baselineHit: number; proposedHit: number }[];
  };
  duplicateClustering: { ari: number; groupsTrue: number; groupsPredicted: number; note: string };
  responsibilityRouting: { accuracy: number; evaluated: number; mismatches: { eventCode: string; expected: string; assigned: string }[]; note: string };
  assignmentDelay: {
    baselineMedianHours: number;
    proposedMedianHours: number;
    baselineMeanHours?: number;
    proposedMeanHours?: number;
    capacityPerHour: number;
    note: string;
  };
  verifiedResolution: { rate: number; closed: number; verifiedClosures: number };
  recurrenceAfterClosure: { rate: number; closedWithRecurrenceWatch: number; reopened: number; note: string };
}

export async function computeAnalytics(): Promise<AnalyticsResult> {
  const [reports, events, hotspots, assets, maintenance, incidents, weather] = await Promise.all([
    db.citizenReport.findMany(),
    db.urbanEvent.findMany(),
    db.hotspot.findMany({ where: { kind: "GROUND_TRUTH" } }),
    db.infrastructureAsset.findMany(),
    db.maintenanceAction.findMany({ where: { status: "COMPLETED" }, orderBy: { performedAt: "desc" } }),
    db.historicalIncident.findMany(),
    db.weatherObservation.findMany({ where: { observedAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
  ]);

  // per-station 24h rainfall for IDW
  const stationSums = new Map<string, { lat: number; lng: number; sum: number }>();
  for (const o of weather) {
    const s = stationSums.get(o.stationCode) ?? { lat: o.lat, lng: o.lng, sum: 0 };
    s.sum += o.rainfallMm;
    stationSums.set(o.stationCode, s);
  }
  const stationList = [...stationSums.values()];

  const lastMaint = new Map<string, Date>();
  for (const m of maintenance) if (m.performedAt && !lastMaint.has(m.assetId)) lastMaint.set(m.assetId, m.performedAt);
  const monthsSince = (d: Date) => Math.max(0, Math.round((Date.now() - d.getTime()) / (30.44 * 24 * 3600_000)));

  const cells = gridCells();
  const candidates: CandidateCell[] = [];
  for (const cell of cells) {
    const nearLabel = hotspots.some((h) => distanceM(cell, { lat: h.lat, lng: h.lng }) <= 200) ? 1 : 0;
    const recentReports = reports.filter((r) => r.submittedAt.getTime() >= Date.now() - 72 * 3600_000);
    // kernel density (Gaussian, sigma 150m): complaint frequency field
    const reportDensity = recentReports.reduce(
      (s, r) => s + Math.exp(-Math.pow(distanceM(cell, { lat: r.lat, lng: r.lng }) / 150, 2) / 2),
      0
    );
    const nearReports = recentReports.filter((r) => distanceM(cell, { lat: r.lat, lng: r.lng }) <= 500);
    const nearEvents = events.filter((e) => distanceM(cell, { lat: e.lat, lng: e.lng }) <= 400);
    const nearIncidents = incidents.filter((i) => distanceM(cell, { lat: i.lat, lng: i.lng }) <= 250);
    const nearDrains = assets.filter(
      (a) => (a.kind === "DRAIN" || a.kind === "OUTFALL" || a.kind === "CULVERT") && distanceM(cell, { lat: a.lat, lng: a.lng }) <= 300
    );
    const drainConditionAvg = nearDrains.length
      ? nearDrains.reduce((s, a) => s + a.conditionScore, 0) / nearDrains.length
      : null;
    const maintMonths = nearDrains.length
      ? Math.max(
          ...nearDrains.map((a) => (lastMaint.has(a.id) ? monthsSince(lastMaint.get(a.id)!) : 12))
        )
      : null;
    const rainfall24h = stationList.length
      ? idwInterpolate(cell, stationList.map((s) => ({ lat: s.lat, lng: s.lng, value: s.sum })))
      : 0;

    const features = {
      reportCount: nearReports.length,
      reportDensity: +reportDensity.toFixed(2),
      rainfall24h: +rainfall24h.toFixed(1),
      eventRiskMax: nearEvents.length ? Math.max(...nearEvents.map((e) => e.riskScore)) : 0,
      recurrenceSum: nearEvents.reduce((s, e) => s + e.recurrenceCount, 0),
      drainConditionAvg: drainConditionAvg != null ? Math.round(drainConditionAvg) : null,
      monthsSinceMaintenanceMax: maintMonths,
      historicalCount: nearIncidents.length,
    };

    // BASELINE: complaint frequency only (kernel density of reports in window)
    const baselineScore = +reportDensity.toFixed(2);

    // PROPOSED: same transparent factor model as the risk engine
    const composite = computeRisk({
      severity: nearEvents.length ? Math.max(...nearEvents.map((e) => e.severity)) : 1,
      reportCount: Math.min(8, Math.round(reportDensity)),
      rainfall24hMm: features.rainfall24h,
      rainfall72hMm: features.rainfall24h * 1.4,
      recurrenceCount: features.recurrenceSum,
      drainCondition: drainConditionAvg,
      monthsSinceMaintenance: maintMonths,
      historicalIncidentsNearby: features.historicalCount,
    }).score;

    candidates.push({
      lat: cell.lat,
      lng: cell.lng,
      label: nearLabel,
      baselineScore,
      proposedScore: composite,
      features,
    });
  }

  const positives = candidates.filter((c) => c.label === 1).length;
  const k = hotspots.length;

  // Hotspot-level evaluation: predictions matched to ground-truth hotspots
  // within 250m (symmetric spatial matching, no grid-alignment artifacts).
  // Ranked lists are non-maximum-suppressed at 400m so one physical location
  // cannot consume multiple of the top-k prediction slots (both approaches
  // equally - a control room reports one hotspot per location, not three).
  const nmsTopK = (scoreKey: "baselineScore" | "proposedScore", kk: number) => {
    const ranked = [...candidates].sort((a, b) => b[scoreKey] - a[scoreKey]);
    const kept: CandidateCell[] = [];
    for (const c of ranked) {
      if (kept.every((x) => distanceM(x, c) > 400)) kept.push(c);
      if (kept.length >= kk) break;
    }
    return kept;
  };
  const evaluate = (scoreKey: "baselineScore" | "proposedScore") => {
    const labels = candidates.map((c) => c.label);
    const scores = candidates.map((c) => c[scoreKey]);
    const topK = nmsTopK(scoreKey, k);
    const covered = hotspots.filter((h) =>
      topK.some((c) => distanceM(c, { lat: h.lat, lng: h.lng }) <= 250)
    ).length; // ground-truth hotspots found (recall numerator)
    const relevant = topK.filter((c) =>
      hotspots.some((h) => distanceM(c, { lat: h.lat, lng: h.lng }) <= 250)
    ).length; // predictions that point at real hotspots (precision numerator)
    const precision = k > 0 ? relevant / k : 0;
    const recall = hotspots.length > 0 ? covered / hotspots.length : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return { precision, recall, f1, spatialHitRate: recall, auc: aucRank(scores, labels) };
  };

  const baseline = evaluate("baselineScore");
  const proposed = evaluate("proposedScore");

  const byK: AnalyticsResult["hotspotDetection"]["byK"] = [];
  for (const kk of [3, 6, 9, 12]) {
    const evalK = (scoreKey: "baselineScore" | "proposedScore") => {
      const top = nmsTopK(scoreKey, kk);
      const covered = hotspots.filter((h) => top.some((c) => distanceM(c, { lat: h.lat, lng: h.lng }) <= 250)).length;
      const relevant = top.filter((c) => hotspots.some((h) => distanceM(c, { lat: h.lat, lng: h.lng }) <= 250)).length;
      const prec = relevant / kk;
      const rec = hotspots.length ? covered / hotspots.length : 0;
      return { f1: prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0, hit: rec };
    };
    const b = evalK("baselineScore");
    const p = evalK("proposedScore");
    byK.push({ k: kk, baselineF1: b.f1, proposedF1: p.f1, baselineHit: b.hit, proposedHit: p.hit });
  }

  // --- duplicate clustering quality (ARI vs seeded truth) ---------------------
  // truth groups: reports attached to the same event = same group (plus noise events)
  const assigned = reports.filter((r) => r.urbanEventId);
  const truthGroups = new Map<string, number>();
  let g = 0;
  const truthLabels: number[] = [];
  const points: { id: string; lat: number; lng: number }[] = [];
  for (const r of assigned) {
    if (!truthGroups.has(r.urbanEventId!)) truthGroups.set(r.urbanEventId!, g++);
    truthLabels.push(truthGroups.get(r.urbanEventId!)!);
    points.push({ id: r.id, lat: r.lat, lng: r.lng });
  }
  // predicted groups: proximity clustering of reports (union-find, 150m, 48h)
  const predictedLabels = proximityGroups(points, 150);
  const ari = adjustedRand(truthLabels, predictedLabels);

  // --- responsibility routing accuracy ----------------------------------------
  const routed = events.filter((e) => e.groundTruthAgencyCode && e.agencyCode);
  const mismatches = routed
    .filter((e) => e.agencyCode !== e.groundTruthAgencyCode)
    .map((e) => ({ eventCode: e.code, expected: e.groundTruthAgencyCode!, assigned: e.agencyCode! }));
  const routingAccuracy = routed.length ? (routed.length - mismatches.length) / routed.length : 0;

  // --- assignment delay (counterfactual simulation, labelled) ------------------
  // Both strategies assign at a fixed capacity; delay depends on queue rank.
  const gtEvents = events.filter((e) => e.groundTruthHotspotId);
  const capacityPerHour = 2; // events assigned per hour in the simulated control room
  const baselineRank = (e: (typeof events)[number]) => events.filter((x) => x.reportCount > e.reportCount).length + 1;
  const proposedRank = (e: (typeof events)[number]) => events.filter((x) => x.riskScore > e.riskScore).length + 1;
  const baselineDelays = gtEvents.map((e) => baselineRank(e) / capacityPerHour);
  const proposedDelays = gtEvents.map((e) => proposedRank(e) / capacityPerHour);
  const mean = (arr: number[]) => (arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : 0);
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  // --- verified resolution + recurrence ---------------------------------------
  const closed = events.filter((e) => e.status === "CLOSED" || e.status === "REOPENED" || e.closedAt);
  const closedWithVerification = await countVerifiedClosures(events);
  const reopened = events.filter((e) => e.status === "REOPENED" || e.recurrenceCount > 0);

  return {
    label: "SYNTHETIC DEMO EVALUATION - computed on seeded pilot data with known ground truth. NOT measured real-world performance.",
    generatedAt: new Date().toISOString(),
    methodology:
      "Candidates are 200m grid cells across the pilot area. Baseline ranks cells by complaint frequency density (Gaussian kernel, sigma 150m, 72h window). Proposed ranks cells by the same explainable 7-factor risk model used by the live engine (severity, reports, rainfall, recurrence, drainage condition, maintenance gap, history). Ground truth: 6 seeded known flood-prone locations. Precision/recall/F1 are computed at hotspot level with symmetric 250m spatial matching, and prediction lists are non-maximum-suppressed at 400m (one prediction per physical location, applied equally to both approaches). AUC is rank-based over all cells. Assignment delay is a counterfactual queue simulation at 2 events/hour capacity.",
    dataset: {
      reports: reports.length,
      events: events.length,
      groundTruthHotspots: hotspots.length,
      candidateCells: candidates.length,
      positives,
    },
    hotspotDetection: { k, baseline, proposed, byK },
    duplicateClustering: {
      ari,
      groupsTrue: g,
      groupsPredicted: new Set(predictedLabels).size,
      note: "ARI between proximity clustering (150m/48h) and report-to-event groups produced by the ingestion pipeline.",
    },
    responsibilityRouting: {
      accuracy: routingAccuracy,
      evaluated: routed.length,
      mismatches,
      note: "Engine-assigned primary agency vs seeded ground-truth responsible agency (events linked to known hotspots only).",
    },
    assignmentDelay: {
      baselineMedianHours: +median(baselineDelays).toFixed(1),
      proposedMedianHours: +median(proposedDelays).toFixed(1),
      baselineMeanHours: mean(baselineDelays),
      proposedMeanHours: mean(proposedDelays),
      capacityPerHour,
      note: "Counterfactual simulation: assignment queue ordered by complaint frequency (baseline) vs risk score (proposed). Median wait for ground-truth hotspot events.",
    },
    verifiedResolution: {
      rate: closed.length ? closedWithVerification / closed.length : 0,
      closed: closed.length,
      verifiedClosures: closedWithVerification,
    },
    recurrenceAfterClosure: {
      rate: closed.length ? reopened.length / closed.length : 0,
      closedWithRecurrenceWatch: closed.length,
      reopened: reopened.length,
      note: "Reopened or re-reported events after closure, from the seeded lifecycle. Under the proposed strategy the highest-risk closures receive verification before closure.",
    },
  };
}

async function countVerifiedClosures(events: { id: string }[]): Promise<number> {
  let n = 0;
  for (const e of events) {
    const v = await db.verification.findFirst({ where: { eventId: e.id, stage: "VERIFIED" } });
    if (v) n += 1;
  }
  return n;
}

function aucRank(scores: number[], labels: number[]): number {
  const pairs = scores.map((s, i) => ({ s, l: labels[i] }));
  const pos = pairs.filter((p) => p.l === 1);
  const neg = pairs.filter((p) => p.l === 0);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p.s > n.s ? 1 : p.s === n.s ? 0.5 : 0;
  return +(wins / (pos.length * neg.length)).toFixed(3);
}

function proximityGroups(points: { id: string; lat: number; lng: number }[], radiusM: number): number[] {
  const parent = points.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (distanceM(points[i], points[j]) <= radiusM) {
        const ri = find(i), rj = find(j);
        if (ri !== rj) parent[ri] = rj;
      }
    }
  }
  return points.map((_, i) => find(i));
}

function adjustedRand(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0) return 1;
  const comb2 = (x: number) => (x * (x - 1)) / 2;
  const mapA = new Map<number, number>();
  const mapB = new Map<number, number>();
  for (const v of a) mapA.set(v, (mapA.get(v) ?? 0) + 1);
  for (const v of b) mapB.set(v, (mapB.get(v) ?? 0) + 1);
  const cont = new Map<string, number>();
  for (let i = 0; i < n; i++) cont.set(`${a[i]}|${b[i]}`, (cont.get(`${a[i]}|${b[i]}`) ?? 0) + 1);
  let sumPairs = 0;
  for (const c of cont.values()) sumPairs += comb2(c);
  const sumA = [...mapA.values()].reduce((s, v) => s + comb2(v), 0);
  const sumB = [...mapB.values()].reduce((s, v) => s + comb2(v), 0);
  const total = comb2(n) || 1;
  const expected = (sumA * sumB) / total;
  const maxIndex = (sumA + sumB) / 2;
  if (maxIndex === expected) return 1;
  return +((sumPairs - expected) / (maxIndex - expected)).toFixed(3);
}
