"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/api";
import {
  LoadingRows, ErrorNote, Panel, EmptyState, TimeAgo, ProviderChip,
} from "@/components/app/shared/domain";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, Bar, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import { Activity, Database, Cpu, RefreshCw, Gauge, HeartPulse, History, Server } from "lucide-react";

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

const TEAL = "#45c4b0";
const AMBER = "#d9a62e";
const GRID_STROKE = "rgba(148,180,186,0.12)";
const TICK = { fill: "#5c7076", fontSize: 9, fontFamily: "var(--font-plex-mono)" };
const TOOLTIP_STYLE = {
  background: "#141b20",
  border: "1px solid rgba(148,180,186,0.18)",
  borderRadius: 4,
  fontSize: 11,
  fontFamily: "var(--font-plex-mono)",
};

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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* header strip */}
      <div className="hairline-b bg-ink-900/30 px-4 sm:px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <HeartPulse className="size-3.5 text-water" aria-hidden />
          <h1 className="font-display text-base font-bold tracking-tight">Data &amp; model health</h1>
          <p className="text-xs text-muted-foreground">
            source freshness · provider state · run log · confidence · endpoint checks
          </p>
          <button
            onClick={refetchAll}
            className="ml-auto micro-label !text-[0.58rem] text-water hover:text-foreground transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className={cn("size-3", (dataQ.isFetching || modelQ.isFetching || healthQ.isFetching) && "animate-spin")} aria-hidden />
            refresh all
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          {dh && (
            <span className="data-mono text-[0.65rem] text-muted-foreground">
              data snapshot <TimeAgo iso={dh.generatedAt} />
            </span>
          )}
          {mh && (
            <span className="data-mono text-[0.65rem] text-muted-foreground">
              model snapshot <TimeAgo iso={mh.generatedAt} />
            </span>
          )}
          {hb && <span className="data-mono text-[0.65rem] text-muted-foreground">{clean(hb.dataLabel)}</span>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 pb-8 space-y-3">
        {/* SECTION A - overall status strip */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Activity className="size-3 text-water" aria-hidden />
              overall status
            </span>
          }
          actions={hb && <ProviderChip provider={hb.ai.provider} model={hb.ai.modelId} />}
        >
          {healthQ.isLoading ? (
            <LoadingRows rows={2} />
          ) : healthQ.isError ? (
            <ErrorNote message={(healthQ.error as Error).message} onRetry={() => healthQ.refetch()} />
          ) : !hb ? null : (
            <div className="space-y-3">
              <div className="flex flex-wrap rounded-sm border border-border/60 overflow-hidden bg-ink-900/40">
                {dh && (
                  <Segment
                    label="data health"
                    value={dh.overall === "OK" ? "OK" : "EMPTY"}
                    tone={dh.overall === "OK" ? "teal" : "amber"}
                  />
                )}
                <Segment
                  label="db"
                  value={
                    hb.db.reachable
                      ? `${hb.db.events} ev · ${hb.db.reports} rep · ${hb.db.observations} obs`
                      : "unreachable"
                  }
                  tone={hb.db.reachable ? "plain" : "red"}
                />
                <Segment label="api latency" value={`${hb.latencyMs} ms`} tone={hb.latencyMs > 5000 ? "amber" : "plain"} />
                <Segment label="provider" value={hb.ai.available ? "available" : "fallback"} tone={hb.ai.available ? "teal" : "amber"} />
                {dh && <Segment label="pilot" value={`${dh.pilot.jurisdictions} juris · ${dh.pilot.groundTruthHotspots} GT sites`} tone="plain" />}
              </div>

              {dh && dh.overall === "EMPTY_DATABASE" ? (
                <div className="rounded-sm border border-sev-moderate/35 bg-sev-moderate/8 px-3 py-2.5 space-y-1.5">
                  <p className="text-xs text-sev-moderate/90 leading-relaxed">{clean(dh.note)}</p>
                  <p className="data-mono text-[0.65rem] text-muted-foreground">
                    POST /api/admin/seed · body {"{ confirm: true }"} · header x-demo-role: ADMIN
                  </p>
                </div>
              ) : (
                dh && <p className="micro-label !text-[0.55rem] text-muted-foreground/70 !tracking-[0.08em] normal-case">{clean(dh.note)}</p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {hb.lastModelRun && (
                  <span className="data-mono text-[0.65rem] text-muted-foreground">
                    last model run: <span className="text-foreground/90">{hb.lastModelRun.modelId}</span> ·{" "}
                    {hb.lastModelRun.status} · {hb.lastModelRun.provider} · <TimeAgo iso={hb.lastModelRun.startedAt} />
                  </span>
                )}
                {hb.ai.fallback && (
                  <span className="micro-label !text-[0.55rem] text-muted-foreground/60" title="Used when the AI provider is unavailable">
                    fallback: {clean(hb.ai.fallback)}
                  </span>
                )}
              </div>
            </div>
          )}
        </Panel>

        {/* SECTION B - source health table */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Database className="size-3 text-water" aria-hidden />
              source health
              {dh && <span className="data-mono ml-1 !text-[0.62rem] !tracking-normal !normal-case text-muted-foreground">{dh.sources.length} sources</span>}
            </span>
          }
          actions={
            <button onClick={() => dataQ.refetch()} className="micro-label !text-[0.58rem] text-water hover:text-foreground transition-colors">
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
            <EmptyState title="No sources reporting" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="micro-label !text-[0.55rem] h-8">source</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8 text-right">records</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8">freshness</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8">status</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8">missingness</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8 hidden md:table-cell">provenance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...dh.sources]
                    .sort((a, b) => (SEVERITY[a.status] ?? 3) - (SEVERITY[b.status] ?? 3) || b.records - a.records)
                    .map((s) => (
                      <TableRow key={s.key} className="hover:bg-ink-850/40">
                        <TableCell className="py-2">
                          <span className="text-xs text-foreground/90">{s.label}</span>
                          <span className="block data-mono text-[0.58rem] text-muted-foreground/60">{s.key}</span>
                        </TableCell>
                        <TableCell className="py-2 text-right data-mono text-[0.72rem] text-foreground">{s.records.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="py-2">
                          {s.lastRecordAt ? (
                            <TimeAgo iso={s.lastRecordAt} />
                          ) : (
                            <span className="data-mono text-[0.65rem] text-muted-foreground/60">never</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2"><SourceStatusBadge status={s.status} /></TableCell>
                        <TableCell className="py-2 max-w-56">
                          {Object.keys(s.missingness).length > 0 ? (
                            <span className="data-mono text-[0.62rem] text-muted-foreground" title={Object.entries(s.missingness).map(([k, v]) => `${k}: ${v}`).join(" · ")}>
                              {Object.entries(s.missingness).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                            </span>
                          ) : (
                            <span className="data-mono text-[0.62rem] text-muted-foreground/60">none</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 hidden md:table-cell">
                          <span className="micro-label !text-[0.52rem] text-muted-foreground/70 !tracking-[0.06em]" title={s.sourceLabel}>
                            {clean(s.sourceLabel)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>

        {/* SECTION C - model & provider */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Cpu className="size-3 text-water" aria-hidden />
              model &amp; provider
            </span>
          }
          actions={
            <button onClick={() => modelQ.refetch()} className="micro-label !text-[0.58rem] text-water hover:text-foreground transition-colors">
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
                <div className="rounded-sm border border-border/60 bg-ink-900/40 px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <ProviderChip provider={mh.provider.provider} model={mh.provider.modelId} />
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 micro-label !text-[0.6rem] font-medium",
                        mh.provider.available
                          ? "text-verified border-verified/30 bg-verified/10"
                          : "text-sev-moderate border-sev-moderate/35 bg-sev-moderate/10"
                      )}
                    >
                      <span aria-hidden className={cn("size-1.5 rounded-full", mh.provider.available ? "bg-verified" : "bg-sev-moderate")} />
                      {mh.provider.available ? "available" : "unavailable"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span className="data-mono text-[0.65rem] text-muted-foreground">
                      model <span className="text-foreground/90">{mh.provider.modelId}</span>
                    </span>
                    <span className="data-mono text-[0.65rem] text-muted-foreground">
                      configured by <span className="text-foreground/90">{mh.provider.configuredBy}</span>
                    </span>
                    <span className="data-mono text-[0.65rem] text-muted-foreground">
                      checked <TimeAgo iso={mh.provider.lastCheckedAt} />
                    </span>
                  </div>
                  {!mh.provider.available && mh.provider.lastError && (
                    <div role="alert" className="flex items-start gap-2.5 rounded-sm border border-sev-moderate/35 bg-sev-moderate/8 px-3 py-2 text-xs">
                      <span className="text-sev-moderate" aria-hidden>⚠</span>
                      <span className="text-sev-moderate/90 leading-relaxed">{mh.provider.lastError}</span>
                    </div>
                  )}
                </div>

                <div className="rounded-sm border border-border/60 bg-ink-900/40 px-3 py-2.5 space-y-1.5">
                  <p className="micro-label !text-[0.55rem] text-muted-foreground mb-1">component versions</p>
                  {Object.entries(mh.versions).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3">
                      <span className="micro-label !text-[0.52rem] text-muted-foreground/80 !tracking-[0.08em]">{k}</span>
                      <span className="data-mono text-[0.68rem] text-foreground/90">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-sm border border-border/60 bg-ink-900/40 px-3 py-2.5">
                <p className="micro-label !text-[0.55rem] text-muted-foreground mb-2">model runs · last 25</p>
                <div className="flex flex-wrap divide-x divide-border/60">
                  <Segment label="total" value={mh.runsSummary.total} tone="plain" border={false} />
                  <Segment label="succeeded" value={mh.runsSummary.succeeded} tone="teal" border={false} />
                  <Segment label="failed" value={mh.runsSummary.failed} tone={mh.runsSummary.failed > 0 ? "red" : "plain"} border={false} />
                  <Segment
                    label="success rate"
                    value={`${(mh.runsSummary.successRate * 100).toFixed(0)}%`}
                    tone={mh.runsSummary.failed > 0 ? "amber" : "teal"}
                    border={false}
                  />
                </div>
              </div>

              <p className="micro-label !text-[0.55rem] text-muted-foreground/70 !tracking-[0.08em] normal-case leading-relaxed">
                {clean(mh.note)}
              </p>
            </div>
          )}
        </Panel>

        {/* SECTION D - model runs table */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <History className="size-3 text-water" aria-hidden />
              model run log
              {mh && <span className="data-mono ml-1 !text-[0.62rem] !tracking-normal !normal-case text-muted-foreground">{Math.min(25, mh.runs.length)} of {mh.runsSummary.total}</span>}
            </span>
          }
          dense
        >
          {modelQ.isLoading ? (
            <LoadingRows rows={6} className="p-4" />
          ) : modelQ.isError ? (
            <ErrorNote message={(modelQ.error as Error).message} onRetry={() => modelQ.refetch()} className="m-4" />
          ) : !mh ? null : mh.runs.length === 0 ? (
            <EmptyState title="No model runs recorded" hint="Runs appear after reports are classified or events reassessed." />
          ) : (
            <ScrollArea className="max-h-96">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="micro-label !text-[0.55rem] h-8">model</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8">provider</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8">status</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8 text-right">in/out</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8 text-right">latency</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8">started</TableHead>
                    <TableHead className="micro-label !text-[0.55rem] h-8 hidden lg:table-cell">notes / error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mh.runs.slice(0, 25).map((r) => (
                    <TableRow key={r.id} className="hover:bg-ink-850/40">
                      <TableCell className="py-2">
                        <span className="data-mono text-[0.68rem] text-foreground/90">{r.modelId}</span>
                        <span className="block data-mono text-[0.55rem] text-muted-foreground/60">{r.version}</span>
                      </TableCell>
                      <TableCell className="py-2 data-mono text-[0.65rem] text-muted-foreground">{r.provider}</TableCell>
                      <TableCell className="py-2"><RunStatusBadge status={r.status} /></TableCell>
                      <TableCell className="py-2 text-right data-mono text-[0.65rem] text-muted-foreground">
                        {r.inputCount}<span className="text-muted-foreground/50">→</span>{r.outputCount}
                      </TableCell>
                      <TableCell className="py-2 text-right data-mono text-[0.65rem] text-muted-foreground">
                        {r.latencyMs != null ? `${r.latencyMs} ms` : "-"}
                      </TableCell>
                      <TableCell className="py-2"><TimeAgo iso={r.startedAt} /></TableCell>
                      <TableCell
                        className={cn("py-2 hidden lg:table-cell max-w-72 truncate text-[0.62rem]", r.error ? "text-sev-critical/90" : "text-muted-foreground/80")}
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

        {/* SECTION E - confidence distribution */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Gauge className="size-3 text-water" aria-hidden />
              classification confidence distribution
            </span>
          }
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
                      labelStyle={{ color: "#93a6ac" }}
                      cursor={{ fill: "rgba(148,180,186,0.06)" }}
                      formatter={(v: number) => [v, "reports"]}
                    />
                    <Bar dataKey="count" radius={[1, 1, 0, 0]} barSize={22}>
                      {mh.confidenceDistribution.buckets.map((b, i) => {
                        const [lo, hi] = clean(b.range).split("-").map(Number);
                        const mid = Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : 1;
                        return <Cell key={i} fill={mid < mh.confidenceDistribution.lowConfidenceFlag ? AMBER : TEAL} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                <span className="flex items-center gap-1.5 micro-label !text-[0.52rem] text-muted-foreground">
                  <span className="size-2 rounded-[1px]" style={{ background: TEAL }} aria-hidden /> at/above flag threshold
                </span>
                <span className="flex items-center gap-1.5 micro-label !text-[0.52rem] text-muted-foreground">
                  <span className="size-2 rounded-[1px]" style={{ background: AMBER }} aria-hidden /> below flag threshold
                </span>
                <span className="data-mono text-[0.65rem] text-muted-foreground ml-auto">
                  mean <span className="text-foreground/90">{mh.confidenceDistribution.mean.toFixed(2)}</span> · min{" "}
                  <span className="text-foreground/90">{mh.confidenceDistribution.min.toFixed(2)}</span> · max{" "}
                  <span className="text-foreground/90">{mh.confidenceDistribution.max.toFixed(2)}</span>
                </span>
              </div>
              <p className="micro-label !text-[0.55rem] text-muted-foreground/70 !tracking-[0.08em] normal-case leading-relaxed">
                Classifications below {mh.confidenceDistribution.lowConfidenceFlag} confidence are flagged for review
                (see confidence chips in the event queue). The 0.4-0.6 bucket straddles the flag threshold, so its
                colouring is indicative only.
              </p>
              <div className="hairline-t pt-2.5 flex flex-wrap items-center gap-2">
                <span className="micro-label !text-[0.55rem] text-muted-foreground">classified reports by provider</span>
                {Object.entries(mh.classificationProviders).map(([k, count]) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <ProviderChip provider={k} />
                    <span className="data-mono text-[0.62rem] text-muted-foreground">×{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* SECTION F - client-side endpoint checks */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Server className="size-3 text-water" aria-hidden />
              api endpoint checks
              <span className="micro-label !text-[0.5rem] text-muted-foreground/60">client-side · same-origin</span>
            </span>
          }
          actions={
            <div className="flex items-center gap-3">
              {lastPingAt != null && (
                <span className="data-mono text-[0.62rem] text-muted-foreground">
                  checked {Math.max(0, Math.round((Date.now() - lastPingAt) / 1000))}s ago
                </span>
              )}
              <button
                onClick={() => runPings()}
                disabled={pinging}
                className="micro-label !text-[0.58rem] text-water hover:text-foreground transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
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
            <ul aria-busy={pinging}>
              {pings.map((p) => (
                <li key={p.path} className="flex items-center gap-3 px-3.5 py-2 hairline-b last:border-0">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full shrink-0",
                      p.status === "ok" ? "bg-verified" : p.status === "err" ? "bg-sev-critical" : "bg-muted-foreground/50 animate-pulse"
                    )}
                  />
                  <span className="data-mono text-[0.7rem] text-foreground/90 flex-1 truncate">{p.path}</span>
                  {p.status === "err" && p.code != null && (
                    <span className="data-mono text-[0.62rem] text-sev-critical/80">HTTP {p.code}</span>
                  )}
                  <span className="data-mono text-[0.68rem] text-muted-foreground w-16 text-right shrink-0">
                    {p.ms != null ? `${p.ms} ms` : "-"}
                  </span>
                  <span
                    className={cn(
                      "micro-label !text-[0.55rem] w-14 text-right shrink-0",
                      p.status === "ok" ? "text-verified" : p.status === "err" ? "text-sev-critical" : "text-muted-foreground"
                    )}
                  >
                    {p.status === "ok" ? "ok" : p.status === "err" ? "error" : "checking"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="micro-label !text-[0.55rem] text-muted-foreground/70 !tracking-[0.08em] normal-case leading-relaxed px-3.5 py-2 hairline-t">
            Latency is measured client-side from this browser session. /api/health probes the AI provider, so its check
            can take several seconds.
          </p>
        </Panel>
      </div>
    </div>
  );
}

// --- local primitives -----------------------------------------------------------

function Segment({ label, value, tone = "plain", border = true }: { label: string; value: string | number; tone?: "plain" | "teal" | "amber" | "red"; border?: boolean }) {
  return (
    <div className={cn("px-3.5 py-2 min-w-fit", border && "border-l border-border/60 first:border-l-0")}>
      <p className="micro-label !text-[0.5rem] text-muted-foreground !tracking-[0.08em]">{label}</p>
      <p
        className={cn(
          "data-mono text-[0.72rem] mt-0.5",
          tone === "teal" ? "text-verified" : tone === "amber" ? "text-sev-moderate" : tone === "red" ? "text-sev-critical" : "text-foreground"
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
      ? { label: "OK", cls: "text-verified border-verified/30 bg-verified/10", dot: "bg-verified" }
      : status === "STALE"
        ? { label: "STALE", cls: "text-sev-moderate border-sev-moderate/35 bg-sev-moderate/10", dot: "bg-sev-moderate" }
        : { label: "EMPTY", cls: "text-slate-300 border-slate-400/25 bg-slate-400/8", dot: "bg-slate-400" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 micro-label !text-[0.6rem] !tracking-[0.1em] font-medium", meta.cls)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const meta =
    status === "SUCCEEDED"
      ? { label: "succeeded", cls: "text-verified border-verified/30 bg-verified/10", dot: "bg-verified" }
      : status === "FAILED"
        ? { label: "failed", cls: "text-sev-critical border-sev-critical/35 bg-sev-critical/12", dot: "bg-sev-critical" }
        : status === "RUNNING"
          ? { label: "running", cls: "text-water border-water/30 bg-water/8", dot: "bg-water" }
          : { label: status.toLowerCase(), cls: "text-slate-300 border-slate-400/25 bg-slate-400/8", dot: "bg-slate-400" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 micro-label !text-[0.6rem] !tracking-[0.08em] font-medium", meta.cls)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
