"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type HotspotResponse } from "@/lib/client/api";
import { distanceM } from "@/lib/geo";
import {
  LoadingRows, ErrorNote, Panel, EmptyState, TimeAgo, SourceBadge,
} from "@/components/app/shared/domain";
import { Reveal, Stagger, StaggerItem, CountUp, HoverLift, SpotlightCard, AnimatedProgress } from "@/components/motion/kit";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import {
  FlaskConical, GitMerge, Network, Clock, CheckCircle2, RotateCcw,
  BookOpen, MapPin, RefreshCw, ArrowRight, Scale, BarChart3, Database,
  AlertTriangle, TrendingUp, TrendingDown, Minus, Layers,
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

// chart + UI colour constants (locked Monsoon ink palette: aqua signal on indigo)
const BLUE = "#2dd4bf";      // proposed / primary series (aqua)
const SLATE_BAR = "#46568a"; // baseline series (muted indigo)
const GRID_STROKE = "#1a2440";
const TICK = { fill: "#7a88b8", fontSize: 9, fontFamily: "var(--font-plex-mono)" };
const TOOLTIP_STYLE = {
  background: "#0c142b",
  border: "1px solid #24406b",
  borderRadius: 8,
  fontSize: 11,
  fontFamily: "var(--font-plex-mono)",
  color: "#e9eeff",
  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.9)",
};
const LABEL_STYLE = { color: "#8794c2" };
const CURSOR_FILL = { fill: "rgba(45, 212, 191, 0.06)" };

const MATCH_RADIUS_M = 250;

// API strings may carry em/en dashes; the UI voice uses hyphens only.
const clean = (s: string) => s.replace(/-/g, "-").replace(/-/g, "-");

const FALLBACK_LABEL =
  "SYNTHETIC DEMO EVALUATION - computed on seeded pilot data with known ground truth. NOT measured real-world performance.";

const METRIC_ROWS: { key: keyof Metrics; label: string; hint: string }[] = [
  { key: "precision", label: "Precision", hint: "Share of predicted hotspots matched to ground truth within 250m" },
  { key: "recall", label: "Recall", hint: "Share of ground-truth hotspots matched by a prediction within 250m" },
  { key: "f1", label: "F1 Score", hint: "Harmonic mean of precision and recall at the operating point" },
  { key: "auc", label: "AUC", hint: "Rank-based area under curve over all candidate cells" },
  { key: "spatialHitRate", label: "Spatial Hit Rate", hint: "Ground-truth hotspots with any prediction within 250m" },
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
      <div className="px-4 sm:px-6 pt-3.5">
        <Reveal y={8} duration={0.4}>
          <div
            role="note"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-start gap-3"
          >
            <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="micro-label !text-[0.62rem] !text-amber-700">Research Integrity Notice</p>
              <p className="text-xs text-amber-800 leading-relaxed mt-0.5">{evaluationLabel}</p>
            </div>
            {proposed && (
              <span className="ml-auto hidden sm:inline-flex shrink-0">
                <SourceBadge source="SYNTHETIC_DEMO" />
              </span>
            )}
          </div>
        </Reveal>
      </div>

      {/* header strip */}
      <div className="hairline-b bg-ink-900 px-4 sm:px-6 py-3.5 mt-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 leading-tight">Baseline vs Proposed</h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 micro-label !text-[0.58rem] text-water">
                <Scale className="size-3" aria-hidden /> Research Evaluation
              </span>
            </div>
            <p className="text-[0.7rem] text-muted-foreground mt-0.5">
              Does combining many kinds of evidence find flooding hotspots better than counting complaints alone?
              {snapshotAt && (
                <span className="data-mono ml-1.5 text-slate-400">
                  snapshot <TimeAgo iso={snapshotAt} />
                </span>
              )}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {proposed && (
              <span className="hidden lg:inline data-mono text-[0.62rem] text-slate-500">
                {proposed.dataset.reports} reports · {proposed.dataset.events} events · {proposed.dataset.groundTruthHotspots} GT hotspots · {proposed.dataset.candidateCells.toLocaleString("en-IN")} cells
              </span>
            )}
            <button
              onClick={() => {
                baselineQ.refetch();
                proposedQ.refetch();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 micro-label !text-[0.58rem] text-water hover:bg-blue-100 hover:border-blue-300 transition-colors"
            >
              <RefreshCw className={cn("size-3", (baselineQ.isFetching || proposedQ.isFetching) && "animate-spin")} aria-hidden />
              refetch
            </button>
          </div>
        </div>
        {proposed && (
          <div className="mt-1.5 flex items-center gap-3 flex-wrap lg:hidden">
            <span className="data-mono text-[0.65rem] text-slate-500">
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
          <EmptyState title="Evaluation Data Unavailable" hint="This view needs both analytics data sources to load." />
        </div>
      ) : (
        <Tabs defaultValue="comparison" className="flex-1 min-h-0 flex-col gap-0">
          <div className="px-4 sm:px-6 pt-3">
            <TabsList className="bg-ink-850/70 w-full justify-start overflow-x-auto rounded-lg h-9 no-scrollbar">
              <TabsTrigger value="comparison" className="text-xs data-[state=active]:text-water">Comparison</TabsTrigger>
              <TabsTrigger value="byk" className="text-xs data-[state=active]:text-water">Detection by K</TabsTrigger>
              <TabsTrigger value="operational" className="text-xs data-[state=active]:text-water">Operational</TabsTrigger>
              <TabsTrigger value="methodology" className="text-xs data-[state=active]:text-water">Methodology</TabsTrigger>
              <TabsTrigger value="truth" className="text-xs data-[state=active]:text-water">Predictions vs Truth</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 pb-8">
            {/* SECTION A - headline comparison */}
            <TabsContent value="comparison" className="space-y-4">
              <Reveal>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ApproachCard
                    tone="baseline"
                    label="Baseline"
                    name={clean(baseline.description.split(":")[0])}
                    body={clean(baseline.description.slice(baseline.description.indexOf(":") + 1).trim())}
                    metrics={baseline.metrics}
                  />
                  <ApproachCard
                    tone="proposed"
                    label="Proposed"
                    name={clean(proposed.description.split(":")[0])}
                    body={clean(proposed.description.slice(proposed.description.indexOf(":") + 1).trim())}
                    metrics={proposed.metrics}
                  />
                </div>
              </Reveal>

              <Reveal delay={0.05}>
                <Panel title="Headline Comparison · Hotspot Detection Quality" icon={<BarChart3 />} dense>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-ink-850/60 hover:bg-ink-850/60">
                        <TableHead className="micro-label !text-[0.55rem] h-8">Metric</TableHead>
                        <TableHead className="micro-label !text-[0.55rem] h-8 text-right">Baseline</TableHead>
                        <TableHead className="micro-label !text-[0.55rem] h-8 text-right">Proposed</TableHead>
                        <TableHead className="micro-label !text-[0.55rem] h-8 text-right">Delta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {METRIC_ROWS.map((row) => {
                        const b = baseline.metrics[row.key];
                        const p = proposed.metrics[row.key];
                        const delta = p - b;
                        return (
                          <TableRow key={row.key} className="hover:bg-ink-850/50">
                            <TableCell className="py-2.5">
                              <span className="text-xs font-medium text-slate-700" title={row.hint}>{row.label}</span>
                              <span className="block micro-label !text-[0.5rem] text-slate-400 !tracking-[0.08em] mt-0.5 normal-case">{row.hint}</span>
                            </TableCell>
                            <TableCell className="py-2.5 text-right data-mono text-[0.72rem] text-slate-600">
                              <CountUp value={b} decimals={3} />
                            </TableCell>
                            <TableCell className="py-2.5 text-right data-mono text-[0.72rem] text-water font-semibold">
                              <CountUp value={p} decimals={3} />
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 data-mono text-[0.72rem] font-medium",
                                  delta > 0.0005 ? "text-verified" : delta < -0.0005 ? "text-sev-high" : "text-slate-400"
                                )}
                              >
                                {delta > 0.0005 ? (
                                  <TrendingUp className="size-3" aria-hidden />
                                ) : delta < -0.0005 ? (
                                  <TrendingDown className="size-3" aria-hidden />
                                ) : (
                                  <Minus className="size-3" aria-hidden />
                                )}
                                {delta > 0.0005 ? "+" : ""}{delta.toFixed(3)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Panel>
              </Reveal>

              <Reveal delay={0.1}>
                <Panel title="What This Means" icon={<FlaskConical />} bodyClassName="space-y-2">
                  {whatThisMeans(baseline, proposed).map((para, i) => (
                    <p key={i} className="text-xs leading-relaxed text-slate-600">{clean(para)}</p>
                  ))}
                  <p className="micro-label !text-[0.55rem] text-slate-400 !tracking-[0.08em] normal-case pt-1">
                    {clean(proposed.comparison.note)}
                  </p>
                </Panel>
              </Reveal>
            </TabsContent>

            {/* SECTION B - detection quality by K */}
            <TabsContent value="byk" className="space-y-4">
              <Reveal>
                <Panel
                  title="Detection Quality by K"
                  icon={<BarChart3 />}
                  actions={<LegendSwatches />}
                  bodyClassName="space-y-4 pt-4"
                >
                  <div>
                    <p className="micro-label !text-[0.55rem] text-slate-500 mb-2">Hotspot-Level F1 at Top-K</p>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={byKRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={3}>
                          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tick={TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                          <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} width={28} tick={TICK} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            labelStyle={LABEL_STYLE}
                            cursor={CURSOR_FILL}
                            formatter={(v: number) => v.toFixed(3)}
                          />
                          <Bar dataKey="baselineF1" name="baseline F1" fill={SLATE_BAR} radius={[4, 4, 0, 0]} barSize={16} animationDuration={700} />
                          <Bar dataKey="proposedF1" name="proposed F1" fill={BLUE} radius={[4, 4, 0, 0]} barSize={16} animationDuration={700} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="hairline-t pt-3">
                    <p className="micro-label !text-[0.55rem] text-slate-500 mb-2">Spatial Hit Rate at Top-K</p>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={byKRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={3}>
                          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tick={TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                          <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} width={28} tick={TICK} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            labelStyle={LABEL_STYLE}
                            cursor={CURSOR_FILL}
                            formatter={(v: number) => v.toFixed(3)}
                          />
                          <Bar dataKey="baselineHit" name="baseline hit rate" fill={SLATE_BAR} radius={[4, 4, 0, 0]} barSize={16} animationDuration={700} />
                          <Bar dataKey="proposedHit" name="proposed hit rate" fill={BLUE} radius={[4, 4, 0, 0]} barSize={16} animationDuration={700} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <p className="micro-label !text-[0.55rem] text-slate-400 !tracking-[0.08em] normal-case leading-relaxed">
                    Prediction lists are non-maximum-suppressed at 400m (one prediction per physical location, applied
                    equally to both approaches) and matched to ground truth symmetrically within 250m.
                  </p>
                </Panel>
              </Reveal>
            </TabsContent>

            {/* SECTION C - operational metrics (proposed pipeline) */}
            <TabsContent value="operational" className="space-y-4">
              <Reveal>
                <div className="rounded-xl border border-border bg-ink-850/50 px-3.5 py-2.5">
                  <p className="text-[0.7rem] leading-relaxed text-slate-600">
                    Operational metrics below are measured on the seeded pilot lifecycle of the proposed pipeline.
                    The complaint-frequency baseline has no routing or verification loop to evaluate
                    (its routing accuracy is null), so those panels show proposed-pipeline values only.
                  </p>
                </div>
              </Reveal>

              <Reveal delay={0.05}>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {/* duplicate clustering */}
                  <Panel
                    title="Duplicate Clustering · Ingestion"
                    icon={<GitMerge />}
                    bodyClassName="space-y-3"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="data-mono text-2xl font-semibold text-slate-900">
                        <CountUp value={proposed.duplicateClustering.ari} decimals={3} />
                      </span>
                      <span className="micro-label !text-[0.55rem] text-slate-500" title="A score for how well the found groups match the real groups (1.0 = perfect match)">Adjusted Rand Index (ARI)</span>
                    </div>
                    <AnimatedProgress
                      value={proposed.duplicateClustering.ari}
                      max={1}
                      fillClassName="bg-water"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="True Groups" value={proposed.duplicateClustering.groupsTrue} />
                      <MiniStat label="Predicted Groups" value={proposed.duplicateClustering.groupsPredicted} />
                      <MiniStat label="Baseline ARI" value={baseline.duplicateClusteringAri.toFixed(3)} />
                    </div>
                    <p className="text-[0.7rem] leading-relaxed text-slate-600">{clean(proposed.duplicateClustering.note)}</p>
                  </Panel>

                  {/* responsibility routing */}
                  <Panel
                    title="Responsibility Routing · Proposed"
                    icon={<Network />}
                    bodyClassName="space-y-3"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="data-mono text-2xl font-semibold text-slate-900">
                        <CountUp value={proposed.responsibilityRouting.accuracy * 100} decimals={1} suffix="%" />
                      </span>
                      <span className="micro-label !text-[0.55rem] text-slate-500">
                        Routing Accuracy · {proposed.responsibilityRouting.evaluated} Events Evaluated
                      </span>
                    </div>
                    {proposed.responsibilityRouting.mismatches.length > 0 ? (
                      <div className="rounded-xl border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-ink-850/60 hover:bg-ink-850/60">
                              <TableHead className="micro-label !text-[0.5rem] h-7">Event</TableHead>
                              <TableHead className="micro-label !text-[0.5rem] h-7">Expected</TableHead>
                              <TableHead className="micro-label !text-[0.5rem] h-7">Assigned</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {proposed.responsibilityRouting.mismatches.map((m) => (
                              <TableRow key={m.eventCode} className="hover:bg-ink-850/50">
                                <TableCell className="py-1.5 data-mono text-[0.68rem] text-slate-700">{m.eventCode}</TableCell>
                                <TableCell className="py-1.5 data-mono text-[0.68rem] text-verified">{m.expected}</TableCell>
                                <TableCell className="py-1.5 data-mono text-[0.68rem] text-sev-moderate">
                                  {m.assigned} <span className="text-slate-400" aria-hidden>(mismatch)</span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No routing mismatches in the evaluated set.</p>
                    )}
                    <p className="text-[0.7rem] leading-relaxed text-slate-600">
                      Expected agencies are synthetic ground-truth labels assigned by the seed dataset, not adjudicated
                      field decisions. Ambiguous multi-agency sites can legitimately disagree with a single-owner rule.
                    </p>
                  </Panel>

                  {/* assignment delay */}
                  <Panel
                    title="Assignment Delay · Counterfactual Queue Simulation"
                    icon={<Clock />}
                    bodyClassName="space-y-3"
                  >
                    <DelayRow
                      label="Baseline"
                      value={baseline.assignmentDelay}
                      max={Math.max(baseline.assignmentDelay, proposed.assignmentDelay)}
                      barClass="bg-slate-400"
                    />
                    <DelayRow
                      label="Proposed"
                      value={proposed.assignmentDelay}
                      max={Math.max(baseline.assignmentDelay, proposed.assignmentDelay)}
                      barClass="bg-water"
                    />
                    <p className="text-[0.7rem] leading-relaxed text-slate-600">
                      Median hours from detection to assignment in a counterfactual queue simulation at 2 events/hour
                      dispatch capacity. Simulated values, not measured field latencies; the proposed pipeline trades
                      queue delay for richer evidence before routing.
                    </p>
                  </Panel>

                  {/* intervention verification */}
                  <Panel
                    title="Intervention Verification · Proposed"
                    icon={<CheckCircle2 />}
                    bodyClassName="space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="data-mono text-xl font-semibold text-verified">
                            <CountUp value={proposed.verifiedResolution.rate * 100} suffix="%" />
                          </span>
                        </div>
                        <p className="micro-label !text-[0.55rem] text-slate-500 mt-0.5">Verified-Resolution Rate</p>
                        <p className="data-mono text-[0.65rem] text-slate-500 mt-1">
                          {proposed.verifiedResolution.verifiedClosures} verified of {proposed.verifiedResolution.closed} closed
                        </p>
                      </div>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="data-mono text-xl font-semibold text-sev-moderate">
                            <CountUp value={proposed.recurrenceAfterClosure.rate * 100} suffix="%" />
                          </span>
                        </div>
                        <p className="micro-label !text-[0.55rem] text-slate-500 mt-0.5 flex items-center gap-1">
                          <RotateCcw className="size-2.5" aria-hidden /> Recurrence After Closure
                        </p>
                        <p className="data-mono text-[0.65rem] text-slate-500 mt-1">
                          {proposed.recurrenceAfterClosure.reopened} reopened of {proposed.recurrenceAfterClosure.closedWithRecurrenceWatch} watched
                        </p>
                      </div>
                    </div>
                    <div className="hairline-t pt-2.5">
                      <p className="text-[0.7rem] leading-relaxed text-slate-600">{clean(proposed.recurrenceAfterClosure.note)}</p>
                    </div>
                  </Panel>
                </div>
              </Reveal>
            </TabsContent>

            {/* SECTION D - methodology */}
            <TabsContent value="methodology" className="space-y-4">
              <Reveal>
                <Panel
                  title="Methodology"
                  icon={<BookOpen />}
                  bodyClassName="space-y-2.5"
                >
                  {clean(baseline.methodology)
                    .split(/(?<=\.)\s+/)
                    .filter((p) => p.trim().length > 0)
                    .map((para, i) => (
                      <p key={i} className="text-xs leading-relaxed text-slate-600">{para.trim()}</p>
                    ))}
                </Panel>
              </Reveal>

              <Reveal delay={0.05}>
                <Panel title="Evaluation Dataset" icon={<Database />} dense>
                  <div className="flex flex-wrap divide-x divide-border">
                    <DatasetStat label="Citizen Reports" value={baseline.dataset.reports.toLocaleString("en-IN")} />
                    <DatasetStat label="Events" value={baseline.dataset.events.toLocaleString("en-IN")} />
                    <DatasetStat label="GT Hotspots" value={baseline.dataset.groundTruthHotspots.toLocaleString("en-IN")} />
                    <DatasetStat label="Candidate Cells" value={baseline.dataset.candidateCells.toLocaleString("en-IN")} />
                    <DatasetStat label="Positive Cells" value={baseline.dataset.positives.toLocaleString("en-IN")} />
                  </div>
                </Panel>
              </Reveal>

              <Reveal delay={0.1}>
                <Panel title="Research Traceability" icon={<Scale />} bodyClassName="space-y-3">
                  <div>
                    <p className="micro-label !text-[0.55rem] text-water mb-1">Research Question</p>
                    <p className="text-sm leading-relaxed text-slate-800 font-display">
                      Can heterogeneous spatial-temporal evidence produce better hotspot identification, responsibility
                      routing and intervention verification than complaint frequency alone?
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <TraceRow
                      label="Hotspot Identification"
                      value={`headline precision / recall / F1 / AUC / spatial hit rate plus the by-K curves (proposed F1 ${proposed.metrics.f1.toFixed(2)} vs baseline ${baseline.metrics.f1.toFixed(2)})`}
                    />
                    <TraceRow
                      label="Responsibility Routing"
                      value={`routing accuracy ${(proposed.responsibilityRouting.accuracy * 100).toFixed(0)}% over ${proposed.responsibilityRouting.evaluated} evaluated events with mismatch audit`}
                    />
                    <TraceRow
                      label="Intervention Verification"
                      value={`verified-resolution rate ${(proposed.verifiedResolution.rate * 100).toFixed(0)}% and recurrence-after-closure rate ${(proposed.recurrenceAfterClosure.rate * 100).toFixed(0)}%`}
                    />
                  </div>
                </Panel>
              </Reveal>
            </TabsContent>

            {/* SECTION E - predictions vs ground truth */}
            <TabsContent value="truth" className="space-y-4">
              <Reveal>
                <Panel
                  title="Computed Hotspots vs Ground Truth"
                  icon={<MapPin />}
                  actions={
                    <span className="micro-label !text-[0.55rem] text-slate-500">
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
                    <EmptyState title="No Hotspot Data" hint="Both lists come from the /api/hotspots data source." />
                  ) : (
                    <>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* computed */}
                        <div>
                          <p className="micro-label !text-[0.55rem] text-slate-500 mb-2 flex items-center gap-2">
                            <span className="size-2 rounded-[2px] bg-water" aria-hidden /> Computed · Engine Risk Grid (NMS 400m)
                          </p>
                          <div className="rounded-xl border border-border overflow-hidden">
                            <Stagger>
                              {hotspotMatch.computed.map((c) => (
                                <StaggerItem key={c.code} className="px-3 py-2 hairline-b last:border-0">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <p className="text-xs text-slate-700 truncate" title={c.name}>{c.name}</p>
                                    <span className="data-mono text-[0.68rem] text-water shrink-0">{c.score}</span>
                                  </div>
                                  <div className="mt-1 flex items-center gap-2.5">
                                    <AnimatedProgress
                                      value={c.score}
                                      max={100}
                                      className="w-20 shrink-0"
                                      fillClassName="bg-water"
                                    />
                                    <span className="data-mono text-[0.6rem] text-slate-500">{c.eventCount} events</span>
                                    {c.nearestD != null ? (
                                      <span className={cn("micro-label !text-[0.5rem] !tracking-[0.08em]", c.nearestD <= MATCH_RADIUS_M ? "text-verified" : "text-slate-400")}>
                                        {c.nearestD <= MATCH_RADIUS_M ? `match ${c.nearest?.code} · ${Math.round(c.nearestD)}m` : `nearest GT ${Math.round(c.nearestD)}m`}
                                      </span>
                                    ) : (
                                      <span className="micro-label !text-[0.5rem] text-slate-400">no GT</span>
                                    )}
                                  </div>
                                </StaggerItem>
                              ))}
                            </Stagger>
                          </div>
                        </div>

                        {/* ground truth */}
                        <div>
                          <p className="micro-label !text-[0.55rem] text-slate-500 mb-2 flex items-center gap-2">
                            <span className="size-2 rounded-[2px] bg-sev-moderate" aria-hidden /> Ground Truth · Seeded Known Sites
                          </p>
                          <div className="rounded-xl border border-border overflow-hidden">
                            <Stagger>
                              {hotspotMatch.groundTruth.map((g) => (
                                <StaggerItem key={g.code} className="px-3 py-2 hairline-b last:border-0">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <p className="text-xs text-slate-700 truncate" title={g.name}>{g.name}</p>
                                    <span className="data-mono text-[0.62rem] text-slate-500 shrink-0">{g.code}</span>
                                  </div>
                                  <div className="mt-1 flex items-center gap-2.5 flex-wrap">
                                    <span className="data-mono text-[0.6rem] text-slate-500">radius {Math.round(g.radiusM)}m</span>
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
                                </StaggerItem>
                              ))}
                            </Stagger>
                          </div>
                        </div>
                      </div>
                      <p className="micro-label !text-[0.55rem] text-slate-400 !tracking-[0.08em] normal-case leading-relaxed">
                        Distances computed client-side with the haversine helper; a computed hotspot counts as covering a
                        ground-truth site when within {MATCH_RADIUS_M}m. For the spatial map open Map Explorer and enable
                        the ground-truth layer. Computed source: {clean(hotspotMatch.computed[0]?.dataLabel ?? "MODEL_OUTPUT")}.
                      </p>
                    </>
                  )}
                </Panel>
              </Reveal>
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}

// --- local primitives ---------------------------------------------------------

function ApproachCard({ tone, label, name, body, metrics }: {
  tone: "baseline" | "proposed";
  label: string;
  name: string;
  body: string;
  metrics: Metrics;
}) {
  const proposed = tone === "proposed";
  return (
    <HoverLift className="h-full">
      <SpotlightCard className="rounded-xl h-full">
        <div className={cn("panel rounded-xl h-full p-4 sm:p-5", proposed && "border-water/30")}>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "grid size-10 place-items-center rounded-lg shrink-0",
                proposed ? "bg-blue-50 text-water" : "bg-slate-100 text-slate-500"
              )}
              aria-hidden
            >
              {proposed ? <Layers className="size-5" /> : <BarChart3 className="size-5" />}
            </span>
            <div className="min-w-0">
              <p className={cn("micro-label !text-[0.55rem]", proposed ? "text-water" : "text-slate-500")}>{label}</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5 leading-snug">{name}</p>
            </div>
          </div>
          <p className="text-[0.72rem] leading-relaxed text-slate-600 mt-2.5">{body}</p>
          <div className="hairline-t mt-3.5 pt-3 grid grid-cols-3 gap-2">
            <MetricStat label="F1" value={metrics.f1} accent={proposed} />
            <MetricStat label="AUC" value={metrics.auc} accent={proposed} />
            <MetricStat label="Hit Rate" value={metrics.spatialHitRate} accent={proposed} />
          </div>
        </div>
      </SpotlightCard>
    </HoverLift>
  );
}

function MetricStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <p className="micro-label !text-[0.5rem] text-slate-400 !tracking-[0.08em]">{label}</p>
      <p className={cn("data-mono text-sm font-semibold tabular-nums mt-0.5", accent ? "text-water" : "text-slate-700")}>
        <CountUp value={value} decimals={3} />
      </p>
    </div>
  );
}

function LegendSwatches() {
  return (
    <span className="flex items-center gap-4">
      <span className="flex items-center gap-1.5 micro-label !text-[0.52rem] text-slate-500">
        <span className="size-2.5 rounded-[2px]" style={{ background: SLATE_BAR }} aria-hidden /> Baseline
      </span>
      <span className="flex items-center gap-1.5 micro-label !text-[0.52rem] text-slate-500">
        <span className="size-2.5 rounded-[2px]" style={{ background: BLUE }} aria-hidden /> Proposed
      </span>
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-ink-850/40 px-2.5 py-2">
      <p className="micro-label !text-[0.5rem] text-slate-500 !tracking-[0.08em]">{label}</p>
      <p className="data-mono text-[0.72rem] text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

function DelayRow({ label, value, max, barClass }: { label: string; value: number; max: number; barClass: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="micro-label !text-[0.55rem] text-slate-500">{label}</span>
        <span className="data-mono text-[0.72rem] text-slate-700">
          <CountUp value={value} decimals={1} suffix=" h" />
        </span>
      </div>
      <AnimatedProgress value={value} max={max} fillClassName={barClass} />
    </div>
  );
}

function TraceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-ink-850/40 px-3.5 py-2.5">
      <span className="micro-label !text-[0.52rem] text-water !tracking-[0.08em] w-40 shrink-0 pt-0.5">{label}</span>
      <ArrowRight className="size-3 text-slate-400 shrink-0 mt-0.5" aria-hidden />
      <span className="text-[0.72rem] leading-relaxed text-slate-600">{value}</span>
    </div>
  );
}

function DatasetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-2.5 flex-1 min-w-fit">
      <p className="micro-label !text-[0.52rem] text-slate-500 !tracking-[0.08em]">{label}</p>
      <p className="data-mono text-sm text-slate-800 mt-0.5">{value}</p>
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
