"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type EventSummary, type JurisdictionResponse } from "@/lib/client/api";
import { navigate } from "@/lib/client/store";
import {
  LoadingRows, ErrorNote, Panel, EmptyState, StatusBadge, RiskBadge, SourceBadge, TimeAgo,
} from "@/components/app/shared/domain";
import { Stagger, StaggerItem, AnimatedProgress } from "@/components/motion/kit";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Network, ChevronRight, ArrowDownWideNarrow, ArrowUpNarrowWide, FileWarning,
  GitBranch, Activity, ShieldAlert,
} from "lucide-react";

// RESPONSIBILITY MODEL - the full chain: Urban Event → Asset → Jurisdiction →
// Agency → Action → Escalation. Cross-agency register, agency workload, chain
// inspector and the static routing-rule reference.

// --- API types -----------------------------------------------------------------------

interface AgencyRow {
  code: string; name: string; kind: string; hotline: string; notes: string; activeEvents: number;
}

interface ChainLevelData {
  level: "EVENT" | "JURISDICTION" | "AGENCY" | "SUPPORT" | "ESCALATION";
  ref: string;
  label: string;
  detail: string;
  asset: { code: string; name: string; kind: string; condition: number } | null;
  status?: string;
  assignedAt?: string;
  hotline?: string | null;
}

interface ResponsibilityResponse {
  event: { id: string; code: string; title: string; status: string; riskBand: string; severity: number };
  jurisdiction: { id: string; code: string; name: string; kind: string; agencyCode: string | null } | null;
  chain: ChainLevelData[];
  actions: {
    id: string; kind: string; instruction: string; priority: string; status: string;
    agencyCode: string | null; assignedTo: string | null; assignedAt: string | null;
    dueAt: string | null; completedAt: string | null; outcome: string | null;
  }[];
  ruleVersion: string;
  groundTruth: { agency: string; note: string } | null;
}

const AGENCY_CODES = ["MCD", "PWD", "NDMC", "DJB", "IFC", "DDMA", "DCP"] as const;

export function ResponsibilityView() {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* header strip */}
      <div className="hairline-b bg-ink-900 px-4 sm:px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="flex items-center gap-2">
            <Network className="size-3.5 text-water" aria-hidden />
            <span className="micro-label !text-[0.62rem] text-slate-600">Responsibility Model</span>
          </span>
          <span className="text-[0.65rem] text-muted-foreground" title="How responsibility is traced from an incident to the agency that must act">
            event → asset → jurisdiction → agency → action → escalation
          </span>
          <span className="micro-label ml-auto !text-[0.5rem] text-muted-foreground/60">
            routing-rules v1.2-demo · synthetic demo dataset
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
        <CrossAgencyRegister />
        <AgencyWorkload />
        <ChainInspector />
        <EscalationMatrix />
      </div>
    </div>
  );
}

// --- Section 1: cross-agency register ---------------------------------------------------

function CrossAgencyRegister() {
  const [agencyFilter, setAgencyFilter] = useState<Set<string>>(new Set());
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [sortDesc, setSortDesc] = useState(true);

  const eventsQ = useQuery({
    queryKey: ["events", 100],
    queryFn: () => apiGet<EventSummary[]>("/api/events?limit=100").then((r) => r.data),
    staleTime: 30_000,
  });
  const jurisQ = useQuery({
    queryKey: ["jurisdictions"],
    queryFn: () => apiGet<JurisdictionResponse[]>("/api/jurisdictions").then((r) => r.data),
    staleTime: 300_000,
  });

  const jurisName = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of jurisQ.data ?? []) m.set(j.id, j.name);
    return m;
  }, [jurisQ.data]);

  const events = eventsQ.data ?? [];

  const filtered = useMemo(() => {
    let list = events;
    if (agencyFilter.size > 0) list = list.filter((e) => e.agencyCode != null && agencyFilter.has(e.agencyCode));
    if (escalatedOnly) list = list.filter((e) => e.riskBand === "CRITICAL" || e.status === "REOPENED");
    return [...list].sort((a, b) => (sortDesc ? b.riskScore - a.riskScore : a.riskScore - b.riskScore));
  }, [events, agencyFilter, escalatedOnly, sortDesc]);

  // events per agency (post-filter stats)
  const perAgency = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered) {
      const k = e.agencyCode ?? "unassigned";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [filtered]);

  const toggleAgency = (code: string) => {
    setAgencyFilter((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <Panel
      title={`Cross-Agency Register · ${filtered.length} Events`}
      icon={<Network />}
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSortDesc((d) => !d)}
          className="h-7 text-[0.62rem] rounded-lg border-border text-slate-600 hover:bg-ink-850"
          aria-label={sortDesc ? "Sort by risk ascending" : "Sort by risk descending"}
        >
          {sortDesc ? <ArrowDownWideNarrow className="size-3" aria-hidden /> : <ArrowUpNarrowWide className="size-3" aria-hidden />}
          risk {sortDesc ? "desc" : "asc"}
        </Button>
      }
    >
      {eventsQ.isLoading ? (
        <LoadingRows rows={6} />
      ) : eventsQ.isError ? (
        <ErrorNote message={(eventsQ.error as Error).message} onRetry={() => eventsQ.refetch()} />
      ) : (
        <>
          {/* filters */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
            <span className="micro-label !text-[0.52rem] text-muted-foreground/70">Agency</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by agency">
              {AGENCY_CODES.map((a) => {
                const on = agencyFilter.has(a);
                return (
                  <button
                    key={a}
                    onClick={() => toggleAgency(a)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-full border micro-label !text-[0.55rem] px-2.5 py-1 transition-colors data-mono !tracking-normal !normal-case font-medium",
                      on
                        ? "bg-blue-50 text-water border-blue-200"
                        : "border-border bg-ink-900 text-slate-500 hover:bg-ink-850 hover:text-slate-700"
                    )}
                  >
                    {a}
                  </button>
                );
              })}
              {agencyFilter.size > 0 && (
                <button onClick={() => setAgencyFilter(new Set())} className="micro-label !text-[0.52rem] text-muted-foreground hover:text-water transition-colors px-1">
                  clear
                </button>
              )}
            </div>
            <span className="flex items-center gap-2">
              <Switch id="escalated-only" checked={escalatedOnly} onCheckedChange={setEscalatedOnly} aria-label="Escalated events only" />
              <label htmlFor="escalated-only" className="micro-label !text-[0.52rem] text-muted-foreground cursor-pointer select-none">
                escalated only (critical or reopened)
              </label>
            </span>
          </div>

          {/* group header stats: events per agency */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3 hairline-t hairline-b py-2">
            <span className="micro-label !text-[0.5rem] text-muted-foreground/60">Events per Agency</span>
            {AGENCY_CODES.filter((a) => perAgency.has(a)).map((a) => (
              <span key={a} className="data-mono text-[0.62rem]">
                <span className="text-water">{a}</span>
                <span className="text-muted-foreground"> {perAgency.get(a)}</span>
              </span>
            ))}
            {perAgency.has("unassigned") && (
              <span className="data-mono text-[0.62rem]">
                <span className="text-muted-foreground">unassigned </span>
                <span className="text-muted-foreground">{perAgency.get("unassigned")}</span>
              </span>
            )}
            {filtered.length === 0 && <span className="text-[0.62rem] text-muted-foreground">no events match</span>}
          </div>

          {/* rows */}
          {filtered.length === 0 ? (
            <EmptyState title="No Events Match the Filters" hint="Turn off the agency chips or the escalated-only switch to see more." />
          ) : (
            <Stagger>
              {filtered.map((e) => (
                <StaggerItem key={e.id} className="hairline-b last:border-0">
                  <button
                    onClick={() => navigate("event", e.code)}
                    className="w-full text-left py-2.5 px-1.5 -mx-1.5 rounded-lg hover:bg-ink-850/50 transition-colors group"
                    aria-label={`${e.code}: ${e.title}`}
                  >
                    {/* line 1: code + badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="data-mono text-[0.68rem] font-semibold text-water group-hover:text-water-dim">{e.code}</span>
                      <RiskBadge band={e.riskBand} score={e.riskScore} />
                      <StatusBadge status={e.status} />
                      <span className="data-mono text-[0.62rem] text-muted-foreground">{e.reportCount} rep</span>
                      <ChevronRight className="size-3.5 text-slate-400 group-hover:text-water ml-auto shrink-0" aria-hidden />
                    </div>
                    {/* line 2: title */}
                    <p className="mt-1 text-[0.78rem] text-slate-700 leading-snug line-clamp-1">{e.title}</p>
                    {/* line 3: jurisdiction + agency */}
                    <div className="mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap">
                      <span className="data-mono text-[0.62rem] text-water">{e.agencyCode ?? "unassigned"}</span>
                      <span className="text-[0.62rem] text-muted-foreground truncate max-w-72">
                        {e.jurisdictionId ? (jurisName.get(e.jurisdictionId) ?? "jurisdiction") : "outside pilot"}
                      </span>
                      {e.groundTruthHotspotId != null && <SourceBadge source="SYNTHETIC_DEMO" />}
                    </div>
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </>
      )}
    </Panel>
  );
}

// --- Section 2: agency workload ---------------------------------------------------------

function AgencyWorkload() {
  const agenciesQ = useQuery({
    queryKey: ["agencies"],
    queryFn: () => apiGet<AgencyRow[]>("/api/agencies").then((r) => r.data),
    staleTime: 60_000,
  });
  const overviewQ = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<{ responseByAgency: { code: string; active: number; verified: number; highRisk: number }[] }>("/api/overview").then((r) => r.data),
    staleTime: 60_000,
  });

  if (agenciesQ.isLoading) {
    return (
      <Panel title="Agency Workload" icon={<Activity />}>
        <LoadingRows rows={7} />
      </Panel>
    );
  }
  if (agenciesQ.isError) {
    return (
      <Panel title="Agency Workload" icon={<Activity />}>
        <ErrorNote message={(agenciesQ.error as Error).message} onRetry={() => agenciesQ.refetch()} />
      </Panel>
    );
  }

  const agencies = agenciesQ.data ?? [];
  const stats = new Map((overviewQ.data?.responseByAgency ?? []).map((a) => [a.code, a]));
  const maxLoad = Math.max(1, ...agencies.map((a) => a.activeEvents));

  return (
    <Panel
      title={`Agency Workload · ${agencies.length} Agencies`}
      icon={<Activity />}
      actions={overviewQ.isError ? <span className="micro-label !text-[0.5rem] text-sev-moderate">verified counts unavailable</span> : undefined}
    >
      <Stagger className="space-y-2.5">
        {agencies.map((a) => {
          const s = stats.get(a.code);
          const verified = s?.verified ?? 0;
          return (
            <StaggerItem key={a.code}>
              <div className="rounded-lg border border-border bg-slate-50 px-3 py-2.5">
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <span className="data-mono text-xs font-semibold text-water w-10 shrink-0">{a.code}</span>
                  <span className="text-xs text-slate-700 flex-1 min-w-40 truncate" title={a.name}>{a.name}</span>
                  <span className="micro-label !text-[0.5rem] text-muted-foreground/70">{a.kind.toLowerCase()}</span>
                  <a
                    href={`tel:${a.hotline.replace(/[^+\d]/g, "")}`}
                    className="data-mono text-[0.62rem] text-water hover:text-water-dim transition-colors"
                    title={`call ${a.code} hotline`}
                  >
                    {a.hotline}
                  </a>
                </div>
                <p className="mt-1 text-[0.65rem] text-muted-foreground leading-snug">{a.notes}</p>
                <div className="mt-2 flex items-center gap-2.5">
                  <span
                    className="flex-1"
                    role="img"
                    aria-label={`${a.code}: ${a.activeEvents} active links, ${verified} verified or closed events as primary agency`}
                  >
                    <AnimatedProgress value={a.activeEvents} max={maxLoad} fillClassName="bg-water-dim" />
                  </span>
                  <span className="data-mono text-[0.62rem] text-slate-900">{a.activeEvents}<span className="text-muted-foreground"> links</span></span>
                  <span className="data-mono text-[0.62rem] text-verified">{verified}<span className="text-muted-foreground"> ver</span></span>
                </div>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>
      <p className="mt-3 micro-label !text-[0.5rem] text-muted-foreground/60">
        Links: open incidents involving this agency (any role) · bar length is relative to the busiest agency · ver: incidents verified or closed where the agency is the lead
      </p>
    </Panel>
  );
}

// --- Section 3: chain inspector ---------------------------------------------------------

function ChainInspector() {
  const [selected, setSelected] = useState<string>("");

  const eventsQ = useQuery({
    queryKey: ["events", 100],
    queryFn: () => apiGet<EventSummary[]>("/api/events?limit=100").then((r) => r.data),
    staleTime: 30_000,
  });

  const respQ = useQuery({
    queryKey: ["responsibility", selected],
    queryFn: () => apiGet<ResponsibilityResponse>(`/api/events/${selected}/responsibility`).then((r) => r.data),
    enabled: selected !== "",
    staleTime: 120_000,
  });

  const events = eventsQ.data ?? [];

  return (
    <Panel
      title="Chain Inspector"
      icon={<GitBranch />}
      actions={respQ.data ? <span className="micro-label !text-[0.5rem] text-muted-foreground/70">{respQ.data.ruleVersion}</span> : undefined}
    >
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div className="w-full sm:w-80 space-y-1">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-9 bg-ink-900 border-border text-xs" aria-label="Pick an event">
              <SelectValue placeholder="pick an event to inspect its chain" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {events.map((e) => (
                <SelectItem key={e.id} value={e.code} className="text-xs">
                  <span className="data-mono text-water mr-1.5">{e.code}</span>
                  <span className="truncate">{e.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {respQ.data && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("event", respQ.data!.event.code)}
            className="h-8 text-[0.62rem] rounded-lg border-border text-slate-600 hover:bg-ink-850"
          >
            open dossier <ChevronRight className="size-3" aria-hidden />
          </Button>
        )}
      </div>

      {eventsQ.isLoading ? (
        <LoadingRows rows={4} />
      ) : !selected ? (
        <EmptyState
          icon={<FileWarning className="size-7" />}
          title="No Event Selected"
          hint="Pick an incident to see who is responsible, what actions exist and why anything was escalated."
        />
      ) : respQ.isLoading ? (
        <LoadingRows rows={6} />
      ) : respQ.isError ? (
        <ErrorNote message={(respQ.error as Error).message} onRetry={() => respQ.refetch()} />
      ) : respQ.data ? (
        <>
          {/* chain stepper */}
          <Stagger>
            {respQ.data.chain.map((c, i) => (
              <ChainStep key={`${c.level}-${c.ref}-${i}`} step={c} last={i === respQ.data!.chain.length - 1} />
            ))}
          </Stagger>

          {respQ.data.groundTruth && (
            <p className="mt-3 text-[0.65rem] text-sev-moderate">
              Routing evaluation note: seeded ground-truth responsible agency{" "}
              <span className="data-mono">{respQ.data.groundTruth.agency}</span> (synthetic, for routing evaluation).
            </p>
          )}

          {/* actions */}
          <div className="mt-4 hairline-t pt-3">
            <p className="micro-label !text-[0.55rem] mb-2">Action Items · {respQ.data.actions.length}</p>
            {respQ.data.actions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No action items recorded for this event.</p>
            ) : (
              <ul className="space-y-2">
                {respQ.data.actions.map((a) => (
                  <li key={a.id} className="rounded-lg border border-border bg-slate-50 p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="data-mono text-[0.62rem] font-semibold text-water">{a.kind.replace(/_/g, " ").toLowerCase()}</span>
                      <span className={cn("micro-label !text-[0.5rem]", a.priority === "URGENT" ? "text-sev-critical" : a.priority === "HIGH" ? "text-sev-high" : "text-muted-foreground")}>
                        {a.priority.toLowerCase()}
                      </span>
                      <span className={cn("micro-label !text-[0.5rem]", a.status === "COMPLETED" ? "text-verified" : a.status === "FAILED" ? "text-sev-critical" : "text-water")}>
                        {a.status.toLowerCase().replace(/_/g, " ")}
                      </span>
                      <span className="ml-auto data-mono text-[0.62rem] text-muted-foreground">
                        {a.agencyCode ?? "n/a"}{a.assignedTo ? ` · ${a.assignedTo}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.78rem] text-slate-700">{a.instruction}</p>
                    {a.outcome && <p className="mt-1 text-xs text-verified">Outcome: {a.outcome}</p>}
                    {a.dueAt && <p className="mt-1 text-[0.62rem] text-muted-foreground">due <TimeAgo iso={a.dueAt} /></p>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2.5 text-[0.6rem] text-muted-foreground/70">
              Updates and field checks happen inside the event dossier. This inspector is read-only.
            </p>
          </div>
        </>
      ) : null}
    </Panel>
  );
}

function ChainStep({ step, last }: { step: ChainLevelData; last?: boolean }) {
  const c = step;
  return (
    <StaggerItem className="relative pl-5 pb-3.5 last:pb-0">
      <span
        className={cn(
          "absolute left-0 top-1 size-2.5 rounded-full ring-4",
          c.level === "ESCALATION"
            ? "bg-sev-critical ring-red-100"
            : c.level === "SUPPORT"
              ? "bg-sev-moderate ring-amber-100"
              : c.level === "AGENCY"
                ? "bg-water ring-blue-100"
                : "bg-slate-400 ring-slate-100"
        )}
        aria-hidden
      />
      {!last && <span className="absolute left-[4px] top-4 bottom-0 w-px bg-border" aria-hidden />}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="micro-label !text-[0.5rem]">{c.level.toLowerCase()}</span>
        <span className="data-mono text-xs font-semibold text-slate-900">{c.ref}</span>
        {c.status && <span className="micro-label !text-[0.46rem] text-muted-foreground/70">{c.status.toLowerCase()}</span>}
        {c.hotline && (
          <a href={`tel:${c.hotline.replace(/[^+\d]/g, "")}`} className="data-mono text-[0.6rem] text-water hover:text-water-dim transition-colors">
            {c.hotline}
          </a>
        )}
        {c.assignedAt && <TimeAgo iso={c.assignedAt} />}
      </div>
      <p className="text-xs text-slate-700 mt-0.5 leading-snug">{c.label}</p>
      {c.detail && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{c.detail}</p>}
      {c.asset && (
        <p className="text-[0.65rem] text-muted-foreground/80 mt-0.5">
          asset: <span className="data-mono text-water">{c.asset.code}</span> · {c.asset.name} ·{" "}
          {c.asset.kind.toLowerCase().replace(/_/g, " ")} · condition {c.asset.condition}
        </p>
      )}
    </StaggerItem>
  );
}

// --- Section 4: escalation matrix (static reference) -------------------------------------

const ROUTING_RULES: { trigger: string; route: string; note: string }[] = [
  { trigger: "Underpass involved", route: "PWD / asset owner", note: "pumping and structural response is primary" },
  { trigger: "Pump station within 250m", route: "owner agency", note: "pumping response is primary" },
  { trigger: "Drain within 200m", route: "drain agency", note: "IFC trunk drains, MCD/NDMC small drains" },
  { trigger: "Sewer backup reported", route: "DJB", note: "sewer network ownership" },
  { trigger: "Jurisdiction default", route: "civic body", note: "MCD or NDMC by jurisdiction administration" },
  { trigger: "Risk band CRITICAL", route: "DDMA escalation", note: "cross-agency coordination required" },
  { trigger: "Severity 4 or above", route: "DCP support", note: "traffic diversion and barricading" },
];

function EscalationMatrix() {
  return (
    <Panel
      title="Escalation Matrix · Routing Reference"
      icon={<ShieldAlert />}
      actions={<span className="micro-label !text-[0.5rem] text-muted-foreground/70">routing-rules v1.2-demo</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="hairline-b">
              <th scope="col" className="micro-label !text-[0.52rem] py-2 pr-4 font-medium">Trigger</th>
              <th scope="col" className="micro-label !text-[0.52rem] py-2 pr-4 font-medium">Routes to</th>
              <th scope="col" className="micro-label !text-[0.52rem] py-2 font-medium hidden md:table-cell">Note</th>
            </tr>
          </thead>
          <tbody>
            {ROUTING_RULES.map((r) => (
              <tr key={r.trigger} className="hairline-b last:border-0">
                <td className="py-2.5 pr-4 text-[0.78rem] text-slate-700 leading-snug align-top">{r.trigger}</td>
                <td className="py-2.5 pr-4 align-top">
                  <span className="data-mono text-[0.68rem] font-medium text-water">{r.route}</span>
                  <span className="md:hidden block text-[0.65rem] text-muted-foreground leading-snug mt-0.5">{r.note}</span>
                </td>
                <td className="py-2.5 text-[0.65rem] text-muted-foreground leading-snug hidden md:table-cell align-top">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 micro-label !text-[0.5rem] text-muted-foreground/60">
        A fixed reference showing how the system picks the lead, support and escalation agencies. Each event's live chain is shown in the Chain Inspector above.
      </p>
    </Panel>
  );
}
