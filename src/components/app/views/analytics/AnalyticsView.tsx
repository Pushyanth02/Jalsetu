"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type HotspotResponse } from "@/lib/client/api";
import { distanceM } from "@/lib/geo";
import {
  LoadingRows, ErrorNote, Panel, EmptyState, TimeAgo, SourceBadge,
} from "@/components/app/shared/domain";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import {
  FlaskConical, GitMerge, Network, Clock, CheckCircle2, RotateCcw,
  BookOpen, MapPin, RefreshCw, ArrowRight, Scale, BarChart3,
} from "lucide-react";

// ANALYTICS - baseline vs proposed comparison on the seeded pilot.
// Research integrity: every number here is a synthetic demo evaluation
// against seeded ground truth, labelled as such at all times.

interface Metrics {
  precision: number;
  recall: number;
  f1: number;
  spatialHitRate: number;
  auc: number;
}

interface ByKRow {
  k: number;
  f1: number;
  spatialHitRate: number;
}

interface DatasetFacts {
  reports: number;
  events: number;
  groundTruthHotspots: number;
  candidateCells: number;
  positives: number;
}

interface AnalyticsData {
  approach: string;
  description: string;
  metrics: Metrics;
  byK: ByKRow[];
  assignmentDelay: number;
  duplicateClusteringAri: number;
  routingAccuracy: number | null;
  methodology: string;
  dataset: DatasetFacts;
}

interface ProposedData extends AnalyticsData {
  duplicateClustering: { ari: number; groupsTrue: number; groupsPredicted: number; note: string };
  responsibilityRouting: {
    accuracy: number;
    evaluated: number;
    mismatches: { eventCode: string; expected: string; assigned: string }[];
    note?: string;
  };
  verifiedResolution: { rate: number; closed: number; verifiedClosures: number };
  recurrenceAfterClosure: { rate: number; closedWithRecurrenceWatch: number; reopened: number; note: string };
  comparison: { baseline: Metrics; proposed: Metrics; note: string };
}

// chart + UI colour constants (locked palette, single teal accent)
const TEAL = "#45c4b0";
const SLATE = "#64748b";
const GRID_STROKE = "rgba(148,180,186,0.12)";
const TICK = { fill: "#5c7076", fontSize: 9, fontFamily: "var(--font-plex-mono)" };
const TOOLTIP_STYLE = {
  background: "#141b20",
  border: "1px solid rgba(148,180,186,0.18)",
  borderRadius: 4,
  fontSize: 11,
  fontFamily: "var(--font-plex-mono)",
};

const MATCH_RADIUS_M = 250;

// API strings may carry em/en dashes; the UI voice uses hyphens only.
const clean = (s: string) => s.replace(/-/g, "-").replace(/-/g, "-");

const FALLBACK_LABEL =
  "SYNTHETIC DEMO EVALUATION - computed on seeded pilot data with known ground truth. NOT measured real-world performance.";

const METRIC_ROWS: { key: keyof Metrics; label: string; hint: string }[] = [
  { key: "precision", label: "Precision", hint: "Share of predicted hotspots matched to ground truth within 250m" },
  { key: "recall", label: "Recall", hint: "Share of ground-truth hotspots matched by a prediction within 250m" },
  { key: "f1", label: "F1 score", hint: "Harmonic mean of precision and recall at the operating point" },
  { key: "auc", label: "AUC", hint: "Rank-based area under curve over all candidate cells" },
  { key: "spatialHitRate", label: "Spatial hit rate", hint: "Ground-truth hotspots with any prediction within 250m" },
];

export function AnalyticsView() {
  const baselineQ = useQuery({
    queryKey: ["analytics", "baseline"],
    queryFn: () => apiGet<AnalyticsData>("/api/analytics/baseline"),
    staleTime: 300_000,
  });
  const proposedQ = useQuery({
    queryKey: ["analytics", "proposed"],
    queryFn: () => apiGet<ProposedData>("/api/analytics/proposed"),
    staleTime: 300_000,
  });
  const hotspotsQ = useQuery({
    queryKey: ["hotspots"],
    queryFn: () => apiGet<HotspotResponse>("/api/hotspots").then((r) => r.data),
    staleTime: 120_000,
  });

  const baseline = baselineQ.data?.data;
  const proposed = proposedQ.data?.data;
  const evaluationLabel = clean(
    (proposedQ.data?.meta?.evaluationLabel as string | undefined) ?? FALLBACK_LABEL
  );
  const snapshotAt = (proposedQ.data?.meta?.generatedAt as string | undefined) ??
    (proposedQ.dataUpdatedAt ? new Date(proposedQ.dataUpdatedAt).toISOString() : undefined);

  const err = (baselineQ.error ?? proposedQ.error) as Error | null;
  const loading = baselineQ.isLoading || proposedQ.isLoading;

  const byKRows = useMemo(() => {
    if (!baseline || !proposed) return [];
    const propByK = new Map(proposed.byK.map((r) => [r.k, r]));
    return baseline.byK.map((b) => {
      const p = propByK.get(b.k);
      return {
        k: b.k,
        label: `k=${b.k}`,
        baselineF1: b.f1,
        proposedF1: p?.f1 ?? null,
        baselineHit: b.spatialHitRate,
        proposedHit: p?.spatialHitRate ?? null,
      };
    });
  }, [baseline, proposed]);

  const hotspotMatch = useMemo(() => matchHotspots(hotspotsQ.data), [hotspotsQ.data]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* persistent research-integrity banner */}
      <div className="px-4 sm:px-6 pt-3">
        <div
          role="note"
          className="rounded-md border border-sev-moderate/40 bg-sev-moderate/8 px-4 py-2.5 flex items-start gap-3"
        >
          <FlaskConical className="size-4 text-sev-moderate shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="micro-label !text-[0.62rem] !text-sev-moderate">research integrity notice</p>
            <p className="text-xs text-foreground/85 leading-relaxed mt-0.5">{evaluationLabel}</p>
          </div>
          {proposed && (
            <span className="ml-auto hidden sm:inline-flex shrink-0">
              <SourceBadge source="SYNTHETIC_DEMO" />
            </span>
          )}
        </div>
      </div>

      {/* header strip */}
      <div className="hairline-b bg-ink-900/30 px-4 sm:px-6 py-3 mt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Scale className="size-3.5 text-water" aria-hidden />
          <h1 className="font-display text-base font-bold tracking-tight">Baseline vs proposed</h1>
          <p className="text-xs text-muted-foreground">
            evidence-integrated ranking against complaint frequency alone
          </p>
          <button
            onClick={() => {
              baselineQ.refetch();
              proposedQ.refetch();
            }}
            className="ml-auto micro-label !text-[0.58rem] text-water hover:text-foreground transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className={cn("size-3", (baselineQ.isFetching || proposedQ.isFetching) && "animate-spin")} aria-hidden />
            refetch
          </button>
        </div>
        {proposed && (
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            {snapshotAt && (
              <span className="data-mono text-[0.65rem] text-muted-foreground">
                snapshot <TimeAgo iso={snapshotAt} />
              </span>
            )}
            <span className="data-mono text-[0.65rem] text-muted-foreground">
              {proposed.dataset.reports} reports · {proposed.dataset.events} events · {proposed.dataset.groundTruthHotspots} GT hotspots · {proposed.dataset.candidateCells.toLocaleString("en-IN")} cells
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-4 sm:px-6"><LoadingRows rows={8} /></div>
      ) : err ? (
        <div className="p-4 sm:px-6 max-w-lg">
          <ErrorNote message={err.message} onRetry={() => { baselineQ.refetch(); proposedQ.refetch(); }} />
        </div>
      ) : !baseline || !proposed ? (
        <div className="flex-1 grid place-items-center">
          <EmptyState title="Evaluation data unavailable" hint="Both analytics endpoints are required for this view." />
        </div>
      ) : (
        <Tabs defaultValue="comparison" className="flex-1 min-h-0 flex-col gap-0">
          <div className="px-4 sm:px-6 pt-3">
            <TabsList className="bg-ink-900/60 border border-border/60 w-full justify-start overflow-x-auto rounded-md h-9">
              <TabsTrigger value="comparison" className="text-xs data-[state=active]:bg-water/12 data-[state=active]:text-water">Comparison</TabsTrigger>
              <TabsTrigger value="byk" className="text-xs data-[state=active]:bg-water/12 data-[state=active]:text-water">Detection by K</TabsTrigger>
              <TabsTrigger value="operational" className="text-xs data-[state=active]:bg-water/12 data-[state=active]:text-water">Operational</TabsTrigger>
              <TabsTrigger value="methodology" className="text-xs data-[state=active]:bg-water/12 data-[state=active]:text-water">Methodology</TabsTrigger>
              <TabsTrigger value="truth" className="text-xs data-[state=active]:bg-water/12 data-[state=active]:text-water">Predictions vs truth</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 pb-8">
            {/* SECTION A - headline comparison */}
            <TabsContent value="comparison" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ApproachCard
                  tone="slate"
                  label="baseline"
                  name={clean(baseline.description.split(":")[0])}
                  body={clean(baseline.description.slice(baseline.description.indexOf(":") + 1).trim())}
                />
                <ApproachCard
                  tone="teal"
                  label="proposed"
                  name={clean(proposed.description.split(":")[0])}
                  body={clean(proposed.description.slice(proposed.description.indexOf(":") + 1).trim())}
                />
              </div>

              <Panel title="headline comparison · hotspot detection quality" dense>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="micro-label !text-[0.55rem] h-8">metric</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8 text-right">baseline</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8 text-right">proposed</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8 text-right">delta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {METRIC_ROWS.map((row) => {
                      const b = baseline.metrics[row.key];
                      const p = proposed.metrics[row.key];
                      const delta = p - b;
                      return (
                        <TableRow key={row.key} className="hover:bg-ink-850/40">
                          <TableCell className="py-2">
                            <span className="text-xs text-foreground/90" title={row.hint}>{row.label}</span>
                            <span className="block micro-label !text-[0.5rem] text-muted-foreground/60 !tracking-[0.08em] mt-0.5 normal-case">{row.hint}</span>
                          </TableCell>
                          <TableCell className="py-2 text-right data-mono text-[0.72rem] text-slate-300">{fmt(b)}</TableCell>
                          <TableCell className="py-2 text-right data-mono text-[0.72rem] text-water font-semibold">{fmt(p)}</TableCell>
                          <TableCell className={cn("py-2 text-right data-mono text-[0.72rem]", delta > 0.0005 ? "text-water" : delta < -0.0005 ? "text-sev-high" : "text-muted-foreground")}>
                            {delta > 0.0005 ? "+" : ""}{delta.toFixed(3)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Panel>

              <Panel title="what this means" bodyClassName="space-y-2">
                {whatThisMeans(baseline, proposed).map((para, i) => (
                  <p key={i} className="text-xs leading-relaxed text-foreground/85">{clean(para)}</p>
                ))}
                <p className="micro-label !text-[0.55rem] text-muted-foreground/60 !tracking-[0.08em] normal-case pt-1">
                  {clean(proposed.comparison.note)}
                </p>
              </Panel>
            </TabsContent>

            {/* SECTION B - detection quality by K */}
            <TabsContent value="byk" className="space-y-3">
              <Panel
                title={
                  <span className="flex items-center gap-2">
                    <BarChart3 className="size-3 text-water" aria-hidden />
                    detection quality by K
                  </span>
                }
                actions={<LegendSwatches />}
                bodyClassName="space-y-4 pt-4"
              >
                <div>
                  <p className="micro-label !text-[0.55rem] text-muted-foreground mb-2">hotspot-level F1 at top-k</p>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byKRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={3}>
                        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                        <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} width={28} tick={TICK} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelStyle={{ color: "#93a6ac" }}
                          cursor={{ fill: "rgba(148,180,186,0.06)" }}
                          formatter={(v: number) => v.toFixed(3)}
                        />
                        <Bar dataKey="baselineF1" name="baseline F1" fill={SLATE} radius={[1, 1, 0, 0]} barSize={14} />
                        <Bar dataKey="proposedF1" name="proposed F1" fill={TEAL} radius={[1, 1, 0, 0]} barSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="hairline-t pt-3">
                  <p className="micro-label !text-[0.55rem] text-muted-foreground mb-2">spatial hit rate at top-k</p>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byKRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={3}>
                        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                        <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} width={28} tick={TICK} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelStyle={{ color: "#93a6ac" }}
                          cursor={{ fill: "rgba(148,180,186,0.06)" }}
                          formatter={(v: number) => v.toFixed(3)}
                        />
                        <Bar dataKey="baselineHit" name="baseline hit rate" fill={SLATE} radius={[1, 1, 0, 0]} barSize={14} />
                        <Bar dataKey="proposedHit" name="proposed hit rate" fill={TEAL} radius={[1, 1, 0, 0]} barSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <p className="micro-label !text-[0.55rem] text-muted-foreground/70 !tracking-[0.08em] normal-case leading-relaxed">
                  Prediction lists are non-maximum-suppressed at 400m (one prediction per physical location, applied
                  equally to both approaches) and matched to ground truth symmetrically within 250m.
                </p>
              </Panel>
            </TabsContent>

            {/* SECTION C - operational metrics (proposed pipeline) */}
            <TabsContent value="operational" className="space-y-3">
              <div className="rounded-sm border border-border/60 bg-ink-900/40 px-3.5 py-2">
                <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
                  Operational metrics below are measured on the seeded pilot lifecycle of the proposed pipeline.
                  The complaint-frequency baseline has no routing or verification loop to evaluate
                  (its routing accuracy is null), so those panels show proposed-pipeline values only.
                </p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {/* duplicate clustering */}
                <Panel
                  title={
                    <span className="flex items-center gap-2">
                      <GitMerge className="size-3 text-water" aria-hidden />
                      duplicate clustering · ingestion
                    </span>
                  }
                  bodyClassName="space-y-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="data-mono text-2xl font-semibold text-foreground">{proposed.duplicateClustering.ari.toFixed(3)}</span>
                    <span className="micro-label !text-[0.55rem] text-muted-foreground">adjusted Rand index (ARI)</span>
                  </div>
                  <div
                    className="h-1.5 rounded-full bg-ink-800 overflow-hidden"
                    role="img"
                    aria-label={`ARI ${proposed.duplicateClustering.ari.toFixed(3)} of 1.0`}
                  >
                    <div className="h-full rounded-full bg-water" style={{ width: `${Math.min(100, proposed.duplicateClustering.ari * 100)}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <MiniStat label="true groups" value={proposed.duplicateClustering.groupsTrue} />
                    <MiniStat label="predicted groups" value={proposed.duplicateClustering.groupsPredicted} />
                    <MiniStat label="baseline ARI" value={baseline.duplicateClusteringAri.toFixed(3)} />
                  </div>
                  <p className="text-[0.7rem] leading-relaxed text-muted-foreground">{clean(proposed.duplicateClustering.note)}</p>
                </Panel>

                {/* responsibility routing */}
                <Panel
                  title={
                    <span className="flex items-center gap-2">
                      <Network className="size-3 text-water" aria-hidden />
                      responsibility routing · proposed
                    </span>
                  }
                  bodyClassName="space-y-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="data-mono text-2xl font-semibold text-foreground">
                      {(proposed.responsibilityRouting.accuracy * 100).toFixed(1)}%
                    </span>
                    <span className="micro-label !text-[0.55rem] text-muted-foreground">
                      routing accuracy · {proposed.responsibilityRouting.evaluated} events evaluated
                    </span>
                  </div>
                  {proposed.responsibilityRouting.mismatches.length > 0 ? (
                    <div className="rounded-sm border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="micro-label !text-[0.5rem] h-7">event</TableHead>
                            <TableHead className="micro-label !text-[0.5rem] h-7">expected</TableHead>
                            <TableHead className="micro-label !text-[0.5rem] h-7">assigned</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {proposed.responsibilityRouting.mismatches.map((m) => (
                            <TableRow key={m.eventCode} className="hover:bg-ink-850/40">
                              <TableCell className="py-1.5 data-mono text-[0.68rem] text-foreground/90">{m.eventCode}</TableCell>
                              <TableCell className="py-1.5 data-mono text-[0.68rem] text-verified">{m.expected}</TableCell>
                              <TableCell className="py-1.5 data-mono text-[0.68rem] text-sev-moderate">
                                {m.assigned} <span className="text-muted-foreground/70" aria-hidden>(mismatch)</span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No routing mismatches in the evaluated set.</p>
                  )}
                  <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
                    Expected agencies are synthetic ground-truth labels assigned by the seed dataset, not adjudicated
                    field decisions. Ambiguous multi-agency sites can legitimately disagree with a single-owner rule.
                  </p>
                </Panel>

                {/* assignment delay */}
                <Panel
                  title={
                    <span className="flex items-center gap-2">
                      <Clock className="size-3 text-water" aria-hidden />
                      assignment delay · counterfactual queue simulation
                    </span>
                  }
                  bodyClassName="space-y-3"
                >
                  <DelayRow label="baseline" value={baseline.assignmentDelay} max={Math.max(baseline.assignmentDelay, proposed.assignmentDelay)} barClass="bg-slate-400" />
                  <DelayRow label="proposed" value={proposed.assignmentDelay} max={Math.max(baseline.assignmentDelay, proposed.assignmentDelay)} barClass="bg-water" />
                  <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
                    Median hours from detection to assignment in a counterfactual queue simulation at 2 events/hour
                    dispatch capacity. Simulated values, not measured field latencies; the proposed pipeline trades
                    queue delay for richer evidence before routing.
                  </p>
                </Panel>

                {/* intervention verification */}
                <Panel
                  title={
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="size-3 text-water" aria-hidden />
                      intervention verification · proposed
                    </span>
                  }
                  bodyClassName="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="data-mono text-xl font-semibold text-verified">
                          {(proposed.verifiedResolution.rate * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="micro-label !text-[0.55rem] text-muted-foreground mt-0.5">verified-resolution rate</p>
                      <p className="data-mono text-[0.65rem] text-muted-foreground mt-1">
                        {proposed.verifiedResolution.verifiedClosures} verified of {proposed.verifiedResolution.closed} closed
                      </p>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="data-mono text-xl font-semibold text-sev-moderate">
                          {(proposed.recurrenceAfterClosure.rate * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="micro-label !text-[0.55rem] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <RotateCcw className="size-2.5" aria-hidden /> recurrence after closure
                      </p>
                      <p className="data-mono text-[0.65rem] text-muted-foreground mt-1">
                        {proposed.recurrenceAfterClosure.reopened} reopened of {proposed.recurrenceAfterClosure.closedWithRecurrenceWatch} watched
                      </p>
                    </div>
                  </div>
                  <div className="hairline-t pt-2.5">
                    <p className="text-[0.7rem] leading-relaxed text-muted-foreground">{clean(proposed.recurrenceAfterClosure.note)}</p>
                  </div>
                </Panel>
              </div>
            </TabsContent>

            {/* SECTION D - methodology */}
            <TabsContent value="methodology" className="space-y-3">
              <Panel
                title={
                  <span className="flex items-center gap-2">
                    <BookOpen className="size-3 text-water" aria-hidden />
                    methodology
                  </span>
                }
                bodyClassName="space-y-2.5"
              >
                {clean(baseline.methodology)
                  .split(/(?<=\.)\s+/)
                  .filter((p) => p.trim().length > 0)
                  .map((para, i) => (
                    <p key={i} className="text-xs leading-relaxed text-foreground/85">{para.trim()}</p>
                  ))}
              </Panel>

              <Panel title="evaluation dataset" dense>
                <div className="flex flex-wrap divide-x divide-border/60">
                  <DatasetStat label="citizen reports" value={baseline.dataset.reports.toLocaleString("en-IN")} />
                  <DatasetStat label="events" value={baseline.dataset.events.toLocaleString("en-IN")} />
                  <DatasetStat label="GT hotspots" value={baseline.dataset.groundTruthHotspots.toLocaleString("en-IN")} />
                  <DatasetStat label="candidate cells" value={baseline.dataset.candidateCells.toLocaleString("en-IN")} />
                  <DatasetStat label="positive cells" value={baseline.dataset.positives.toLocaleString("en-IN")} />
                </div>
              </Panel>

              <Panel title="research traceability" bodyClassName="space-y-3">
                <div>
                  <p className="micro-label !text-[0.55rem] text-water mb-1">research question</p>
                  <p className="text-sm leading-relaxed text-foreground/90 font-display">
                    Can heterogeneous spatial-temporal evidence produce better hotspot identification, responsibility
                    routing and intervention verification than complaint frequency alone?
                  </p>
                </div>
                <div className="space-y-1.5">
                  <TraceRow
                    label="hotspot identification"
                    value={`headline precision / recall / F1 / AUC / spatial hit rate plus the by-K curves (proposed F1 ${proposed.metrics.f1.toFixed(2)} vs baseline ${baseline.metrics.f1.toFixed(2)})`}
                  />
                  <TraceRow
                    label="responsibility routing"
                    value={`routing accuracy ${(proposed.responsibilityRouting.accuracy * 100).toFixed(0)}% over ${proposed.responsibilityRouting.evaluated} evaluated events with mismatch audit`}
                  />
                  <TraceRow
                    label="intervention verification"
                    value={`verified-resolution rate ${(proposed.verifiedResolution.rate * 100).toFixed(0)}% and recurrence-after-closure rate ${(proposed.recurrenceAfterClosure.rate * 100).toFixed(0)}%`}
                  />
                </div>
              </Panel>
            </TabsContent>

            {/* SECTION E - predictions vs ground truth */}
            <TabsContent value="truth" className="space-y-3">
              <Panel
                title={
                  <span className="flex items-center gap-2">
                    <MapPin className="size-3 text-water" aria-hidden />
                    computed hotspots vs ground truth
                  </span>
                }
                actions={
                  <span className="micro-label !text-[0.55rem] text-muted-foreground">
                    {hotspotMatch.covered}/{hotspotMatch.groundTruth.length} GT sites covered · match {MATCH_RADIUS_M}m
                  </span>
                }
                bodyClassName="space-y-3"
              >
                {hotspotsQ.isLoading ? (
                  <LoadingRows rows={5} />
                ) : hotspotsQ.isError ? (
                  <ErrorNote message={(hotspotsQ.error as Error).message} onRetry={() => hotspotsQ.refetch()} />
                ) : hotspotMatch.computed.length === 0 && hotspotMatch.groundTruth.length === 0 ? (
                  <EmptyState title="No hotspot data" hint="Computed hotspots and ground truth come from /api/hotspots." />
                ) : (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {/* computed */}
                      <div>
                        <p className="micro-label !text-[0.55rem] text-muted-foreground mb-2 flex items-center gap-2">
                          <span className="size-2 rounded-[1px] bg-water" aria-hidden /> computed · engine risk grid (NMS 400m)
                        </p>
                        <div className="rounded-sm border border-border/60 divide-y divide-border/60">
                          {hotspotMatch.computed.map((c) => (
                            <div key={c.code} className="px-3 py-2">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-xs text-foreground/90 truncate" title={c.name}>{c.name}</p>
                                <span className="data-mono text-[0.68rem] text-water shrink-0">{c.score}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-2.5">
                                <div className="h-1 w-20 rounded-full bg-ink-800 overflow-hidden shrink-0" role="img" aria-label={`score ${c.score} of 100`}>
                                  <div className="h-full rounded-full bg-water" style={{ width: `${Math.min(100, c.score)}%` }} />
                                </div>
                                <span className="data-mono text-[0.6rem] text-muted-foreground">{c.eventCount} events</span>
                                {c.nearestD != null ? (
                                  <span className={cn("micro-label !text-[0.5rem] !tracking-[0.08em]", c.nearestD <= MATCH_RADIUS_M ? "text-verified" : "text-muted-foreground/70")}>
                                    {c.nearestD <= MATCH_RADIUS_M ? `match ${c.nearest?.code} · ${Math.round(c.nearestD)}m` : `nearest GT ${Math.round(c.nearestD)}m`}
                                  </span>
                                ) : (
                                  <span className="micro-label !text-[0.5rem] text-muted-foreground/70">no GT</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ground truth */}
                      <div>
                        <p className="micro-label !text-[0.55rem] text-muted-foreground mb-2 flex items-center gap-2">
                          <span className="size-2 rounded-[1px] bg-sev-moderate" aria-hidden /> ground truth · seeded known sites
                        </p>
                        <div className="rounded-sm border border-border/60 divide-y divide-border/60">
                          {hotspotMatch.groundTruth.map((g) => (
                            <div key={g.code} className="px-3 py-2">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-xs text-foreground/90 truncate" title={g.name}>{g.name}</p>
                                <span className="data-mono text-[0.62rem] text-muted-foreground shrink-0">{g.code}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-2.5 flex-wrap">
                                <span className="data-mono text-[0.6rem] text-muted-foreground">radius {Math.round(g.radiusM)}m</span>
                                {g.nearestD != null ? (
                                  <span className={cn("micro-label !text-[0.5rem] !tracking-[0.08em]", g.nearestD <= MATCH_RADIUS_M ? "text-verified" : "text-sev-moderate")}>
                                    {g.nearestD <= MATCH_RADIUS_M
                                      ? `covered · nearest prediction ${Math.round(g.nearestD)}m`
                                      : `not covered · nearest ${Math.round(g.nearestD)}m`}
                                  </span>
                                ) : (
                                  <span className="micro-label !text-[0.5rem] text-sev-moderate">not covered · no predictions</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="micro-label !text-[0.55rem] text-muted-foreground/70 !tracking-[0.08em] normal-case leading-relaxed">
                      Distances computed client-side with the haversine helper; a computed hotspot counts as covering a
                      ground-truth site when within {MATCH_RADIUS_M}m. For the spatial map open Map Explorer and enable
                      the ground-truth layer. Computed source: {clean(hotspotMatch.computed[0]?.dataLabel ?? "MODEL_OUTPUT")}.
                    </p>
                  </>
                )}
              </Panel>
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}

// --- local primitives ---------------------------------------------------------

function fmt(v: number) {
  return v.toFixed(3);
}

function ApproachCard({ tone, label, name, body }: { tone: "slate" | "teal"; label: string; name: string; body: string }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3.5 py-3",
        tone === "teal" ? "border-water/30 bg-water/6" : "border-border/60 bg-ink-900/40"
      )}
    >
      <p className={cn("micro-label !text-[0.55rem]", tone === "teal" ? "text-water" : "text-muted-foreground")}>{label}</p>
      <p className="text-xs font-semibold text-foreground mt-1">{name}</p>
      <p className="text-[0.72rem] leading-relaxed text-muted-foreground mt-1">{body}</p>
    </div>
  );
}

function LegendSwatches() {
  return (
    <span className="flex items-center gap-4">
      <span className="flex items-center gap-1.5 micro-label !text-[0.52rem] text-muted-foreground">
        <span className="size-2 rounded-[1px]" style={{ background: SLATE }} aria-hidden /> baseline
      </span>
      <span className="flex items-center gap-1.5 micro-label !text-[0.52rem] text-muted-foreground">
        <span className="size-2 rounded-[1px]" style={{ background: TEAL }} aria-hidden /> proposed
      </span>
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-sm border border-border/60 bg-ink-900/40 px-2 py-1.5">
      <p className="micro-label !text-[0.5rem] text-muted-foreground !tracking-[0.08em]">{label}</p>
      <p className="data-mono text-[0.72rem] text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function DelayRow({ label, value, max, barClass }: { label: string; value: number; max: number; barClass: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="micro-label !text-[0.55rem] text-muted-foreground">{label}</span>
        <span className="data-mono text-[0.72rem] text-foreground">{value.toFixed(1)} h</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden" role="img" aria-label={`${label} median ${value} hours`}>
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TraceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-sm border border-border/60 bg-ink-900/40 px-3 py-2">
      <span className="micro-label !text-[0.52rem] text-water !tracking-[0.08em] w-40 shrink-0 pt-0.5">{label}</span>
      <ArrowRight className="size-3 text-muted-foreground/60 shrink-0 mt-0.5" aria-hidden />
      <span className="text-[0.72rem] leading-relaxed text-foreground/85">{value}</span>
    </div>
  );
}

function DatasetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-2.5 flex-1 min-w-fit">
      <p className="micro-label !text-[0.52rem] text-muted-foreground !tracking-[0.08em]">{label}</p>
      <p className="data-mono text-sm text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function whatThisMeans(b: AnalyticsData, p: ProposedData): string[] {
  const f1Delta = p.metrics.f1 - b.metrics.f1;
  const bestProposedK = p.byK.reduce((best, r) => (r.f1 > best.f1 ? r : best), p.byK[0]);
  const k12 = b.byK.find((r) => r.k === 12);
  const p12 = p.byK.find((r) => r.k === 12);
  const parts: string[] = [];

  parts.push(
    `On this seeded pilot (${p.dataset.reports} reports, ${p.dataset.events} events, ${p.dataset.groundTruthHotspots} known hotspots across ${p.dataset.candidateCells.toLocaleString("en-IN")} candidate cells), the evidence-integrated ranking reached F1 ${p.metrics.f1.toFixed(2)} versus ${b.metrics.f1.toFixed(2)} for complaint frequency alone, and matched ${Math.round(p.metrics.spatialHitRate * 100)}% of ground-truth sites within 250m versus ${Math.round(b.metrics.spatialHitRate * 100)}% for the baseline. Both approaches were scored on identical candidates and labels, so the gap is attributable to the scoring function, not the data.`
  );

  parts.push(
    `The AUC margin is small (${p.metrics.auc.toFixed(3)} vs ${b.metrics.auc.toFixed(3)}) because both rankers separate the ${p.dataset.positives} positive cells from the bulk; the improvement concentrates at the operating point. By K, the proposed ranking is strongest at k=${bestProposedK.k} (F1 ${bestProposedK.f1.toFixed(2)})${k12 && p12 ? `, and at k=12 both approaches return F1 ${k12.f1.toFixed(2)} as prediction lists thin out under 400m non-maximum suppression` : ""}.`
  );

  if (f1Delta >= 0.15) {
    parts.push(
      `These are synthetic results computed against seeded ground truth with known labels. They show that the evaluation harness can discriminate the two scoring functions on pilot data, not that the proposed approach would hold the same margins (${f1Delta.toFixed(2)} F1 here) on real city data.`
    );
  } else {
    parts.push(
      `These are synthetic results computed against seeded ground truth with known labels and should not be read as real-world effect sizes.`
    );
  }

  return parts;
}

interface ComputedWithMatch {
  code: string;
  name: string;
  lat: number;
  lng: number;
  score: number;
  method: string;
  eventCount: number;
  topEventCode?: string;
  dataLabel: string;
  nearestD: number | null;
  nearest?: { code: string; name: string };
}

interface GroundTruthWithMatch {
  code: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  dataLabel: string;
  nearestD: number | null;
}

function matchHotspots(data?: HotspotResponse): {
  computed: ComputedWithMatch[];
  groundTruth: GroundTruthWithMatch[];
  covered: number;
} {
  if (!data) return { computed: [], groundTruth: [], covered: 0 };
  const computed: ComputedWithMatch[] = data.computed.map((c) => {
    let nearestD: number | null = null;
    let nearest: { code: string; name: string } | undefined;
    for (const g of data.groundTruth) {
      const d = distanceM({ lat: c.lat, lng: c.lng }, { lat: g.lat, lng: g.lng });
      if (nearestD == null || d < nearestD) {
        nearestD = d;
        nearest = { code: g.code, name: g.name };
      }
    }
    return { ...c, nearestD, nearest };
  });
  const groundTruth: GroundTruthWithMatch[] = data.groundTruth.map((g) => {
    let nearestD: number | null = null;
    for (const c of data.computed) {
      const d = distanceM({ lat: c.lat, lng: c.lng }, { lat: g.lat, lng: g.lng });
      if (nearestD == null || d < nearestD) nearestD = d;
    }
    return { ...g, nearestD };
  });
  const covered = groundTruth.filter((g) => g.nearestD != null && g.nearestD <= MATCH_RADIUS_M).length;
  return { computed, groundTruth, covered };
}
