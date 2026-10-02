"use client";

import { useUi, navigate } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type OverviewResponse, type WeatherResponse, type EventSummary } from "@/lib/client/api";
import { useMapData, MapWithOverlays } from "@/components/app/map/MapView";
import { Panel, StatusBadge, RiskBadge, SeverityTicks, TimeAgo, EmptyState, ConfidenceChip, SourceBadge, timeAgo } from "@/components/app/shared/domain";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { AlertTriangle, ChevronRight, Umbrella, CheckCircle2, Layers, Radio, Droplets, TrendingUp, TrendingDown, Minus, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CountUp, SpotlightCard, Stagger, StaggerItem, Reveal, PulseDot, HoverLift } from "@/components/motion/kit";
import { useState } from "react";
import { assetPath } from "@/lib/client/assets";

// COMMAND CENTER - replicates the reference design: KPI stat cards, live
// operations map with floating layers panel, recent reports + operational
// alerts rail. Every number is real pilot data; every panel shows provenance.

export function CommandCenterView() {
  const overviewQ = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview").then((r) => r.data),
    refetchInterval: 45_000,
  });
  const weatherQ = useQuery({
    queryKey: ["weather", 72],
    queryFn: () => apiGet<WeatherResponse>("/api/weather?hours=72").then((r) => r.data),
    refetchInterval: 120_000,
  });
  const { eventsQ, hotspotsQ, jurisdictionsQ, assetsQ } = useMapData();

  // unfiltered events for KPI trends (last 24h vs prior 24h, real computed)
  const allEventsQ = useQuery({
    queryKey: ["events", "kpi", "200"],
    queryFn: () => apiGet<EventSummary[]>("/api/events?limit=200").then((r) => r.data),
    refetchInterval: 60_000,
  });

  const d = overviewQ.data;
  const err = overviewQ.error as Error | null;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* page header */}
      <div className="hairline-b bg-ink-900">
        <div className="px-4 sm:px-6 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 leading-tight">Command Center</h1>
            <p className="text-[0.7rem] text-muted-foreground mt-0.5">
              One shared screen for every agency handling waterlogging · live pilot view
              {d && <span className="data-mono ml-1.5 text-slate-400">updated {timeAgo(d.generatedAt)}</span>}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 pl-2.5 pr-3 py-1">
              <PulseDot color="bg-emerald-500" size={7} />
              <span className="text-[0.65rem] font-semibold text-emerald-700">Live Data</span>
              <span className="data-mono text-[0.6rem] text-emerald-600/70">demo mode</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 micro-label text-[0.58rem]! text-water">
              <Radio className="size-3" aria-hidden /> 3 pilot jurisdictions
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-5">
          {/* KPI stat cards */}
          {d ? (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4">
              <KpiCard
                label="Active Waterlogging Events"
                value={d.counts.activeEvents}
                delta={eventDelta(allEventsQ.data)}
                icon={<Droplets className="size-5" aria-hidden />}
                tint="bg-blue-50 text-water"
                to="map"
                hint="Total incidents currently active in the pilot window"
              />
              <KpiCard
                label="High Risk Hotspots"
                value={d.counts.highRisk}
                delta={bandDelta(allEventsQ.data, "HIGH")}
                icon={<AlertTriangle className="size-5" aria-hidden />}
                tint="bg-red-50 text-sev-critical"
                to="map"
                filterRisk="HIGH"
                hint="Rated High Risk or Critical on the 0-100 risk scale"
              />
              <KpiCard
                label="Unresolved Events"
                value={d.counts.unresolved}
                delta={bandDelta(allEventsQ.data, "UNRESOLVED")}
                icon={<ClipboardCheck className="size-5" aria-hidden />}
                tint="bg-amber-50 text-sev-moderate"
                to="verify"
                hint="Spotted or sorted, but no crew assigned yet"
              />
              <KpiCard
                label="Under Verification"
                value={d.counts.inField}
                delta={null}
                icon={<CheckCircle2 className="size-5" aria-hidden />}
                tint="bg-emerald-50 text-verified"
                to="verify"
                hint="A crew has been assigned or is already on site"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {err ? (
                <div className="col-span-full"><ErrorNoteInline message={err.message} onRetry={() => overviewQ.refetch()} /></div>
              ) : (
                Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-xl shimmer" />)
              )}
            </div>
          )}

          {/* main grid: map + right rail */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.62fr_1fr] gap-4 sm:gap-5 items-start">
            {/* left column: map + rainfall */}
            <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
              <Reveal className="relative rounded-xl overflow-hidden border border-border shadow-sm h-[52dvh] xl:h-[60dvh]">
                {eventsQ.isLoading ? (
                  <div className="absolute inset-0 grid place-items-center bg-ink-900">
                    <div className="w-40 space-y-2.5">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 rounded-lg shimmer" />)}</div>
                  </div>
                ) : eventsQ.isError ? (
                  <div className="m-4"><ErrorNoteInline message={(eventsQ.error as Error).message} onRetry={() => eventsQ.refetch()} /></div>
                ) : (
                  <MapWithOverlays
                    events={eventsQ.data ?? []}
                    weather={weatherQ.data}
                    hotspots={hotspotsQ.data}
                    jurisdictions={jurisdictionsQ.data}
                    assets={assetsQ.data}
                    compact
                  />
                )}
                <LayersPanel />
                <DemoModeBadge />
              </Reveal>

              <RainfallStrip weatherQ={weatherQ} nearest={d?.rainfall.nearestStation ?? null} />
            </div>

            {/* right column: recent reports + alerts + response */}
            <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
              <RecentReportsPanel />
              <OperationalAlertsPanel />

              {d && (
                <Panel title="Response by Agency" icon={<Radio />} dense className="overflow-hidden">
                  <ul>
                    {d.responseByAgency.map((a) => (
                      <li key={a.code} className="flex items-center gap-3 px-4 py-2.5 hairline-b last:border-0 hover:bg-ink-850/60 transition-colors">
                        <span className="data-mono text-xs font-semibold text-water w-10 shrink-0">{a.code}</span>
                        <span className="text-xs text-slate-600 flex-1 truncate">{a.name}</span>
                        <span className="data-mono text-[0.65rem] text-slate-500" title="Active events right now">{a.active}<span className="text-slate-400"> act</span></span>
                        <span className="data-mono text-[0.65rem] text-verified flex items-center gap-1" title="Verified or closed events">
                          <CheckCircle2 className="size-3" aria-hidden />{a.verified}
                        </span>
                        {a.highRisk > 0 && <span className="data-mono text-[0.65rem] text-sev-high" title="High-risk events">{a.highRisk} hi</span>}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>
          </div>

          {/* active event queue */}
          <ActiveEventQueue eventsQ={eventsQ} total={d?.events.length} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- KPI cards */

function KpiCard({ label, value, delta, icon, tint, to, filterRisk, hint }: {
  label: string;
  value: number;
  delta: number | null;
  icon: React.ReactNode;
  tint: string;
  to: "map" | "verify";
  filterRisk?: string;
  hint: string;
}) {
  const setFilters = useUi((s) => s.setFilters);
  const reduce = useReducedMotion();
  return (
    <HoverLift>
      <SpotlightCard className="rounded-xl">
        <button
          onClick={() => {
            if (filterRisk) setFilters({ riskBand: filterRisk as "HIGH" });
            navigate(to);
          }}
          title={hint}
          className="w-full text-left p-4 sm:p-5 panel rounded-xl card-hover"
        >
          <span className="flex items-start justify-between gap-3">
            <span className={cn("grid size-10 place-items-center rounded-lg shrink-0", tint)}>{icon}</span>
            {delta !== null && <DeltaPill delta={delta} />}
          </span>
          <motion.span
            className="block mt-3 font-display text-3xl sm:text-[2.1rem] font-bold tabular-nums text-slate-900 leading-none"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <CountUp value={value} />
          </motion.span>
          <span className="block mt-1.5 text-[0.72rem] font-medium text-slate-500 leading-snug">{label}</span>
        </button>
      </SpotlightCard>
    </HoverLift>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold",
        flat ? "bg-slate-100 text-slate-500" : up ? "bg-red-50 text-sev-critical" : "bg-emerald-50 text-verified"
      )}
      title="Change in new incidents over the last 24 hours compared with the day before (computed from pilot data)"
    >
      {flat ? <Minus className="size-3" aria-hidden /> : up ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
      {delta > 0 ? "+" : ""}{delta}%
    </span>
  );
}

function eventDelta(events?: EventSummary[]): number | null {
  if (!events?.length) return null;
  const now = Date.now();
  const day = 86_400_000;
  const recent = events.filter((e) => new Date(e.firstReportedAt).getTime() > now - day).length;
  const prior = events.filter((e) => {
    const t = new Date(e.firstReportedAt).getTime();
    return t <= now - day && t > now - 2 * day;
  }).length;
  if (prior === 0) return recent === 0 ? 0 : 100;
  return Math.round(((recent - prior) / prior) * 100);
}

function bandDelta(events: EventSummary[] | undefined, kind: "HIGH" | "UNRESOLVED"): number | null {
  if (!events?.length) return null;
  const now = Date.now();
  const day = 86_400_000;
  const inBand = (e: EventSummary) => (kind === "HIGH" ? e.riskBand === "HIGH" || e.riskBand === "CRITICAL" : e.status === "DETECTED" || e.status === "TRIAGED");
  const recent = events.filter((e) => inBand(e) && new Date(e.firstReportedAt).getTime() > now - day).length;
  const prior = events.filter((e) => inBand(e) && new Date(e.firstReportedAt).getTime() <= now - day && new Date(e.firstReportedAt).getTime() > now - 2 * day).length;
  if (prior === 0) return recent === 0 ? 0 : 100;
  return Math.round(((recent - prior) / prior) * 100);
}

/* -------------------------------------------------------- layers + badges */

/** Floating map layers panel (top-left) - functional layer toggles. */
function LayersPanel() {
  const [open, setOpen] = useState(true);
  const layers = useUi((s) => s.layers);
  const toggleLayer = useUi((s) => s.toggleLayer);
  const labels: { key: keyof typeof layers; label: string }[] = [
    { key: "events", label: "Waterlogging Events" },
    { key: "hotspots", label: "Risk Hotspots" },
    { key: "rainfall", label: "Rainfall Gauges" },
    { key: "assets", label: "Drainage Network" },
    { key: "jurisdictions", label: "Jurisdiction Boundaries" },
    { key: "groundTruth", label: "Ground Truth (Research)" },
  ];
  return (
    <div className="absolute z-20 top-3 left-3">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="panel rounded-xl p-3 w-56"
            role="group"
            aria-label="Map layers"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="micro-label text-[0.56rem]! text-slate-500 flex items-center gap-1.5">
                <Layers className="size-3" aria-hidden /> Layers
              </p>
              <button onClick={() => setOpen(false)} className="micro-label text-[0.55rem]! text-slate-400 hover:text-slate-600" aria-label="Hide layers panel">
                hide
              </button>
            </div>
            <ul className="space-y-1">
              {labels.map(({ key, label }) => (
                <li key={key}>
                  <label className="flex items-center gap-2.5 px-1.5 py-1 rounded-md hover:bg-ink-850 cursor-pointer text-[0.72rem] text-slate-600 font-medium">
                    <input
                      type="checkbox"
                      checked={layers[key]}
                      onChange={() => toggleLayer(key)}
                      className="size-3.5 rounded accent-blue-600"
                    />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : (
          <motion.button
            key="chip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(true)}
            className="panel rounded-lg px-2.5 py-1.5 micro-label text-[0.58rem]! text-slate-600 flex items-center gap-1.5"
            aria-label="Show layers panel"
          >
            <Layers className="size-3" aria-hidden /> layers
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Bottom-right live demo badge (honest labelling, always visible). */
function DemoModeBadge() {
  return (
    <div className="absolute z-20 bottom-7.5 right-3 pointer-events-none">
      <span className="inline-flex items-center gap-2 rounded-full bg-sb-900/90 backdrop-blur px-3 py-1.5 shadow-lg">
        <PulseDot color="bg-emerald-400" size={7} />
        <span className="text-[0.62rem] font-semibold text-white/90">Live Data</span>
        <span className="data-mono text-[0.58rem] text-amber-300/90">demo mode</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------- recent reports */

interface ReportRow {
  id: string;
  publicRef: string;
  description: string;
  category: string;
  severityReported: string;
  lat: number;
  lng: number;
  addressText?: string | null;
  submittedAt: string;
  channel: string;
  status?: string;
  isDuplicate?: boolean;
  urbanEventId?: string | null;
  source: string;
  classificationConfidence?: number;
}

function getReportThumbnail(category: string, description: string): { webp: string; png: string; label: string } {
  const desc = description.toLowerCase();
  if (category === "POTHOLE" || desc.includes("pothole") || desc.includes("crater") || desc.includes("broken road")) {
    return {
      webp: assetPath("/img/pothole.webp"),
      png: assetPath("/img/pothole.png"),
      label: "pothole water accumulation",
    };
  }
  if (category === "DRAIN_OVERFLOW" || desc.includes("drain") || desc.includes("overflow") || desc.includes("nalah") || desc.includes("nala")) {
    return {
      webp: assetPath("/img/drain-overflow.webp"),
      png: assetPath("/img/drain-overflow.png"),
      label: "overflowing storm drain",
    };
  }
  if (category === "SEWER_BACKUP" || desc.includes("sewer") || desc.includes("manhole") || desc.includes("backup")) {
    return {
      webp: assetPath("/img/sewer-backup.webp"),
      png: assetPath("/img/sewer-backup.png"),
      label: "sewer manhole overflow",
    };
  }
  if (category === "UNDERPASS" || desc.includes("underpass") || desc.includes("subway") || desc.includes("ito") || desc.includes("minto")) {
    return {
      webp: assetPath("/img/ito-underpass.webp"),
      png: assetPath("/img/ito-underpass.png"),
      label: "flooded underpass",
    };
  }
  return {
    webp: assetPath("/img/street-flood.webp"),
    png: assetPath("/img/street-flood.png"),
    label: "waterlogged street",
  };
}

function RecentReportsPanel() {
  const openEvent = useUi((s) => s.openEvent);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reports", "recent", "6"],
    queryFn: () => apiGet<ReportRow[]>("/api/reports?limit=6").then((r) => r.data),
    refetchInterval: 60_000,
  });

  return (
    <Panel
      title="Recent Reports"
      icon={<Droplets />}
      actions={
        <button onClick={() => navigate("report")} className="micro-label text-[0.58rem]! text-water hover:text-water-dim transition-colors">
          view all →
        </button>
      }
      dense
      className="overflow-hidden"
    >
      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex gap-3"><div className="h-11 w-14 rounded-lg shimmer" /><div className="flex-1 space-y-1.5"><div className="h-3 rounded shimmer" /><div className="h-3 w-2/3 rounded shimmer" /></div></div>)}
        </div>
      ) : error ? (
        <div className="p-4"><ErrorNoteInline message={(error as Error).message} onRetry={() => refetch()} /></div>
      ) : data && data.length > 0 ? (
        <>
          <ul>
            <Stagger>
              {data.slice(0, 5).map((r) => {
                const thumb = getReportThumbnail(r.category, r.description);
                return (
                  <StaggerItem key={r.id}>
                    <li className="hairline-b last:border-0">
                      <button
                        onClick={() => (r.urbanEventId ? openEvent(r.urbanEventId) : navigate("report"))}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-850/70 transition-colors group"
                        aria-label={`Report ${r.publicRef}`}
                      >
                        <div className="relative h-11 w-14 rounded-lg overflow-hidden shrink-0 ring-1 ring-border bg-slate-200">
                          <picture>
                            <source srcSet={thumb.webp} type="image/webp" />
                            <img
                              src={thumb.png}
                              alt={`${r.publicRef} report thumbnail: ${thumb.label} (illustrative)`}
                              width={56}
                              height={44}
                              className="size-full object-cover"
                              loading="lazy"
                              decoding="async"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </picture>
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="data-mono text-[0.68rem] font-semibold text-water">{r.publicRef}</span>
                            <SeverityPill severity={r.severityReported} />
                            {r.isDuplicate && <span className="micro-label text-[0.55rem]! text-slate-400">merged</span>}
                          </span>
                          <span className="mt-0.5 block text-[0.76rem] text-slate-600 leading-snug line-clamp-1">{r.description}</span>
                          <span className="mt-1 flex items-center gap-2 text-[0.62rem] text-slate-400">
                            <span className="data-mono">{r.channel.toLowerCase()}</span>
                            <TimeAgo iso={r.submittedAt} />
                          </span>
                        </span>
                        <ChevronRight className="size-4 text-slate-400 group-hover:text-water shrink-0 transition-colors" aria-hidden />
                      </button>
                    </li>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </ul>
          <p className="hairline-t px-4 py-2 micro-label text-[0.52rem]! text-muted-foreground/70">
            thumbnails are illustrative · report photos never faked
          </p>
        </>
      ) : (
        <EmptyState title="No Reports Yet" hint="Citizen submissions will appear here as they arrive." />
      )}
    </Panel>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const cls =
    severity === "CRITICAL" ? "bg-red-50 text-red-700 border-red-200"
    : severity === "HIGH" ? "bg-orange-50 text-orange-700 border-orange-200"
    : severity === "MEDIUM" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return <span className={cn("inline-flex rounded-full border px-1.5 py-0.5 micro-label text-[0.55rem]!", cls)}>{severity.toLowerCase()}</span>;
}

/* ---------------------------------------------------- operational alerts */

function OperationalAlertsPanel() {
  const overviewQ = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview").then((r) => r.data),
    refetchInterval: 45_000,
  });
  const d = overviewQ.data;
  const err = overviewQ.error as Error | null;

  return (
    <Panel
      title="Operational Alerts"
      icon={<AlertTriangle />}
      actions={<span className="micro-label text-[0.55rem]! text-muted-foreground">{d ? `${d.alerts.length} active` : ""}</span>}
      dense
      className="overflow-hidden"
    >
      {err ? (
        <div className="p-4"><ErrorNoteInline message={err.message} onRetry={() => overviewQ.refetch()} /></div>
      ) : d ? (
        d.alerts.length === 0 ? (
          <EmptyState title="No Active Alerts" hint="Alerts appear here for critical risk, slow responses, or repeat flooding." />
        ) : (
          <ul>
            {d.alerts.map((a, i) => (
              <li key={i} className="hairline-b last:border-0">
                <button
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-ink-850/70 transition-colors group",
                    i === 0 && "animate-in fade-in slide-in-from-bottom-1 duration-300"
                  )}
                  onClick={() => a.eventCode && navigate("event", a.eventCode)}
                >
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-full shrink-0 mt-0.5",
                      a.severity === "CRITICAL" ? "bg-red-100 text-sev-critical" : a.severity === "HIGH" ? "bg-orange-100 text-sev-high" : "bg-amber-100 text-sev-moderate"
                    )}
                    aria-hidden
                  >
                    <AlertTriangle className="size-3.5" />
                  </span>
                  <span className="text-[0.78rem] leading-relaxed text-slate-700 flex-1">{a.message}</span>
                  {a.eventCode && <ChevronRight className="size-4 text-slate-400 group-hover:text-water shrink-0 mt-0.5" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-9 rounded-lg shimmer" />)}</div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------- event queue */

function ActiveEventQueue({ eventsQ, total }: { eventsQ: { data?: EventSummary[]; isLoading: boolean; error: unknown; refetch: () => void }; total?: number }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Active Event Queue
          {total != null && <span className="data-mono ml-1 text-[0.65rem] font-normal text-slate-400">{total}</span>}
        </span>
      }
      icon={<Radio />}
      actions={
        <button onClick={() => navigate("map")} className="micro-label text-[0.58rem]! text-water hover:text-water-dim transition-colors">
          open map →
        </button>
      }
      dense
      className="overflow-hidden"
    >
      {eventsQ.isLoading ? (
        <div className="p-4 space-y-2.5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-lg shimmer" />)}</div>
      ) : eventsQ.error ? (
        <div className="p-4"><ErrorNoteInline message={(eventsQ.error as Error).message} onRetry={() => eventsQ.refetch()} /></div>
      ) : eventsQ.data && eventsQ.data.length > 0 ? (
        <ul className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3">
          {eventsQ.data.slice(0, 18).map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      ) : (
        <EmptyState title="No Events Match Current Filters" hint="Try widening the filters on the Map view." />
      )}
    </Panel>
  );
}

export function EventRow({ event }: { event: EventSummary }) {
  const openEvent = useUi((s) => s.openEvent);
  return (
    <li className="hairline-r hairline-b last:border-0">
      <button
        onClick={() => openEvent(event.code)}
        className="w-full text-left px-4 py-3 hover:bg-ink-850/70 transition-colors group focus:bg-ink-850"
        aria-label={`${event.code}: ${event.title}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="data-mono text-[0.68rem] font-semibold text-water group-hover:text-water-dim">{event.code}</span>
          <StatusBadge status={event.status} />
          <RiskBadge band={event.riskBand} score={event.riskScore} />
          {event.recurrenceCount > 0 && (
            <span className="micro-label text-[0.55rem]! text-sev-high" title={`recurred ${event.recurrenceCount}×`}>
              ↻{event.recurrenceCount}
            </span>
          )}
          <TimeAgo iso={event.lastActivityAt} />
        </div>
        <p className="mt-1 text-[0.8rem] text-slate-700 leading-snug line-clamp-1">{event.title}</p>
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          <SeverityTicks severity={event.severity} />
          <span className="data-mono text-[0.62rem] text-slate-400">{event.reportCount} rep</span>
          <span className="data-mono text-[0.62rem] text-slate-400">{event.agencyCode ?? "-"}</span>
          <ConfidenceChip confidence={event.confidence} note={event.confidenceNote} />
        </div>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------ rainfall */

function RainfallStrip({ weatherQ, nearest }: { weatherQ: { data?: WeatherResponse; isLoading: boolean; error: unknown; refetch: () => void }; nearest: OverviewResponse["rainfall"]["nearestStation"] }) {
  const w = weatherQ.data;
  const series = rainfallSeries(w);
  return (
    <Panel
      title="Rainfall Context · Synthetic Gauges"
      icon={<Umbrella />}
      actions={
        nearest && (
          <span className="micro-label text-[0.55rem]! text-slate-400">
            nearest: {nearest.name} · {(nearest.distanceM / 1000).toFixed(1)}km
          </span>
        )
      }
      bodyClassName="pt-3 pb-2"
    >
      {weatherQ.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-8 rounded-lg shimmer" />)}</div>
      ) : w ? (
        <>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} />
                <YAxis width={28} tick={{ fill: "#7a88b8", fontSize: 9, fontFamily: "var(--font-plex-mono)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0c142b", border: "1px solid #24406b", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-plex-mono)", color: "#e9eeff", boxShadow: "0 8px 24px -8px rgba(0,0,0,0.9)" }}
                  labelStyle={{ color: "#8794c2" }}
                  itemStyle={{ color: "#2dd4bf" }}
                  formatter={(v: number) => [`${v} mm`, "avg 3h rain"]}
                />
                <Area type="monotone" dataKey="mm" stroke="#2dd4bf" strokeWidth={1.8} fill="url(#rainFill)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 pt-1.5">
            {w.stations.map((s) => (
              <span key={s.code} className="data-mono text-[0.62rem] text-slate-500">
                <span className="text-water">{s.code}</span> {s.totalMm.toFixed(0)}mm
              </span>
            ))}
            <SourceBadge source="SYNTHETIC_DEMO" />
            <span className="micro-label text-[0.5rem]! text-slate-400">window 72h</span>
          </div>
        </>
      ) : (
        <ErrorNoteInline message={(weatherQ.error as Error)?.message ?? "Rainfall unavailable"} onRetry={() => weatherQ.refetch()} />
      )}
    </Panel>
  );
}

function rainfallSeries(w?: WeatherResponse) {
  if (!w) return [];
  const bySlot = new Map<string, { t: number; mm: number; n: number }>();
  for (const o of w.series) {
    const key = o.t.slice(0, 16);
    const slot = bySlot.get(key) ?? { t: new Date(o.t).getTime(), mm: 0, n: 0 };
    slot.mm += o.mm;
    slot.n += 1;
    bySlot.set(key, slot);
  }
  return [...bySlot.values()]
    .sort((a, b) => a.t - b.t)
    .map((s) => ({
      label: new Date(s.t).toLocaleTimeString("en-IN", { hour: "2-digit", hour12: false }),
      mm: +(s.mm / s.n).toFixed(1),
    }));
}

/* --------------------------------------------------------------- error */

function ErrorNoteInline({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm">
      <span className="text-sev-critical" aria-hidden>⚠</span>
      <span className="text-red-700 flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="micro-label text-[0.6rem]! text-water hover:text-water-dim">retry</button>
      )}
    </div>
  );
}
