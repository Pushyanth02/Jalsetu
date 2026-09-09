"use client";

import { useUi, navigate } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type OverviewResponse, type WeatherResponse } from "@/lib/client/api";
import { useMapData, MapWithOverlays } from "@/components/app/map/MapView";
import { LoadingRows, ErrorNote, Panel, StatusBadge, RiskBadge, SeverityTicks, TimeAgo, EmptyState, ConfidenceChip, SourceBadge } from "@/components/app/shared/domain";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { AlertTriangle, ChevronRight, Umbrella, CheckCircle2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventSummary } from "@/lib/client/api";

// COMMAND CENTER - map-first operational overview. Every number links to an
// actionable view; every panel shows provenance. No decorative tiles.

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

  const d = overviewQ.data;
  const err = overviewQ.error as Error | null;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* status strip */}
      <div className="hairline-b bg-ink-900/30">
        <div className="flex items-stretch gap-0 overflow-x-auto no-scrollbar px-1">
          {d ? (
            <>
              <StatLink label="active events" value={d.counts.activeEvents} to="map" hint="total events in pilot window" />
              <StatLink label="high risk" value={d.counts.highRisk} to="map" filterRisk="HIGH" hint="risk band high or critical" accent />
              <StatLink label="awaiting response" value={d.counts.awaitingResponse} to="verify" hint="triaged or reopened, not yet assigned" />
              <StatLink label="in field" value={d.counts.inField} to="verify" hint="assigned or in progress" />
              <StatLink label="verified" value={d.counts.verified} to="verify" hint="verified or closed with evidence" />
              <StatLink label="reopened" value={d.counts.reopened} to="verify" hint="recurrence after closure" />
            </>
          ) : (
            <div className="flex gap-6 px-4 py-3 w-full">
              {err ? <ErrorNote message={err.message} onRetry={() => overviewQ.refetch()} /> : <LoadingRows rows={1} className="flex-1" />}
            </div>
          )}
          {d && (
            <div className="ml-auto hidden xl:flex items-center gap-3 px-5 shrink-0 hairline-l">
              <Umbrella className="size-3.5 text-water" aria-hidden />
              <div>
                <p className="micro-label !text-[0.55rem]">pilot rainfall 24h</p>
                <p className="data-mono text-sm text-foreground leading-tight">{Math.round(d.rainfall.pilot24hMm)} mm</p>
              </div>
              <div className="hairline-l pl-3">
                <p className="micro-label !text-[0.55rem]">72h</p>
                <p className="data-mono text-sm text-foreground leading-tight">{Math.round(d.rainfall.pilot72hMm)} mm</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* main grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-3 p-3 overflow-y-auto xl:overflow-hidden">
        {/* left column: map + rainfall */}
        <div className="flex flex-col gap-3 min-h-0">
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Radio className="size-3 text-water" aria-hidden />
                live operations map
              </span>
            }
            actions={<SourceBadge source="SYNTHETIC_DEMO" />}
            dense
            className="min-h-[46dvh] xl:min-h-0 flex-1 overflow-hidden"
            bodyClassName="relative"
          >
            {eventsQ.isLoading ? (
              <LoadingRows rows={5} className="p-4" />
            ) : eventsQ.isError ? (
              <ErrorNote message={(eventsQ.error as Error).message} onRetry={() => eventsQ.refetch()} className="m-4" />
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
          </Panel>

          <RainfallStrip weatherQ={weatherQ} nearest={d?.rainfall.nearestStation ?? null} />
        </div>

        {/* right column: alerts + event queue + response */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto xl:overflow-hidden">
          <Panel title="operational alerts" dense className="shrink-0 max-h-56 overflow-y-auto">
            {d ? (
              d.alerts.length === 0 ? (
                <EmptyState title="No active alerts" hint="Alerts trigger on critical risk, response delay, or recurrence." />
              ) : (
                <ul>
                  {d.alerts.map((a, i) => (
                    <li key={i} className="hairline-b last:border-0">
                      <button
                        className="w-full flex items-start gap-2.5 px-3.5 py-2 text-left hover:bg-ink-850/50 transition-colors group"
                        onClick={() => a.eventCode && navigate("event", a.eventCode)}
                      >
                        <AlertTriangle
                          className={cn("size-3.5 mt-0.5 shrink-0", a.severity === "CRITICAL" ? "text-sev-critical" : a.severity === "HIGH" ? "text-sev-high" : "text-sev-moderate")}
                          aria-hidden
                        />
                        <span className="text-xs leading-relaxed text-foreground/90 flex-1">{a.message}</span>
                        {a.eventCode && <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-water shrink-0 mt-0.5" aria-hidden />}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <LoadingRows rows={3} className="p-3.5" />
            )}
          </Panel>

          <Panel
            title={
              <span>
                active event queue
                {d && <span className="data-mono ml-2 !text-[0.62rem] !tracking-normal !normal-case text-muted-foreground">{d.events.length}</span>}
              </span>
            }
            actions={
              <button onClick={() => navigate("map")} className="micro-label !text-[0.58rem] text-water hover:text-foreground transition-colors">
                open map →
              </button>
            }
            dense
            className="flex-1 min-h-[280px] overflow-hidden flex flex-col"
            bodyClassName="overflow-y-auto max-h-full"
          >
            {eventsQ.isLoading ? (
              <LoadingRows rows={6} className="p-3.5" />
            ) : eventsQ.data && eventsQ.data.length > 0 ? (
              <ul className="min-h-full">
                {eventsQ.data.slice(0, 30).map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            ) : (
              <EmptyState title="No events match current filters" hint="Adjust filters on the map view." />
            )}
          </Panel>

          {d && (
            <Panel title="response status · by agency" dense className="shrink-0 max-h-72 overflow-y-auto">
              <ul>
                {d.responseByAgency.map((a) => (
                  <li key={a.code} className="flex items-center gap-3 px-3.5 py-2 hairline-b last:border-0">
                    <span className="data-mono text-xs font-semibold text-water w-10 shrink-0">{a.code}</span>
                    <span className="text-xs text-muted-foreground flex-1 truncate">{a.name}</span>
                    <span className="data-mono text-[0.65rem] text-foreground" title="active events">{a.active}<span className="text-muted-foreground"> act</span></span>
                    <span className="data-mono text-[0.65rem] text-verified flex items-center gap-1" title="verified/closed">
                      <CheckCircle2 className="size-3" aria-hidden />{a.verified}
                    </span>
                    {a.highRisk > 0 && <span className="data-mono text-[0.65rem] text-sev-high" title="high risk">{a.highRisk} hi</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function StatLink({ label, value, to, filterRisk, hint, accent }: { label: string; value: number; to: "map" | "verify"; filterRisk?: string; hint: string; accent?: boolean }) {
  const setFilters = useUi((s) => s.setFilters);
  return (
    <button
      onClick={() => {
        if (filterRisk) setFilters({ riskBand: filterRisk as "HIGH" });
        navigate(to);
      }}
      title={hint}
      className="group flex items-baseline gap-2 px-4 py-2.5 hairline-r shrink-0 hover:bg-ink-850/60 transition-colors"
    >
      <span className={cn("font-display text-xl font-bold tabular-nums leading-none", accent && value > 0 ? "text-sev-high" : "text-foreground")}>
        {value}
      </span>
      <span className="micro-label !text-[0.55rem] text-muted-foreground group-hover:text-foreground/80 transition-colors">{label}</span>
    </button>
  );
}

export function EventRow({ event }: { event: EventSummary }) {
  const openEvent = useUi((s) => s.openEvent);
  return (
    <li className="hairline-b last:border-0">
      <button
        onClick={() => openEvent(event.code)}
        className="w-full text-left px-3.5 py-2.5 hover:bg-ink-850/50 transition-colors group focus:bg-ink-850/70"
        aria-label={`${event.code}: ${event.title}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="data-mono text-[0.68rem] font-semibold text-water group-hover:text-water/90">{event.code}</span>
          <StatusBadge status={event.status} />
          <RiskBadge band={event.riskBand} score={event.riskScore} />
          {event.recurrenceCount > 0 && (
            <span className="micro-label !text-[0.55rem] text-sev-high" title={`recurred ${event.recurrenceCount}×`}>
              ↻{event.recurrenceCount}
            </span>
          )}
          <TimeAgo iso={event.lastActivityAt} />
        </div>
        <p className="mt-1 text-[0.8rem] text-foreground/90 leading-snug line-clamp-1">{event.title}</p>
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          <SeverityTicks severity={event.severity} />
          <span className="data-mono text-[0.62rem] text-muted-foreground">{event.reportCount} rep</span>
          <span className="data-mono text-[0.62rem] text-muted-foreground">{event.agencyCode ?? "-"}</span>
          <ConfidenceChip confidence={event.confidence} note={event.confidenceNote} />
        </div>
      </button>
    </li>
  );
}

function RainfallStrip({ weatherQ, nearest }: { weatherQ: { data?: WeatherResponse; isLoading: boolean; error: unknown; refetch: () => void }; nearest: OverviewResponse["rainfall"]["nearestStation"] }) {
  const w = weatherQ.data;
  const series = rainfallSeries(w);
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Umbrella className="size-3 text-water" aria-hidden />
          rainfall context · synthetic gauges
        </span>
      }
      actions={
        nearest && (
          <span className="micro-label !text-[0.55rem] text-muted-foreground">
            nearest: {nearest.name} · {(nearest.distanceM / 1000).toFixed(1)}km
          </span>
        )
      }
      className="shrink-0"
      bodyClassName="pt-2 pb-1"
    >
      {weatherQ.isLoading ? (
        <LoadingRows rows={2} />
      ) : w ? (
        <>
          <div className="h-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#45c4b0" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#45c4b0" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} />
                <YAxis width={28} tick={{ fill: "#5c7076", fontSize: 9, fontFamily: "var(--font-plex-mono)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#141b20", border: "1px solid rgba(148,180,186,0.18)", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                  labelStyle={{ color: "#93a6ac" }}
                  formatter={(v: number) => [`${v} mm`, "avg 3h rain"]}
                />
                <Area type="monotone" dataKey="mm" stroke="#45c4b0" strokeWidth={1.5} fill="url(#rainFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 pt-1">
            {w.stations.map((s) => (
              <span key={s.code} className="data-mono text-[0.62rem] text-muted-foreground">
                <span className="text-water/90">{s.code}</span> {s.totalMm.toFixed(0)}mm
              </span>
            ))}
            <span className="micro-label !text-[0.5rem] text-muted-foreground/60">window 72h</span>
          </div>
        </>
      ) : (
        <ErrorNote message={(weatherQ.error as Error)?.message ?? "Rainfall unavailable"} onRetry={() => weatherQ.refetch()} />
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
