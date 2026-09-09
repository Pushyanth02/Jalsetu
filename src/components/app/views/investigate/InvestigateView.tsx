"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { apiGet, apiPost, ApiClientError, type EventSummary } from "@/lib/client/api";
import { navigate } from "@/lib/client/store";
import {
  LoadingRows, ErrorNote, Panel, EmptyState, RiskBadge, RiskMeter, TimeAgo,
  ConfidenceChip, ProviderChip, SourceBadge,
} from "@/components/app/shared/domain";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Sparkles, GitMerge, Gauge, Search, ChevronRight, Radio } from "lucide-react";

// AI INVESTIGATION - three structured assistance tools (classification,
// duplicate clustering, risk assessment) with honest provenance and honest
// fallback reporting. Structured output only; no chain-of-thought is ever
// requested, returned, or displayed.

// --- API types -----------------------------------------------------------------------

interface ReportRow {
  id: string; publicRef: string; description: string; category: string; severityReported: string;
  lat: number; lng: number; addressText: string | null; submittedAt: string; channel: string;
  status: string; isDuplicate: boolean; urbanEventId: string | null; source: string;
  classificationProvider: string | null; classificationModel: string | null; classificationConfidence: number | null;
  classification: { provider: string; modelId: string | null; confidence: number | null } | null;
}

interface ProviderHealthInfo {
  provider: string; modelId: string; available: boolean;
  lastCheckedAt: string | null; lastError: string | null; configuredBy: string;
}

interface ClassifyResponse {
  classification: {
    category: string; severity: string; confidence: number;
    isDuplicateSuspected: boolean; duplicateReason?: string;
    factors: string[]; summary: string;
  };
  provenance: {
    provider: string; modelId: string; latencyMs: number;
    fallbackUsed: boolean; fallbackReason: string | null;
    providerHealth: ProviderHealthInfo; version: string;
  };
  context: {
    rainfall24hMm: number | null; rainfall72hMm: number | null;
    nearestStation: { code: string; name: string; distanceM: number } | null;
    historicalIncidentsNearby: number;
    nearestAssets: { code: string; kind: string; distanceM: number; condition: number | null }[];
    nearbyOpenEvents: number;
  };
  duplicateSignals: { code: string; distanceM: number; hoursApart: number; recurrence: boolean; reason: string }[];
}

interface ClusterResponse {
  clusters: {
    id: string; centroid: { lat: number; lng: number }; size: number; spatialDiameterM: number;
    members: {
      id: string; lat: number; lng: number; publicRef: string; category: string;
      severityReported: string; description: string; submittedAt: string; urbanEventId: string | null;
    }[];
  }[];
  singletons: number;
}

interface RiskResponse {
  event: { id: string; code: string; title: string };
  risk: {
    score: number; band: string; modelVersion: string; computedAt: string;
    factors: { key: string; label: string; value: number; weight: number; contribution: number; raw: string }[];
  };
  advisory: {
    output: {
      narrative: string;
      factors?: { key: string; label: string; direction: string; weight: number }[];
      recommendedInvestigation?: string;
    };
    provider: string; modelId: string; fallbackUsed: boolean; error: string | null;
  };
  provenance: { riskModelVersion: string; advisoryProviderHealth: ProviderHealthInfo };
}

type ToolId = "classify" | "cluster" | "risk";

type ClassifyVars = { reportId?: string; reportRef?: string; description?: string; severityReported?: string; lat?: number; lng?: number };
type ClassifyMutation = UseMutationResult<ClassifyResponse & { _label: string }, Error, ClassifyVars>;
type ClusterMutation = UseMutationResult<{ data: ClusterResponse; meta: Record<string, unknown>; radius: number }, Error, number>;
type RiskMutation = UseMutationResult<RiskResponse, Error, string>;

const TOOLS: { id: ToolId; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "classify", label: "Classification", hint: "categorise + severity + duplicate suspicion", icon: Sparkles },
  { id: "cluster", label: "Duplicate clustering", hint: "proximity clusters over the last 72h", icon: GitMerge },
  { id: "risk", label: "Risk assessment", hint: "factor model + structured AI advisory", icon: Gauge },
];

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const RADII = [100, 150, 200, 300] as const;

export function InvestigateView() {
  const [tool, setTool] = useState<ToolId>("classify");
  const { toast } = useToast();
  const qc = useQueryClient();

  const healthQ = useQuery({
    queryKey: ["ai-health"],
    queryFn: () => apiGet<{ ai: ProviderHealthInfo }>("/api/health").then((r) => r.data.ai),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  // freshest health wins: compare the run-time probe vs the polled snapshot
  const [toolHealth, setToolHealth] = useState<ProviderHealthInfo | null>(null);
  const health = useMemo(() => {
    if (toolHealth && healthQ.data) {
      const tRun = toolHealth.lastCheckedAt ? Date.parse(toolHealth.lastCheckedAt) : 0;
      const tPolled = healthQ.data.lastCheckedAt ? Date.parse(healthQ.data.lastCheckedAt) : 0;
      return tRun >= tPolled ? toolHealth : healthQ.data;
    }
    return toolHealth ?? healthQ.data ?? null;
  }, [toolHealth, healthQ.data]);

  // --- Tool A: classification (stored report or ad-hoc text) ---
  const classify = useMutation({
    mutationFn: (vars: ClassifyVars) =>
      apiPost<ClassifyResponse>("/api/ai/classify", {
        reportId: vars.reportId,
        description: vars.description,
        severityReported: vars.severityReported,
        lat: vars.lat,
        lng: vars.lng,
      }, "ANALYST").then((r) => ({ ...r.data, _label: vars.reportRef ?? "ad-hoc text" })),
    onSuccess: (d) => {
      setToolHealth(d.provenance.providerHealth);
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast({
        title: "Classification complete",
        description: `${d.classification.category.toLowerCase()} · severity ${d.classification.severity.toLowerCase()} · provider ${d.provenance.provider}${d.provenance.fallbackUsed ? " (fallback)" : ""}.`,
      });
    },
    onError: (e) => toast({ title: "Classification failed", description: (e as ApiClientError).message, variant: "destructive" }),
  });

  // --- Tool B: duplicate clustering ---
  const [radius, setRadius] = useState<number>(150);
  const cluster = useMutation({
    mutationFn: (rm: number) =>
      apiPost<ClusterResponse>("/api/ai/cluster", { radiusM: rm }, "ANALYST").then((r) => ({ data: r.data, meta: r.meta ?? {}, radius: rm })),
    onSuccess: (d) => {
      toast({
        title: "Clustering complete",
        description: `${d.data.clusters.length} clusters, ${d.data.singletons} singletons across ${String(d.meta.evaluated ?? "?")} reports (last 72h).`,
      });
    },
    onError: (e) => toast({ title: "Clustering failed", description: (e as ApiClientError).message, variant: "destructive" }),
  });

  // --- Tool C: risk assessment ---
  const risk = useMutation({
    mutationFn: (eventId: string) => apiPost<RiskResponse>("/api/ai/risk", { eventId }, "ANALYST").then((r) => r.data),
    onSuccess: (d) => {
      setToolHealth(d.provenance.advisoryProviderHealth);
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast({
        title: "Risk assessed",
        description: `Score ${d.risk.score} (${d.risk.band.toLowerCase()}). Advisory provider: ${d.advisory.provider}${d.advisory.fallbackUsed ? " (fallback)" : ""}.`,
      });
    },
    onError: (e) => toast({ title: "Risk assessment failed", description: (e as ApiClientError).message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* provider health summary strip */}
      <div className="hairline-b bg-ink-900/30 px-4 sm:px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-2 shrink-0">
            <Radio className="size-3.5 text-water" aria-hidden />
            <span className="micro-label !text-[0.62rem] text-foreground/80">ai investigation</span>
          </span>
          {health ? (
            <>
              <ProviderChip provider={health.provider} model={health.modelId} />
              <span className={cn("micro-label !text-[0.52rem] flex items-center gap-1.5", health.available ? "text-verified" : "text-sev-high")}>
                <span aria-hidden className={cn("size-1.5 rounded-full", health.available ? "bg-verified" : "bg-sev-high")} />
                {health.available ? "available" : "unavailable"}
              </span>
              <span className="micro-label !text-[0.52rem] text-muted-foreground/70 flex items-center gap-1.5">
                configured by {health.configuredBy.toLowerCase()}
                {health.lastCheckedAt && <>· probed <TimeAgo iso={health.lastCheckedAt} /></>}
              </span>
              {health.lastError && (
                <span className="text-[0.62rem] text-sev-moderate" role="note" title={health.lastError}>
                  last error: {health.lastError}
                </span>
              )}
            </>
          ) : healthQ.isLoading ? (
            <span className="micro-label !text-[0.52rem] text-muted-foreground/60">probing provider…</span>
          ) : (
            <span className="micro-label !text-[0.52rem] text-sev-critical">provider health unavailable</span>
          )}
          <span className="micro-label ml-auto !text-[0.5rem] text-muted-foreground/60 hidden sm:inline">
            structured output only · no chain-of-thought exposed
          </span>
        </div>
      </div>

      {/* tool grid: selector + inputs (left) | results (right) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[350px_1fr]">
        <aside className="lg:hairline-r bg-ink-900/20 flex flex-col min-h-0 border-b lg:border-b-0">
          {/* tool selector */}
          <div className="grid grid-cols-3 lg:grid-cols-1 hairline-b shrink-0">
            {TOOLS.map((t) => {
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  aria-pressed={active}
                  className={cn(
                    "text-left px-3.5 py-2.5 lg:py-3 transition-colors hairline-r last:border-r-0 lg:hairline-b lg:border-r-0",
                    active ? "bg-water/8" : "hover:bg-ink-850/60"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <t.icon className={cn("size-3.5 shrink-0", active ? "text-water" : "text-muted-foreground")} aria-hidden />
                    <span className={cn("micro-label !text-[0.58rem]", active ? "text-water" : "text-foreground/70")}>{t.label}</span>
                  </span>
                  <span className="hidden lg:block mt-0.5 text-[0.62rem] text-muted-foreground/80 leading-snug pl-5.5">{t.hint}</span>
                </button>
              );
            })}
          </div>

          {/* per-tool input area */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {tool === "classify" && <ClassifyInput classify={classify} />}
            {tool === "cluster" && <ClusterInput cluster={cluster} radius={radius} setRadius={setRadius} />}
            {tool === "risk" && <RiskInput risk={risk} />}
          </div>
        </aside>

        {/* results column */}
        <div className="min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
          {tool === "classify" && <ClassifyResults m={classify} />}
          {tool === "cluster" && <ClusterResults m={cluster} />}
          {tool === "risk" && <RiskResults m={risk} />}
        </div>
      </div>
    </div>
  );
}

// --- Tool A: classification ------------------------------------------------------------

function ClassifyInput({ classify }: { classify: ClassifyMutation }) {
  const [mode, setMode] = useState<"queue" | "adhoc">("queue");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<string>("MEDIUM");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const pending = classify.isPending;
  const descOk = description.trim().length >= 12;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const coordsOk = (lat.trim() === "" || Number.isFinite(latNum)) && (lng.trim() === "" || Number.isFinite(lngNum));

  return (
    <div className="p-3.5 space-y-3">
      {/* mode toggle */}
      <div className="flex rounded-sm border border-border/70 overflow-hidden" role="tablist" aria-label="Classification input mode">
        {(["queue", "adhoc"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 micro-label !text-[0.55rem] py-1.5 transition-colors",
              mode === m ? "bg-water/12 text-water" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "queue" ? "report queue" : "ad-hoc text"}
          </button>
        ))}
      </div>

      {mode === "queue" ? (
        <ReportQueue pending={pending} onClassify={(r) => classify.mutate({ reportId: r.id, reportRef: r.publicRef })} />
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="adhoc-desc" className="text-xs">Description</Label>
            <Textarea
              id="adhoc-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. knee-deep water under the railway bridge, autos stalled, drain overflowing"
              className="bg-ink-900 border-border text-xs leading-relaxed"
              maxLength={600}
            />
            <p className="text-[0.6rem] text-muted-foreground/70">min 12 characters · no personal identifiers</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[0.65rem]">Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="h-8 bg-ink-900 border-border text-xs" aria-label="Reported severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s.toLowerCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="adhoc-lat" className="text-[0.65rem]">Lat (opt)</Label>
              <Input id="adhoc-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="28.6129" className="h-8 bg-ink-900 border-border text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adhoc-lng" className="text-[0.65rem]">Lng (opt)</Label>
              <Input id="adhoc-lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="77.2295" className="h-8 bg-ink-900 border-border text-xs font-mono" />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pending || !descOk || !coordsOk}
            onClick={() =>
              classify.mutate({
                description: description.trim(),
                severityReported: severity,
                lat: lat.trim() && Number.isFinite(latNum) ? latNum : undefined,
                lng: lng.trim() && Number.isFinite(lngNum) ? lngNum : undefined,
              })
            }
            className="w-full bg-water text-ink-950 hover:bg-water/85"
          >
            <Sparkles className={cn("size-3.5", pending && "animate-pulse")} aria-hidden />
            {pending ? "Classifying…" : "Classify text"}
          </Button>
          <p className="text-[0.6rem] text-muted-foreground/70 leading-relaxed">
            Delhi bounds: lat 28.3 to 28.9, lng 76.8 to 77.6. Coordinates outside Delhi are rejected by validation.
          </p>
        </div>
      )}

      {classify.isError && (
        <p className="micro-label !text-[0.52rem] text-sev-critical/90" role="alert">
          last run failed: {classify.error.message}
        </p>
      )}
    </div>
  );
}

function ReportQueue({ pending, onClassify }: { pending: boolean; onClassify: (r: ReportRow) => void }) {
  const reportsQ = useQuery({
    queryKey: ["reports", 50],
    queryFn: () => apiGet<ReportRow[]>("/api/reports?limit=50").then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (reportsQ.isLoading) return <LoadingRows rows={6} />;
  if (reportsQ.isError) return <ErrorNote message={(reportsQ.error as Error).message} onRetry={() => reportsQ.refetch()} />;

  const reports = reportsQ.data ?? [];
  if (reports.length === 0)
    return <EmptyState title="No reports in the queue" hint="Citizen reports appear here as they arrive." />;

  return (
    <div>
      <p className="micro-label !text-[0.52rem] text-muted-foreground/70 mb-2">
        recent reports · newest first · {reports.length}
      </p>
      <ul>
        {reports.map((r) => (
          <li key={r.id} className="hairline-b last:border-0 py-2.5 first:pt-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="data-mono text-[0.65rem] font-semibold text-water/90">{r.publicRef}</span>
              <span className="micro-label !text-[0.5rem]">{r.channel.toLowerCase()}</span>
              <span className={cn("micro-label !text-[0.5rem]", sevTone(r.severityReported))}>{r.severityReported.toLowerCase()}</span>
              {r.isDuplicate && <span className="micro-label !text-[0.5rem] text-sev-moderate/80">merged</span>}
              <TimeAgo iso={r.submittedAt} />
            </div>
            <p className="mt-0.5 text-[0.72rem] text-foreground/85 leading-snug line-clamp-2">{r.description}</p>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <SourceBadge source={r.source} />
              {r.classification && <ProviderChip provider={r.classification.provider} model={r.classification.modelId} />}
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onClassify(r)}
                className="ml-auto h-7 text-[0.65rem] border-water/40 text-water hover:bg-water/10 hover:text-water"
              >
                <Sparkles className="size-3" aria-hidden />
                {r.classification ? "Re-run" : "Classify"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClassifyResults({ m }: { m: ClassifyMutation }) {
  if (m.isPending) {
    return (
      <Panel title="classification · result">
        <LoadingRows rows={5} />
        <p className="micro-label !text-[0.52rem] text-muted-foreground/60 mt-2">
          running provider call for {m.variables?.reportRef ?? "ad-hoc text"}…
        </p>
      </Panel>
    );
  }
  if (m.isError) {
    return (
      <Panel title="classification · result">
        <ErrorNote
          message={(m.error as Error).message}
          onRetry={m.variables ? () => m.mutate(m.variables!) : undefined}
        />
      </Panel>
    );
  }
  if (!m.data) {
    return (
      <Panel title="classification · result">
        <EmptyState
          icon={<Sparkles className="size-7" />}
          title="No classification run yet"
          hint="Pick a report from the queue, or switch to ad-hoc text mode, then run the classifier."
        />
      </Panel>
    );
  }

  const r = m.data;
  const cl = r.classification;
  const prov = r.provenance;

  return (
    <>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-3 text-water" aria-hidden />
            classification · {r._label}
          </span>
        }
        actions={<ProviderChip provider={prov.provider} model={prov.modelId} />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <Readout label="category" value={cl.category.toLowerCase().replace(/_/g, " ")} />
          <Readout label="severity" value={cl.severity.toLowerCase()} tone={sevTone(cl.severity)} />
          <Readout label="confidence" value={<ConfidenceChip confidence={cl.confidence} />} />
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed border-l-2 border-water/50 pl-3">{cl.summary}</p>
        {cl.factors.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {cl.factors.map((f, i) => (
              <li key={i} className="rounded-sm border border-border/70 bg-ink-850/50 px-2 py-0.5 text-[0.65rem] text-muted-foreground">{f}</li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          {cl.isDuplicateSuspected ? (
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-sev-moderate/35 bg-sev-moderate/10 px-2 py-0.5 text-[0.65rem] text-sev-moderate">
              <GitMerge className="size-3" aria-hidden /> duplicate suspected
              {cl.duplicateReason ? `: ${cl.duplicateReason}` : ""}
            </span>
          ) : (
            <span className="micro-label !text-[0.52rem] text-muted-foreground">no duplicate suspected by model</span>
          )}
        </div>
        <p className="mt-3 micro-label !text-[0.5rem] text-muted-foreground/60">
          Structured output only. No chain-of-thought exposed.
        </p>
      </Panel>

      {/* provenance */}
      <Panel title="provenance">
        <div className="space-y-2.5">
          <FactRow label="provider"><ProviderChip provider={prov.provider} model={prov.modelId} /></FactRow>
          <FactRow label="model id"><span className="data-mono text-[0.62rem] break-all">{prov.modelId}</span></FactRow>
          <FactRow label="version"><span className="data-mono text-[0.62rem]">{prov.version}</span></FactRow>
          <FactRow label="latency"><span className="data-mono text-[0.62rem]">{prov.latencyMs} ms</span></FactRow>
          <FactRow label="fallback">
            <span className={cn("micro-label !text-[0.55rem]", prov.fallbackUsed ? "text-sev-moderate" : "text-verified")}>
              {prov.fallbackUsed ? "used" : "not used"}
            </span>
          </FactRow>
          {prov.fallbackUsed && prov.fallbackReason && (
            <p className="rounded-sm border border-sev-moderate/30 bg-sev-moderate/8 px-2.5 py-1.5 text-xs text-sev-moderate/90" role="alert">
              GLM call failed, deterministic fallback used: {prov.fallbackReason}
            </p>
          )}
          <div className="hairline-t pt-2.5 space-y-2">
            <p className="micro-label !text-[0.5rem] text-muted-foreground/60">provider health at run time</p>
            <FactRow label="status">
              <span className={cn("micro-label !text-[0.55rem] flex items-center gap-1.5", prov.providerHealth.available ? "text-verified" : "text-sev-high")}>
                <span aria-hidden className={cn("size-1.5 rounded-full", prov.providerHealth.available ? "bg-verified" : "bg-sev-high")} />
                {prov.providerHealth.provider} {prov.providerHealth.available ? "available" : "unavailable"}
              </span>
            </FactRow>
            {prov.providerHealth.lastError && (
              <p className="text-[0.65rem] text-sev-moderate/90 break-words" title={prov.providerHealth.lastError}>
                last error: {prov.providerHealth.lastError}
              </p>
            )}
          </div>
        </div>
      </Panel>

      {/* context */}
      <Panel title="evidence context · fed to the model">
        <dl className="space-y-2 text-xs">
          <FactRow label="rainfall 24h / 72h">
            <span className="data-mono text-water">{Math.round(r.context.rainfall24hMm ?? 0)} / {Math.round(r.context.rainfall72hMm ?? 0)} mm</span>
          </FactRow>
          {r.context.nearestStation && (
            <FactRow label="nearest gauge">
              <span className="data-mono text-[0.62rem]">{r.context.nearestStation.name} · {(r.context.nearestStation.distanceM / 1000).toFixed(1)}km</span>
            </FactRow>
          )}
          <FactRow label="historical incidents"><span className="data-mono text-[0.62rem]">{r.context.historicalIncidentsNearby} within 200m</span></FactRow>
          <FactRow label="nearby open events"><span className="data-mono text-[0.62rem]">{r.context.nearbyOpenEvents} within 150m / 48h</span></FactRow>
        </dl>
        {r.context.nearestAssets.length > 0 && (
          <div className="mt-3 hairline-t pt-2.5">
            <p className="micro-label !text-[0.5rem] text-muted-foreground/60 mb-1.5">nearest assets</p>
            <ul className="space-y-1.5">
              {r.context.nearestAssets.map((a) => (
                <li key={a.code} className="flex items-baseline gap-2.5 text-xs">
                  <span className="data-mono text-[0.62rem] text-muted-foreground w-12 shrink-0">{Math.round(a.distanceM)}m</span>
                  <span className="data-mono text-[0.62rem] text-water/90">{a.code}</span>
                  <span className="flex-1 truncate">{a.kind.toLowerCase().replace(/_/g, " ")} · condition {a.condition ?? "n/a"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {/* duplicate signals */}
      <Panel title="duplicate signals · engine candidates">
        {r.duplicateSignals.length === 0 ? (
          <EmptyState title="No duplicate candidates" hint="No events within 150m active in the last 48h." />
        ) : (
          <ul className="space-y-2">
            {r.duplicateSignals.map((d, i) => (
              <li key={i} className="flex items-baseline gap-2.5 text-xs flex-wrap">
                <button onClick={() => navigate("event", d.code)} className="data-mono text-[0.65rem] font-semibold text-water hover:text-foreground transition-colors">
                  {d.code}
                </button>
                <span className="data-mono text-[0.62rem] text-muted-foreground">{Math.round(d.distanceM)}m · {d.hoursApart.toFixed(1)}h apart</span>
                {d.recurrence && <span className="micro-label !text-[0.5rem] text-sev-high">recurrence</span>}
                <span className="flex-1 min-w-40 text-muted-foreground">{d.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

// --- Tool B: duplicate clustering -------------------------------------------------------

function ClusterInput({ cluster, radius, setRadius }: { cluster: ClusterMutation; radius: number; setRadius: (n: number) => void }) {
  return (
    <div className="p-3.5 space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Cluster radius (m)</Label>
        <div className="grid grid-cols-4 gap-1" role="group" aria-label="Cluster radius in metres">
          {RADII.map((rm) => (
            <button
              key={rm}
              onClick={() => setRadius(rm)}
              aria-pressed={radius === rm}
              className={cn(
                "rounded-sm border micro-label !text-[0.58rem] py-1.5 transition-colors data-mono !tracking-normal !normal-case",
                radius === rm ? "border-water/40 bg-water/12 text-water" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {rm}
            </button>
          ))}
        </div>
      </div>
      <Button size="sm" disabled={cluster.isPending} onClick={() => cluster.mutate(radius)} className="w-full bg-water text-ink-950 hover:bg-water/85">
        <GitMerge className={cn("size-3.5", cluster.isPending && "animate-pulse")} aria-hidden />
        {cluster.isPending ? "Clustering…" : "Run clustering"}
      </Button>
      <p className="text-[0.6rem] text-muted-foreground/70 leading-relaxed">
        Evaluates all reports from the last 72 hours. Deterministic union-find method with no model call: identical inputs always produce identical clusters.
      </p>
      {cluster.isError && (
        <p className="micro-label !text-[0.52rem] text-sev-critical/90" role="alert">
          last run failed: {cluster.error.message}
        </p>
      )}
    </div>
  );
}

function ClusterResults({ m }: { m: ClusterMutation }) {
  if (m.isPending) {
    return (
      <Panel title="duplicate clustering · result">
        <LoadingRows rows={5} />
        <p className="micro-label !text-[0.52rem] text-muted-foreground/60 mt-2">union-find over last-72h reports…</p>
      </Panel>
    );
  }
  if (m.isError) {
    return (
      <Panel title="duplicate clustering · result">
        <ErrorNote message={(m.error as Error).message} onRetry={() => m.mutate(m.variables ?? 150)} />
      </Panel>
    );
  }
  if (!m.data) {
    return (
      <Panel title="duplicate clustering · result">
        <EmptyState
          icon={<GitMerge className="size-7" />}
          title="No clustering run yet"
          hint="Pick a radius and run the clustering to group nearby reports from the last 72 hours."
        />
      </Panel>
    );
  }

  const { data, meta, radius } = m.data;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <GitMerge className="size-3 text-water" aria-hidden />
          duplicate clusters · {data.clusters.length}
        </span>
      }
      actions={
        <span className="data-mono text-[0.62rem] text-muted-foreground">
          {data.singletons} singletons · {String(meta.evaluated ?? "?")} evaluated
        </span>
      }
    >
      <p className="micro-label !text-[0.5rem] text-muted-foreground/70 mb-3">
        {String(meta.method ?? `union-find proximity clustering, radius ${radius}m`)} · {String(meta.version ?? "cluster-1.1-demo")}
      </p>
      {data.clusters.length === 0 ? (
        <EmptyState title="No multi-report clusters found" hint="All reports in the 72h window are singletons at this radius." />
      ) : (
        <div className="space-y-3">
          {data.clusters.map((c) => (
            <div key={c.id} className="rounded-sm border border-border/60 bg-ink-850/30">
              <div className="flex items-center gap-2.5 flex-wrap px-3 py-2 hairline-b">
                <span className="data-mono text-[0.65rem] font-semibold text-water">{c.id}</span>
                <span className="data-mono text-[0.62rem] text-muted-foreground">
                  {c.size} reports · spread {c.spatialDiameterM}m
                </span>
                <span className="ml-auto data-mono text-[0.6rem] text-muted-foreground hidden sm:inline" title="cluster centroid">
                  {c.centroid.lat.toFixed(4)}, {c.centroid.lng.toFixed(4)}
                </span>
              </div>
              <ul>
                {c.members.map((mem) => (
                  <li key={mem.id} className="px-3 py-2 hairline-b last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="data-mono text-[0.62rem] text-foreground/90">{mem.publicRef}</span>
                      <span className={cn("micro-label !text-[0.5rem]", sevTone(mem.severityReported))}>{mem.severityReported.toLowerCase()}</span>
                      <span className="micro-label !text-[0.5rem] text-muted-foreground/70">{mem.category.toLowerCase().replace(/_/g, " ")}</span>
                      <TimeAgo iso={mem.submittedAt} />
                      {mem.urbanEventId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate("event", mem.urbanEventId!)}
                          className="ml-auto h-6 text-[0.6rem] px-2 border-water/40 text-water hover:bg-water/10 hover:text-water"
                        >
                          linked event <ChevronRight className="size-3" aria-hidden />
                        </Button>
                      )}
                    </div>
                    <p className="mt-0.5 text-[0.68rem] text-muted-foreground leading-snug line-clamp-1" title={mem.description}>{mem.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// --- Tool C: risk assessment -----------------------------------------------------------

function RiskInput({ risk }: { risk: RiskMutation }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const eventsQ = useQuery({
    queryKey: ["events", 100],
    queryFn: () => apiGet<EventSummary[]>("/api/events?limit=100").then((r) => r.data),
    staleTime: 30_000,
  });

  const events = eventsQ.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? events.filter((e) => e.code.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
    : events;
  const selectedEvent = events.find((e) => e.id === selected) ?? null;

  return (
    <div className="p-3.5 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="risk-search" className="text-xs">Event</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden />
          <Input
            id="risk-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search code or title · e.g. UE-2026"
            className="h-8 pl-8 bg-ink-900 border-border text-xs"
          />
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-sm border border-border/60">
        {eventsQ.isLoading ? (
          <LoadingRows rows={5} className="p-2" />
        ) : eventsQ.isError ? (
          <div className="p-2"><ErrorNote message={(eventsQ.error as Error).message} onRetry={() => eventsQ.refetch()} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No events match" hint="Try a different code or title fragment." />
        ) : (
          <ul>
            {filtered.slice(0, 40).map((e) => {
              const active = selectedEvent?.id === e.id;
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setSelected(e.id)}
                    aria-pressed={active}
                    className={cn("w-full text-left px-2.5 py-2 transition-colors hover:bg-ink-850/60", active && "bg-water/8")}
                  >
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className={cn("data-mono text-[0.62rem] font-semibold", active ? "text-water" : "text-water/80")}>{e.code}</span>
                      <RiskBadge band={e.riskBand} score={e.riskScore} />
                      <span className="micro-label !text-[0.5rem] text-muted-foreground/70">{e.reportCount} rep</span>
                    </span>
                    <span className="block mt-0.5 text-[0.68rem] text-muted-foreground leading-snug line-clamp-1">{e.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedEvent && (
        <div className="rounded-sm border border-border/60 bg-ink-850/30 px-2.5 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="data-mono text-[0.65rem] font-semibold text-water">{selectedEvent.code}</span>
            <RiskBadge band={selectedEvent.riskBand} score={selectedEvent.riskScore} />
            <span className="micro-label !text-[0.5rem] text-muted-foreground">{selectedEvent.reportCount} reports</span>
          </div>
          <p className="mt-0.5 text-[0.68rem] text-muted-foreground line-clamp-1">{selectedEvent.title}</p>
        </div>
      )}

      <Button
        size="sm"
        disabled={!selectedEvent || risk.isPending}
        onClick={() => selectedEvent && risk.mutate(selectedEvent.id)}
        className="w-full bg-water text-ink-950 hover:bg-water/85"
      >
        <Gauge className={cn("size-3.5", risk.isPending && "animate-pulse")} aria-hidden />
        {risk.isPending ? "Assessing…" : "Assess risk"}
      </Button>
      <p className="text-[0.6rem] text-muted-foreground/70 leading-relaxed">
        Runs the transparent 7-factor risk engine and requests a structured AI advisory. The assessment is persisted to the event dossier.
      </p>
      {risk.isError && (
        <p className="micro-label !text-[0.52rem] text-sev-critical/90" role="alert">
          last run failed: {risk.error.message}
        </p>
      )}
    </div>
  );
}

function RiskResults({ m }: { m: RiskMutation }) {
  if (m.isPending) {
    return (
      <Panel title="risk assessment · result">
        <LoadingRows rows={5} />
        <p className="micro-label !text-[0.52rem] text-muted-foreground/60 mt-2">computing factors + advisory…</p>
      </Panel>
    );
  }
  if (m.isError) {
    return (
      <Panel title="risk assessment · result">
        <ErrorNote
          message={(m.error as Error).message}
          onRetry={m.variables ? () => m.mutate(m.variables!) : undefined}
        />
      </Panel>
    );
  }
  if (!m.data) {
    return (
      <Panel title="risk assessment · result">
        <EmptyState
          icon={<Gauge className="size-7" />}
          title="No risk assessment run yet"
          hint="Search for an event, select it, then run the assessment."
        />
      </Panel>
    );
  }

  const r = m.data;
  const factors = r.risk.factors ?? [];

  return (
    <>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Gauge className="size-3 text-water" aria-hidden />
            risk assessment · {r.event.code}
          </span>
        }
        actions={<span className="micro-label !text-[0.5rem] text-muted-foreground/70">{r.risk.modelVersion}</span>}
      >
        <div className="flex items-center gap-4 flex-wrap mb-4">
          <RiskMeter score={r.risk.score} band={r.risk.band} />
          {r.risk.computedAt && <span className="text-[0.65rem] text-muted-foreground">computed <TimeAgo iso={r.risk.computedAt} /></span>}
        </div>
        <div className="space-y-2.5 max-w-2xl">
          {factors.map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <span className="w-36 sm:w-44 shrink-0 text-xs text-foreground/90 truncate" title={f.label}>{f.label}</span>
              <div className="flex-1 h-2 rounded-full bg-ink-800 overflow-hidden" role="img" aria-label={`${f.label}: contribution ${f.contribution} of 100`}>
                <div
                  className={cn("h-full rounded-full transition-[width] duration-500", f.contribution > 12 ? "bg-sev-high" : f.contribution > 7 ? "bg-sev-moderate" : "bg-water/70")}
                  style={{ width: `${Math.min(100, (f.contribution / 20) * 100)}%` }}
                />
              </div>
              <span className="data-mono text-[0.65rem] w-10 text-right text-foreground">{f.contribution.toFixed(1)}</span>
              <span className="data-mono text-[0.6rem] w-20 text-right text-muted-foreground hidden sm:block" title={`raw: ${f.raw}`}>{f.raw}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.68rem] text-muted-foreground">
          Score = Σ(factor value × weight) × 100. Every factor, weight and contribution is returned by the engine: no black boxes.
        </p>
      </Panel>

      <Panel
        title="ai advisory · structured output"
        actions={<ProviderChip provider={r.advisory.provider} model={r.advisory.modelId} />}
      >
        {r.advisory.fallbackUsed && r.advisory.error && (
          <p className="mb-3 rounded-sm border border-sev-moderate/30 bg-sev-moderate/8 px-2.5 py-1.5 text-xs text-sev-moderate/90" role="alert">
            GLM call failed, deterministic fallback used: {r.advisory.error}
          </p>
        )}
        <p className="text-sm text-foreground/90 leading-relaxed border-l-2 border-water/50 pl-3">{r.advisory.output.narrative}</p>
        {r.advisory.output.factors && r.advisory.output.factors.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {r.advisory.output.factors.map((f, i) => (
              <li
                key={i}
                title={`${f.key} · weight ${f.weight.toFixed(2)}`}
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 text-[0.62rem]",
                  f.direction === "AGGRAVATES" ? "border-sev-high/30 text-sev-high/90 bg-sev-high/6" : "border-verified/30 text-verified/90 bg-verified/6"
                )}
              >
                {f.direction === "AGGRAVATES" ? "▲" : "▼"} {f.label} · w {f.weight.toFixed(2)}
              </li>
            ))}
          </ul>
        )}
        {r.advisory.output.recommendedInvestigation && (
          <p className="mt-3 text-xs text-water/90">
            <span className="micro-label !text-[0.55rem] mr-1.5">recommended</span>{" "}
            {r.advisory.output.recommendedInvestigation}
          </p>
        )}
        <p className="mt-3 micro-label !text-[0.5rem] text-muted-foreground/60">
          Structured output only. No chain-of-thought exposed.
        </p>
      </Panel>

      <Panel title="provenance">
        <dl className="space-y-2 text-xs">
          <FactRow label="risk engine"><span className="data-mono text-[0.62rem]">{r.provenance.riskModelVersion}</span></FactRow>
          <FactRow label="advisory provider"><ProviderChip provider={r.advisory.provider} model={r.advisory.modelId} /></FactRow>
          <FactRow label="fallback">
            <span className={cn("micro-label !text-[0.55rem]", r.advisory.fallbackUsed ? "text-sev-moderate" : "text-verified")}>
              {r.advisory.fallbackUsed ? "used" : "not used"}
            </span>
          </FactRow>
          <FactRow label="event">
            <button onClick={() => navigate("event", r.event.code)} className="data-mono text-[0.62rem] text-water hover:text-foreground transition-colors">
              {r.event.code} →
            </button>
          </FactRow>
        </dl>
      </Panel>
    </>
  );
}

// --- shared small helpers --------------------------------------------------------------

function Readout({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-sm border border-border/60 bg-ink-850/30 px-3 py-2">
      <p className="micro-label !text-[0.5rem]">{label}</p>
      <div className={cn("data-mono text-sm mt-0.5", tone ?? "text-foreground")}>{value}</div>
    </div>
  );
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="micro-label !text-[0.55rem]">{label}</dt>
      <dd className="flex items-center text-right">{children}</dd>
    </div>
  );
}

function sevTone(s: string): string {
  return s === "CRITICAL" ? "text-sev-critical" : s === "HIGH" ? "text-sev-high" : s === "MEDIUM" || s === "MODERATE" ? "text-sev-moderate" : "text-muted-foreground";
}
