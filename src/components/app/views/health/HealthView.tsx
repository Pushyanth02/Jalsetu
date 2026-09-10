"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/api";
import {
  LoadingRows, ErrorNote, Panel, EmptyState, TimeAgo, ProviderChip,
} from "@/components/app/shared/domain";
import { Reveal, Stagger, StaggerItem, CountUp, HoverLift, PulseDot } from "@/components/motion/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, Bar, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  Activity, Database, BrainCircuit, RefreshCw, Gauge, HeartPulse, History, Server,
  ShieldCheck, AlertTriangle, BookOpen,
} from "lucide-react";

// DATA & MODEL HEALTH - source freshness, provider state, run log,
// confidence distribution and live client-side endpoint checks.

interface SourceHealth {
  key: string;
  label: string;
  records: number;
  lastRecordAt: string | null;
  freshness: number | null;
  status: "OK" | "STALE" | "EMPTY";
  missingness: Record<string, string>;
  sourceLabel: string;
}

interface DataHealthResponse {
  generatedAt: string;
  overall: "OK" | "EMPTY_DATABASE";
  note: string;
  sources: SourceHealth[];
  pilot: { jurisdictions: number; hotspots: number; groundTruthHotspots: number };
}

interface ModelRun {
  id: string;
  modelId: string;
  version: string;
  provider: string;
  status: string;
  inputCount: number;
  outputCount: number;
  latencyMs: number | null;
  startedAt: string;
  finishedAt: string;
  error: string | null;
  notes: string | null;
}

interface ModelHealthResponse {
  generatedAt: string;
  provider: {
    provider: string;
    modelId: string;
    available: boolean;
    lastCheckedAt: string;
    lastError: string | null;
    configuredBy: string;
  };
  versions: Record<string, string>;
  runs: ModelRun[];
  runsSummary: { total: number; succeeded: number; failed: number; successRate: number };
  confidenceDistribution: {
    buckets: { range: string; count: number }[];
    mean: number;
    min: number;
    max: number;
    lowConfidenceFlag: number;
  };
  classificationProviders: Record<string, number>;
  note: string;
}

interface HealthResponse {
  status: string;
  checkedAt: string;
  db: { reachable: boolean; events: number; reports: number; observations: number };
  ai: {
    provider: string;
    modelId: string;
    available: boolean;
    lastCheckedAt: string;
    lastError: string | null;
    configuredBy: string;
    fallback?: string;
  };
  lastModelRun: { modelId: string; status: string; provider: string; startedAt: string } | null;
  latencyMs: number;
  dataLabel: string;
}

const BLUE = "#3b82f6";  // at/above confidence flag threshold (blue-500)
const AMBER = "#f59e0b"; // below confidence flag threshold (amber-500)
const GRID_STROKE = "#e2e8f0";
const TICK = { fill: "#94a3b8", fontSize: 9, fontFamily: "var(--font-plex-mono)" };
const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 11,
  fontFamily: "var(--font-plex-mono)",
  boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
};
const LABEL_STYLE = { color: "#64748b" };
const CURSOR_FILL = { fill: "rgba(37, 99, 235, 0.05)" };

const clean = (s: string) => s.replace(/-/g, "-").replace(/-/g, "-");

// client-side endpoint probes (same-origin relative paths)
const ENDPOINTS = ["/api/health", "/api/data-health", "/api/model-health", "/api/events?limit=1", "/api/weather", "/api/hotspots"];

interface PingState {
  path: string;
  status: "pending" | "ok" | "err";
  ms: number | null;
  code: number | null;
}

async function ping(path: string): Promise<PingState> {
  const t0 = performance.now();
  try {
    const res = await fetch(path, { cache: "no-store" });
    const ms = Math.round(performance.now() - t0);
    return { path, status: res.ok ? "ok" : "err", ms, code: res.status };
  } catch {
    return { path, status: "err", ms: Math.round(performance.now() - t0), code: null };
  }
}

const SEVERITY: Record<string, number> = { EMPTY: 0, STALE: 1, OK: 2 };

// Plain-language glossary for non-technical readers (terms used across the app).
const GLOSSARY: { term: string; definition: string }[] = [
  { term: "Waterlogging", definition: "Rain water that stays standing on roads long after the rain has stopped." },
  { term: "Urban Event", definition: "One real-world incident that merges several citizen reports from the same place and time." },
  { term: "Risk Score", definition: "A 0-100 number estimating how urgently crews should respond to an incident." },
  { term: "Risk Band", definition: "The plain-language bucket for a risk score: Low, Moderate, High or Critical." },
  { term: "Severity", definition: "How serious the reported conditions are, from 1 (minor) to 4 (critical)." },
  { term: "Jurisdiction", definition: "The official area (ward or corridor) an agency is responsible for maintaining." },
  { term: "Verification", definition: "A field crew confirming water depth and cleanup on site before an event closes." },
  { term: "Ground Truth", definition: "Independently known problem sites used to check whether the system's guesses are right." },
  { term: "Baseline", definition: "The old approach: reacting only to how often complaints arrive from an area." },
  { term: "Proposed System", definition: "The new approach: combining complaints, rainfall, drains and infrastructure into one signal." },
  { term: "AI Classification", definition: "The model reading each report and tagging its category, severity and confidence." },
  { term: "Synthetic Demo Data", definition: "Realistic but generated data for safe testing. It is never real citizen data." },
];

// motion-enhanced table row (keeps semantic <tr> nesting inside tbody)
const MotionRow = motion.tr;

export function HealthView() {
  const dataQ = useQuery({
    queryKey: ["data-health"],
    queryFn: () => apiGet<DataHealthResponse>("/api/data-health").then((r) => r.data),
    refetchInterval: 60_000,
  });
  const modelQ = useQuery({
    queryKey: ["model-health-full"],
    queryFn: () => apiGet<ModelHealthResponse>("/api/model-health").then((r) => r.data),
    refetchInterval: 60_000,
  });
  const healthQ = useQuery({
    queryKey: ["health-basic"],
    queryFn: () => apiGet<HealthResponse>("/api/health").then((r) => r.data),
    staleTime: 60_000,
  });

  // --- client endpoint checks ------------------------------------------------
  const [pings, setPings] = useState<PingState[]>([]);
  const [pinging, setPinging] = useState(false);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const runPings = useCallback(async () => {
    setPinging(true);
    setPings(ENDPOINTS.map((p) => ({ path: p, status: "pending" as const, ms: null, code: null })));
    await Promise.all(
      ENDPOINTS.map(async (path) => {
        const r = await ping(path);
        setPings((prev) => prev.map((x) => (x.path === path ? r : x)));
      })
    );
    setLastPingAt(Date.now());
    setPinging(false);
  }, []);
  useEffect(() => {
    runPings();
  }, [runPings]);

  const dh = dataQ.data;
  const mh = modelQ.data;
  const hb = healthQ.data;

  const refetchAll = () => {
    dataQ.refetch();
    modelQ.refetch();
    healthQ.refetch();
  };

  // staggered table-row entrance variants (respects prefers-reduced-motion)
  const reduce = useReducedMotion();
  const rowVariants: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.25 } } }
    : { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* header strip */}
      <div className="hairline-b bg-white px-4 sm:px-6 py-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 leading-tight">Data &amp; Model Health</h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 micro-label !text-[0.58rem] text-water">
                <HeartPulse className="size-3" aria-hidden /> telemetry
              </span>
            </div>
            <p className="text-[0.7rem] text-muted-foreground mt-0.5">
              A quick health check of every data source and AI model behind this dashboard.
            </p>
          </div>
          <button
            onClick={refetchAll}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 micro-label !text-[0.58rem] text-water hover:bg-blue-100 hover:border-blue-300 transition-colors"
          >
            <RefreshCw className={cn("size-3", (dataQ.isFetching || modelQ.isFetching || healthQ.isFetching) && "animate-spin")} aria-hidden />
            refresh all
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          {dh && (
            <span className="data-mono text-[0.65rem] text-slate-500">
              data snapshot <TimeAgo iso={dh.generatedAt} />
            </span>
          )}
          {mh && (
            <span className="data-mono text-[0.65rem] text-slate-500">
              model snapshot <TimeAgo iso={mh.generatedAt} />
            </span>
          )}
          {hb && <span className="data-mono text-[0.65rem] text-slate-500">{clean(hb.dataLabel)}</span>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 pb-8 space-y-4">
        {/* SECTION A - overall status strip (stat cards + system details) */}
        <Reveal>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4">
            {healthQ.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 rounded-xl shimmer" />)
            ) : healthQ.isError ? (
              <div className="col-span-full max-w-lg">
                <ErrorNote message={(healthQ.error as Error).message} onRetry={() => healthQ.refetch()} />
              </div>
            ) : hb ? (
              <>
                <StatCard
                  icon={<Database className="size-5" aria-hidden />}
                  tint="bg-blue-50 text-water"
                  value={<CountUp value={hb.db.events} />}
                  label="Database events"
                  sub={hb.db.reachable ? `${hb.db.reports} reports · ${hb.db.observations} obs` : "db unreachable"}
                />
                <StatCard
                  icon={<Gauge className="size-5" aria-hidden />}
                  tint={hb.latencyMs > 5000 ? "bg-amber-50 text-sev-moderate" : "bg-blue-50 text-water"}
                  value={<CountUp value={hb.latencyMs} suffix=" ms" />}
                  label="API latency"
                  sub="time for the server to answer one health check"
                />
                {dh && (
                  <StatCard
                    icon={<ShieldCheck className="size-5" aria-hidden />}
                    tint={dh.overall === "OK" ? "bg-emerald-50 text-verified" : "bg-amber-50 text-sev-moderate"}
                    value={
                      <span className={dh.overall === "OK" ? "text-verified" : "text-sev-moderate"}>
                        {dh.overall === "OK" ? "OK" : "EMPTY"}
                      </span>
                    }
                    label="Data health"
                    sub={`${dh.sources.length} sources · ${dh.pilot.jurisdictions} jurisdictions · ${dh.pilot.groundTruthHotspots} ground-truth sites`}
                  />
                )}
                <StatCard
                  icon={<BrainCircuit className="size-5" aria-hidden />}
                  tint={hb.ai.available ? "bg-emerald-50 text-verified" : "bg-amber-50 text-sev-moderate"}
                  value={
                    <span className={cn("inline-flex items-center gap-2", hb.ai.available ? "text-verified" : "text-sev-moderate")}>
                      {hb.ai.available && <PulseDot color="bg-emerald-500" size={8} />}
                      {hb.ai.available ? "available" : "fallback"}
                    </span>
                  }
                  label="AI provider"
                  sub={hb.ai.provider}
                />
              </>
            ) : null}
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <Panel
            title="System Details"
            icon={<Activity />}
            actions={hb && <ProviderChip provider={hb.ai.provider} model={hb.ai.modelId} />}
          >
            {healthQ.isLoading ? (
              <LoadingRows rows={2} />
            ) : !hb ? null : (
              <div className="space-y-3">
                {dh && dh.overall === "EMPTY_DATABASE" ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 space-y-1.5">
                    <p className="text-xs text-amber-800 leading-relaxed flex items-start gap-2.5">
                      <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-px" aria-hidden />
                      <span>{clean(dh.note)}</span>
                    </p>
                    <p className="data-mono text-[0.65rem] text-amber-700/80">
                      POST /api/admin/seed · body {"{ confirm: true }"} · header x-demo-role: ADMIN
                    </p>
                  </div>
                ) : (
                  dh && <p className="micro-label !text-[0.55rem] text-slate-400 !tracking-[0.08em] normal-case">{clean(dh.note)}</p>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {hb.lastModelRun && (
                    <span className="data-mono text-[0.65rem] text-slate-500">
                      last model run: <span className="text-slate-800">{hb.lastModelRun.modelId}</span> ·{" "}
                      {hb.lastModelRun.status} · {hb.lastModelRun.provider} · <TimeAgo iso={hb.lastModelRun.startedAt} />
                    </span>
                  )}
                  {hb.ai.fallback && (
                    <span className="micro-label !text-[0.55rem] text-slate-500" title="Used when the AI provider is unavailable">
                      fallback: {clean(hb.ai.fallback)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </Reveal>

        {/* SECTION B - source health table */}
        <Reveal delay={0.1}>
          <Panel
            title={
              <span className="flex items-center gap-2">
                Source Health
                {dh && <span className="data-mono ml-1 !text-[0.62rem] !tracking-normal !normal-case font-normal text-slate-400">{dh.sources.length} sources</span>}
              </span>
            }
            icon={<Database />}
            actions={
              <button
                onClick={() => dataQ.refetch()}
                className="micro-label !text-[0.58rem] text-water hover:text-water-dim transition-colors"
              >
                refetch
              </button>
            }
            dense
          >
            {dataQ.isLoading ? (
              <LoadingRows rows={6} className="p-4" />
            ) : dataQ.isError ? (
              <ErrorNote message={(dataQ.error as Error).message} onRetry={() => dataQ.refetch()} className="m-4" />
            ) : !dh ? null : dh.sources.length === 0 ? (
              <EmptyState title="No Sources Reporting" />
            ) : (
              <Stagger className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-ink-850/60 hover:bg-ink-850/60">
                      <TableHead className="micro-label !text-[0.55rem] h-8" title="Which data feed this row comes from">Source</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8 text-right">Records</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8" title="When the newest record arrived">Freshness</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8">Status</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8" title="Which fields have no recorded values">Missingness</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8 hidden md:table-cell" title="Where the data comes from">Provenance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...dh.sources]
                      .sort((a, b) => (SEVERITY[a.status] ?? 3) - (SEVERITY[b.status] ?? 3) || b.records - a.records)
                      .map((s) => (
                        <MotionRow key={s.key} variants={rowVariants} className="hover:bg-ink-850/50 border-b transition-colors">
                          <TableCell className="py-2">
                            <span className="text-xs text-slate-700">{s.label}</span>
                            <span className="block data-mono text-[0.58rem] text-slate-400">{s.key}</span>
                          </TableCell>
                          <TableCell className="py-2 text-right data-mono text-[0.72rem] text-slate-800">{s.records.toLocaleString("en-IN")}</TableCell>
                          <TableCell className="py-2">
                            {s.lastRecordAt ? (
                              <TimeAgo iso={s.lastRecordAt} />
                            ) : (
                              <span className="data-mono text-[0.65rem] text-slate-400">never</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2"><SourceStatusBadge status={s.status} /></TableCell>
                          <TableCell className="py-2 max-w-56">
                            {Object.keys(s.missingness).length > 0 ? (
                              <span className="data-mono text-[0.62rem] text-slate-500" title={Object.entries(s.missingness).map(([k, v]) => `${k}: ${v}`).join(" · ")}>
                                {Object.entries(s.missingness).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                              </span>
                            ) : (
                              <span className="data-mono text-[0.62rem] text-slate-400">none</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 hidden md:table-cell">
                            <span className="micro-label !text-[0.52rem] text-slate-500 !tracking-[0.06em]" title={s.sourceLabel}>
                              {clean(s.sourceLabel)}
                            </span>
                          </TableCell>
                        </MotionRow>
                      ))}
                  </TableBody>
                </Table>
              </Stagger>
            )}
          </Panel>
        </Reveal>

        {/* SECTION C - model & provider */}
        <Reveal delay={0.15}>
          <Panel
            title="Model & Provider"
            icon={<BrainCircuit />}
            actions={
              <button onClick={() => modelQ.refetch()} className="micro-label !text-[0.58rem] text-water hover:text-water-dim transition-colors">
                refetch
              </button>
            }
          >
            {modelQ.isLoading ? (
              <LoadingRows rows={4} />
            ) : modelQ.isError ? (
              <ErrorNote message={(modelQ.error as Error).message} onRetry={() => modelQ.refetch()} />
            ) : !mh ? null : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-ink-850/50 px-3.5 py-3 space-y-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <ProviderChip provider={mh.provider.provider} model={mh.provider.modelId} />
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 micro-label !text-[0.6rem] font-medium",
                          mh.provider.available
                            ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                            : "text-amber-700 border-amber-200 bg-amber-50"
                        )}
                      >
                        {mh.provider.available ? (
                          <PulseDot color="bg-emerald-500" size={6} />
                        ) : (
                          <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
                        )}
                        {mh.provider.available ? "available" : "unavailable"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span className="data-mono text-[0.65rem] text-slate-500">
                        model <span className="text-slate-800">{mh.provider.modelId}</span>
                      </span>
                      <span className="data-mono text-[0.65rem] text-slate-500">
                        configured by <span className="text-slate-800">{mh.provider.configuredBy}</span>
                      </span>
                      <span className="data-mono text-[0.65rem] text-slate-500">
                        checked <TimeAgo iso={mh.provider.lastCheckedAt} />
                      </span>
                    </div>
                    {!mh.provider.available && mh.provider.lastError && (
                      <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs">
                        <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-px" aria-hidden />
                        <span className="text-amber-800 leading-relaxed">{mh.provider.lastError}</span>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-ink-850/50 px-3.5 py-3 space-y-1.5">
                    <p className="micro-label !text-[0.55rem] text-slate-500 mb-1">Component Versions</p>
                    {Object.entries(mh.versions).map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3">
                        <span className="micro-label !text-[0.52rem] text-slate-500 !tracking-[0.08em]">{k}</span>
                        <span className="data-mono text-[0.68rem] text-slate-800">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-ink-850/50 px-3.5 py-3">
                  <p className="micro-label !text-[0.55rem] text-slate-500 mb-2">Model Runs · Last 25</p>
                  <div className="flex flex-wrap divide-x divide-border rounded-lg border border-border bg-white">
                    <Segment label="Total" value={<CountUp value={mh.runsSummary.total} />} tone="plain" border={false} />
                    <Segment label="Succeeded" value={<CountUp value={mh.runsSummary.succeeded} />} tone="teal" border={false} />
                    <Segment label="Failed" value={<CountUp value={mh.runsSummary.failed} />} tone={mh.runsSummary.failed > 0 ? "red" : "plain"} border={false} />
                    <Segment
                      label="Success Rate"
                      value={`${(mh.runsSummary.successRate * 100).toFixed(0)}%`}
                      tone={mh.runsSummary.failed > 0 ? "amber" : "teal"}
                      border={false}
                    />
                  </div>
                </div>

                <p className="micro-label !text-[0.55rem] text-slate-400 !tracking-[0.08em] normal-case leading-relaxed">
                  {clean(mh.note)}
                </p>
              </div>
            )}
          </Panel>
        </Reveal>

        {/* SECTION D - model runs table */}
        <Reveal delay={0.2}>
          <Panel
            title={
              <span className="flex items-center gap-2">
                Model Run Log
                {mh && <span className="data-mono ml-1 !text-[0.62rem] !tracking-normal !normal-case font-normal text-slate-400">{Math.min(25, mh.runs.length)} of {mh.runsSummary.total}</span>}
              </span>
            }
            icon={<History />}
            dense
          >
            {modelQ.isLoading ? (
              <LoadingRows rows={6} className="p-4" />
            ) : modelQ.isError ? (
              <ErrorNote message={(modelQ.error as Error).message} onRetry={() => modelQ.refetch()} className="m-4" />
            ) : !mh ? null : mh.runs.length === 0 ? (
              <EmptyState title="No Model Runs Recorded" hint="Runs appear here after the AI reads new reports or an event's risk is recalculated." />
            ) : (
              <ScrollArea className="max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-ink-850/60 hover:bg-ink-850/60">
                      <TableHead className="micro-label !text-[0.55rem] h-8">Model</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8">Provider</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8">Status</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8 text-right">In/Out</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8 text-right">Latency</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8">Started</TableHead>
                      <TableHead className="micro-label !text-[0.55rem] h-8 hidden lg:table-cell">Notes / Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mh.runs.slice(0, 25).map((r) => (
                      <TableRow key={r.id} className="hover:bg-ink-850/50">
                        <TableCell className="py-2">
                          <span className="data-mono text-[0.68rem] text-slate-700">{r.modelId}</span>
                          <span className="block data-mono text-[0.55rem] text-slate-400">{r.version}</span>
                        </TableCell>
                        <TableCell className="py-2 data-mono text-[0.65rem] text-slate-500">{r.provider}</TableCell>
                        <TableCell className="py-2"><RunStatusBadge status={r.status} /></TableCell>
                        <TableCell className="py-2 text-right data-mono text-[0.65rem] text-slate-500">
                          {r.inputCount}<span className="text-slate-400">→</span>{r.outputCount}
                        </TableCell>
                        <TableCell className="py-2 text-right data-mono text-[0.65rem] text-slate-500">
                          {r.latencyMs != null ? `${r.latencyMs} ms` : "-"}
                        </TableCell>
                        <TableCell className="py-2"><TimeAgo iso={r.startedAt} /></TableCell>
                        <TableCell
                          className={cn("py-2 hidden lg:table-cell max-w-72 truncate text-[0.62rem]", r.error ? "text-sev-critical" : "text-slate-500")}
                          title={r.error ?? r.notes ?? undefined}
                        >
                          {r.error ?? r.notes ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </Panel>
        </Reveal>

        {/* SECTION E - confidence distribution */}
        <Reveal delay={0.25}>
          <Panel
            title="Classification Confidence Distribution"
            icon={<Gauge />}
          >
            {modelQ.isLoading ? (
              <LoadingRows rows={3} />
            ) : modelQ.isError ? (
              <ErrorNote message={(modelQ.error as Error).message} onRetry={() => modelQ.refetch()} />
            ) : !mh ? null : (
              <div className="space-y-3">
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={mh.confidenceDistribution.buckets.map((b) => {
                        const [lo, hi] = clean(b.range).split("-").map(Number);
                        const mid = Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : 1;
                        return { range: clean(b.range), count: b.count, low: mid < mh.confidenceDistribution.lowConfidenceFlag };
                      })}
                      margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="range" tick={TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                      <YAxis allowDecimals={false} width={28} tick={TICK} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={LABEL_STYLE}
                        cursor={CURSOR_FILL}
                        formatter={(v: number) => [v, "reports"]}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={22} animationDuration={700}>
                        {mh.confidenceDistribution.buckets.map((b, i) => {
                          const [lo, hi] = clean(b.range).split("-").map(Number);
                          const mid = Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : 1;
                          return <Cell key={i} fill={mid < mh.confidenceDistribution.lowConfidenceFlag ? AMBER : BLUE} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                  <span className="flex items-center gap-1.5 micro-label !text-[0.52rem] text-slate-500">
                    <span className="size-2.5 rounded-[2px]" style={{ background: BLUE }} aria-hidden /> At/Above Review Threshold
                  </span>
                  <span className="flex items-center gap-1.5 micro-label !text-[0.52rem] text-slate-500">
                    <span className="size-2.5 rounded-[2px]" style={{ background: AMBER }} aria-hidden /> Below Threshold · Flagged for Review
                  </span>
                  <span className="data-mono text-[0.65rem] text-slate-500 ml-auto">
                    mean <span className="text-slate-800">{mh.confidenceDistribution.mean.toFixed(2)}</span> · min{" "}
                    <span className="text-slate-800">{mh.confidenceDistribution.min.toFixed(2)}</span> · max{" "}
                    <span className="text-slate-800">{mh.confidenceDistribution.max.toFixed(2)}</span>
                  </span>
                </div>
                <p className="micro-label !text-[0.55rem] text-slate-400 !tracking-[0.08em] normal-case leading-relaxed">
                  When the AI is less than {mh.confidenceDistribution.lowConfidenceFlag} sure about a report, it is flagged for a
                  human to double-check (see the confidence chips in the event list). The 0.4-0.6 bucket sits across the
                  threshold, so its colour is only a guide.
                </p>
                <div className="hairline-t pt-2.5 flex flex-wrap items-center gap-2">
                  <span className="micro-label !text-[0.55rem] text-slate-500">Classified Reports by Provider</span>
                  {Object.entries(mh.classificationProviders).map(([k, count]) => (
                    <span key={k} className="inline-flex items-center gap-1.5">
                      <ProviderChip provider={k} />
                      <span className="data-mono text-[0.62rem] text-slate-500">×{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </Reveal>

        {/* SECTION F - client-side endpoint checks */}
        <Reveal delay={0.3}>
          <Panel
            title={
              <span className="flex items-center gap-2">
                API Endpoint Checks
                <span className="micro-label !text-[0.5rem] text-slate-400">Client-Side · Same-Origin</span>
              </span>
            }
            icon={<Server />}
            actions={
              <div className="flex items-center gap-3">
                {lastPingAt != null && (
                  <span className="data-mono text-[0.62rem] text-slate-500">
                    checked {Math.max(0, Math.round((Date.now() - lastPingAt) / 1000))}s ago
                  </span>
                )}
                <button
                  onClick={() => runPings()}
                  disabled={pinging}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 micro-label !text-[0.58rem] text-water hover:bg-blue-100 hover:border-blue-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("size-3", pinging && "animate-spin")} aria-hidden />
                  refresh checks
                </button>
              </div>
            }
            dense
          >
            {pings.length === 0 ? (
              <LoadingRows rows={4} className="p-4" />
            ) : (
              <div aria-busy={pinging}>
                <Stagger>
                  {pings.map((p) => (
                  <StaggerItem key={p.path} className="flex items-center gap-3 px-4 py-2.5 hairline-b last:border-0">
                    {p.status === "ok" ? (
                      <PulseDot color="bg-emerald-500" size={7} />
                    ) : p.status === "err" ? (
                      <PulseDot color="bg-red-500" size={7} />
                    ) : (
                      <span aria-hidden className="size-[7px] rounded-full bg-slate-400 animate-pulse shrink-0" />
                    )}
                    <span className="data-mono text-[0.7rem] text-slate-700 flex-1 truncate">{p.path}</span>
                    {p.status === "err" && p.code != null && (
                      <span className="data-mono text-[0.62rem] text-sev-critical">HTTP {p.code}</span>
                    )}
                    <span className="data-mono text-[0.68rem] text-slate-500 w-16 text-right shrink-0">
                      {p.ms != null ? `${p.ms} ms` : "-"}
                    </span>
                    <span
                      className={cn(
                        "micro-label !text-[0.55rem] w-14 text-right shrink-0",
                        p.status === "ok" ? "text-verified" : p.status === "err" ? "text-sev-critical" : "text-slate-500"
                      )}
                    >
                      {p.status === "ok" ? "ok" : p.status === "err" ? "error" : "checking"}
                    </span>
                  </StaggerItem>
                  ))}
                </Stagger>
              </div>
            )}
            <p className="micro-label !text-[0.55rem] text-slate-400 !tracking-[0.08em] normal-case leading-relaxed px-4 py-2.5 hairline-t">
              Response times are measured from this browser. The /api/health check also contacts the AI provider, so it can
              take a few seconds.
            </p>
          </Panel>
        </Reveal>

        {/* SECTION G - plain-language glossary */}
        <Reveal delay={0.35}>
          <Panel title="Plain-Language Glossary" icon={<BookOpen />}>
            <p className="mb-3 text-[0.7rem] text-muted-foreground">
              Short, everyday definitions for the terms this dashboard uses.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GLOSSARY.map((g) => (
                <div key={g.term} className="rounded-xl border border-border bg-white px-3.5 py-2.5 shadow-xs">
                  <p className="text-xs leading-relaxed">
                    <span className="font-bold text-slate-800">{g.term}: </span>
                    <span className="text-[0.68rem] text-slate-500">{g.definition}</span>
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </Reveal>
      </div>
    </div>
  );
}

// --- local primitives -----------------------------------------------------------

function StatCard({ icon, tint, value, label, sub }: {
  icon: ReactNode;
  tint: string;
  value: ReactNode;
  label: string;
  sub?: ReactNode;
}) {
  return (
    <HoverLift className="h-full">
      <div className="panel rounded-xl h-full p-4">
        <span className={cn("grid size-10 place-items-center rounded-lg shrink-0", tint)}>{icon}</span>
        <p className="mt-3 font-display text-2xl font-bold tabular-nums text-slate-900 leading-none">{value}</p>
        <p className="mt-1.5 text-[0.72rem] font-medium text-slate-500 leading-snug">{label}</p>
        {sub && <p className="mt-1 data-mono text-[0.6rem] text-slate-400 leading-relaxed">{sub}</p>}
      </div>
    </HoverLift>
  );
}

function Segment({ label, value, tone = "plain", border = true }: { label: string; value: ReactNode; tone?: "plain" | "teal" | "amber" | "red"; border?: boolean }) {
  return (
    <div className={cn("px-3.5 py-2 min-w-fit flex-1", border && "border-l border-border first:border-l-0")}>
      <p className="micro-label !text-[0.5rem] text-slate-500 !tracking-[0.08em]">{label}</p>
      <p
        className={cn(
          "data-mono text-[0.72rem] mt-0.5",
          tone === "teal" ? "text-verified" : tone === "amber" ? "text-sev-moderate" : tone === "red" ? "text-sev-critical" : "text-slate-800"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SourceStatusBadge({ status }: { status: string }) {
  const meta =
    status === "OK"
      ? { label: "OK", cls: "text-emerald-700 border-emerald-200 bg-emerald-50", dot: "bg-emerald-500" }
      : status === "STALE"
        ? { label: "STALE", cls: "text-amber-700 border-amber-200 bg-amber-50", dot: "bg-amber-500" }
        : { label: "EMPTY", cls: "text-red-700 border-red-200 bg-red-50", dot: "bg-red-500" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 micro-label !text-[0.6rem] !tracking-[0.1em] font-medium", meta.cls)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const meta =
    status === "SUCCEEDED"
      ? { label: "succeeded", cls: "text-emerald-700 border-emerald-200 bg-emerald-50", dot: "bg-emerald-500" }
      : status === "FAILED"
        ? { label: "failed", cls: "text-red-700 border-red-200 bg-red-50", dot: "bg-red-500" }
        : status === "RUNNING"
          ? { label: "running", cls: "text-water border-blue-200 bg-blue-50", dot: "bg-water-dim" }
          : { label: status.toLowerCase(), cls: "text-slate-600 border-slate-200 bg-slate-100", dot: "bg-slate-400" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 micro-label !text-[0.6rem] !tracking-[0.08em] font-medium", meta.cls)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
