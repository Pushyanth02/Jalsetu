"use client";

import { useUi, navigate } from "@/lib/client/store";
import { useMapData, MapWithOverlays } from "@/components/app/map/MapView";
import { EventRow } from "../command/CommandCenterView";
import { LoadingRows, ErrorNote, EmptyState, TimeAgo } from "@/components/app/shared/domain";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { SlidersHorizontal, Users, CloudRain, GitBranch, MapPin, Droplets, Landmark, X } from "lucide-react";
import { Reveal, Stagger, StaggerItem, CountUp, PulseDot } from "@/components/motion/kit";

// WATERLOGGING MAP - full-bleed dark ops map with white filter rail,
// spatial selection (click jurisdiction), event list synced to filters.

const TIME_WINDOWS = [
  { value: "ALL", label: "All time" },
  { value: "6", label: "Last 6h" },
  { value: "24", label: "Last 24h" },
  { value: "72", label: "Last 72h" },
] as const;

const RISK_BANDS = ["ALL", "LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
const STATUSES = ["ALL", "DETECTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "VERIFIED", "CLOSED", "REOPENED"] as const;
const CATEGORIES = ["ALL", "WATERLOGGING", "DRAIN_OVERFLOW", "SEWER_BACKUP", "POTHOLE", "DEBRIS_BLOCKAGE"] as const;

export function MapExplorerView() {
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const { eventsQ, hotspotsQ, jurisdictionsQ, assetsQ, weatherQ } = useMapData();

  // spatial selection via map jurisdiction click
  useEffect(() => {
    const onJurisdiction = (e: Event) => {
      const code = (e as CustomEvent<string>).detail;
      const j = jurisdictionsQ.data?.find((x) => x.code === code);
      if (j) setFilters({ jurisdictionId: j.id });
    };
    window.addEventListener("varuna:jurisdiction-click", onJurisdiction);
    return () => window.removeEventListener("varuna:jurisdiction-click", onJurisdiction);
  }, [jurisdictionsQ.data, setFilters]);

  const selectedJurisdiction = jurisdictionsQ.data?.find((j) => j.id === filters.jurisdictionId);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* page header */}
      <Reveal className="hairline-b bg-white px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 leading-tight">Map Explorer</h1>
          <p className="text-[0.7rem] text-muted-foreground mt-0.5">
            Spatial operations view · click a jurisdiction to filter the pilot
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 pl-2.5 pr-3 py-1">
            <PulseDot color="bg-emerald-500" size={7} />
            <span className="text-[0.65rem] font-semibold text-emerald-700">Live Data</span>
            <span className="data-mono text-[0.6rem] text-emerald-600/70">demo mode</span>
          </span>
          {jurisdictionsQ.data && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 micro-label !text-[0.58rem] text-water">
              <MapPin className="size-3" aria-hidden /> {jurisdictionsQ.data.length} jurisdictions
            </span>
          )}
        </div>
      </Reveal>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* filter rail */}
        <Reveal
          delay={0.06}
          className="lg:w-72 shrink-0 hairline-b lg:hairline-b-0 lg:hairline-r bg-white flex flex-col max-h-64 lg:max-h-none overflow-y-auto"
        >
          <div className="px-4 py-3 flex items-center gap-2 hairline-b lg:hidden">
            <SlidersHorizontal className="size-3.5 text-water" aria-hidden />
            <span className="micro-label">filters & layers</span>
          </div>

          <div className="p-4 space-y-4">
            <FilterGroup label="severity window">
              <Select value={String(filters.hours)} onValueChange={(v) => setFilters({ hours: v === "ALL" ? "ALL" : Number(v) })}>
                <SelectTrigger aria-label="Time window" className="h-8 text-xs bg-white border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_WINDOWS.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterGroup>

            <FilterGroup label="risk band">
              <div className="grid grid-cols-5 gap-1">
                {RISK_BANDS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setFilters({ riskBand: b })}
                    aria-pressed={filters.riskBand === b}
                    className={cn(
                      "rounded-lg border micro-label !text-[0.55rem] py-1.5 transition-colors",
                      filters.riskBand === b
                        ? b === "CRITICAL"
                          ? "border-red-200 bg-red-50 text-sev-critical"
                          : b === "HIGH"
                            ? "border-orange-200 bg-orange-50 text-sev-high"
                            : "border-blue-200 bg-blue-50 text-water"
                        : "border-border text-slate-500 hover:bg-ink-850 hover:text-slate-700"
                    )}
                  >
                    {b === "ALL" ? "all" : b.slice(0, 4).toLowerCase()}
                  </button>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label="status">
              <div className="flex flex-wrap gap-1">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilters({ status: s })}
                    aria-pressed={filters.status === s}
                    className={cn(
                      "rounded-lg border micro-label !text-[0.55rem] px-1.5 py-1 transition-colors",
                      filters.status === s
                        ? "border-blue-200 bg-blue-50 text-water"
                        : "border-border text-slate-500 hover:bg-ink-850 hover:text-slate-700"
                    )}
                  >
                    {s === "IN_PROGRESS" ? "field" : s.toLowerCase()}
                  </button>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label="category">
              <Select value={filters.category} onValueChange={(v) => setFilters({ category: v })}>
                <SelectTrigger aria-label="Category" className="h-8 text-xs bg-white border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {c === "ALL" ? "All categories" : c.toLowerCase().replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterGroup>

            <FilterGroup label="jurisdiction (spatial)">
              {selectedJurisdiction ? (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
                  <MapPin className="size-3 text-water shrink-0" aria-hidden />
                  <span className="text-xs text-water flex-1 leading-tight font-medium">{selectedJurisdiction.name}</span>
                  <button onClick={() => setFilters({ jurisdictionId: "ALL" })} aria-label="Clear jurisdiction filter" className="rounded-lg p-0.5 text-slate-400 hover:text-slate-700 hover:bg-white transition-colors">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-[0.68rem] text-muted-foreground leading-relaxed">
                  Click a jurisdiction polygon on the map, or events are shown pilot-wide.
                </p>
              )}
            </FilterGroup>

            <div className="hairline-t pt-3">
              <p className="micro-label mb-2">layers</p>
              <div className="space-y-1">
                <LayerToggle k="events" label="Events" icon={Users} />
                <LayerToggle k="hotspots" label="Risk hotspots" icon={Droplets} />
                <LayerToggle k="groundTruth" label="Ground-truth sites" icon={MapPin} />
                <LayerToggle k="rainfall" label="Rainfall gauges" icon={CloudRain} />
                <LayerToggle k="assets" label="Drains & assets" icon={GitBranch} />
                <LayerToggle k="jurisdictions" label="Jurisdiction bounds" icon={Landmark} />
              </div>
            </div>

            {weatherQ.data && (
              <div className="hairline-t pt-3">
                <p className="micro-label mb-2">rainfall (72h, synthetic)</p>
                <ul className="space-y-1">
                  {weatherQ.data.stations.map((s) => (
                    <li key={s.code} className="flex items-baseline justify-between text-xs">
                      <span className="data-mono text-water">{s.code}</span>
                      <span className="text-muted-foreground">{s.totalMm.toFixed(0)} mm</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Reveal>

        {/* map + list */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <Reveal delay={0.1} className="flex-1 min-h-[46dvh] relative">
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
              />
            )}
          </Reveal>

          <div className="h-64 lg:h-56 shrink-0 hairline-t bg-white overflow-y-auto">
            {eventsQ.isLoading ? (
              <LoadingRows rows={4} className="p-3.5" />
            ) : eventsQ.data && eventsQ.data.length > 0 ? (
              <ul>
                <Stagger>
                  {eventsQ.data.map((e) => (
                    <StaggerItem key={e.id} className="last:*:border-0">
                      <EventRow event={e} />
                    </StaggerItem>
                  ))}
                </Stagger>
              </ul>
            ) : (
              <EmptyState
                title="No events match these filters"
                hint="Loosen the severity, status, or time window filters."
                action={
                  <button onClick={() => setFilters({ status: "ALL", riskBand: "ALL", category: "ALL", hours: "ALL", jurisdictionId: "ALL" })} className="micro-label !text-[0.6rem] text-water hover:text-water-dim transition-colors mt-1">
                    reset filters
                  </button>
                }
              />
            )}
          </div>

          <div className="shrink-0 hairline-t bg-white px-3 py-1.5 flex items-center gap-3">
            <span className="data-mono text-[0.62rem] text-muted-foreground flex items-center gap-1">
              <CountUp value={eventsQ.data?.length ?? 0} className="text-slate-700" /> events shown
              {eventsQ.dataUpdatedAt ? <span> · updated <TimeAgo iso={new Date(eventsQ.dataUpdatedAt).toISOString()} title={false} /></span> : null}
            </span>
            <button onClick={() => navigate("report")} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 micro-label !text-[0.58rem] text-slate-600 hover:bg-ink-850 hover:text-slate-900 transition-colors">
              report waterlogging →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="micro-label mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function LayerToggle({ k, label, icon: Icon }: { k: keyof ReturnType<typeof useUi.getState>["layers"]; label: string; icon: React.ComponentType<{ className?: string }> }) {
  const layers = useUi((s) => s.layers);
  const toggleLayer = useUi((s) => s.toggleLayer);
  return (
    <label className="flex items-center gap-2.5 py-1 px-1.5 -mx-1.5 rounded-lg cursor-pointer select-none hover:bg-ink-850/60 transition-colors">
      <Switch checked={layers[k]} onCheckedChange={() => toggleLayer(k)} aria-label={label} className="scale-90 data-[state=checked]:bg-water" />
      <Icon className={cn("size-3.5", layers[k] ? "text-water" : "text-slate-400")} aria-hidden />
      <span className={cn("text-xs", layers[k] ? "text-slate-700" : "text-slate-500")}>{label}</span>
    </label>
  );
}
