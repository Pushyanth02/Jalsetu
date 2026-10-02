"use client";

import { useUi, navigate } from "@/lib/client/store";
import { useMapData, MapWithOverlays } from "@/components/app/map/MapView";
import type { WeatherResponse } from "@/lib/client/api";
import { EventRow } from "../command/CommandCenterView";
import { LoadingRows, ErrorNote, EmptyState, TimeAgo } from "@/components/app/shared/domain";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, Users, CloudRain, GitBranch, MapPin, Droplets, Landmark, X } from "lucide-react";
import { Reveal, CountUp, PulseDot } from "@/components/motion/kit";

// WATERLOGGING MAP - full-bleed dark ops map with white filter rail on
// desktop and a drag-handle bottom sheet on mobile (<1024px). Spatial
// selection (click jurisdiction), event list synced to filters, Locate Me,
// anchored InfoWindow popups with plain-language guidance.

const TIME_WINDOWS = [
  { value: "ALL", label: "All Time" },
  { value: "6", label: "Last 6 Hours" },
  { value: "24", label: "Last 24 Hours" },
  { value: "72", label: "Last 72 Hours" },
] as const;

const RISK_BANDS = ["ALL", "LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
const STATUSES = ["ALL", "DETECTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "VERIFIED", "CLOSED", "REOPENED"] as const;
const CATEGORIES = ["ALL", "WATERLOGGING", "DRAIN_OVERFLOW", "SEWER_BACKUP", "POTHOLE", "DEBRIS_BLOCKAGE"] as const;

/** Rows rendered per page in the event list. The map still receives every
 *  matching event; only the list is paged, so DOM size stays bounded. */
const LIST_PAGE = 40;

const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  ALL: "All Categories",
  WATERLOGGING: "Waterlogging",
  DRAIN_OVERFLOW: "Drain Overflow",
  SEWER_BACKUP: "Sewer Backup",
  POTHOLE: "Pothole",
  DEBRIS_BLOCKAGE: "Debris Blockage",
};

export function MapExplorerView() {
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const { eventsQ, hotspotsQ, jurisdictionsQ, assetsQ, weatherQ } = useMapData();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Paging state is keyed by the filter signature, so a filter change collapses
  // the list back to the first screen without needing an effect.
  const filterKey = `${filters.status}|${filters.riskBand}|${filters.category}|${filters.hours}|${filters.jurisdictionId}`;
  const [page, setPage] = useState({ key: filterKey, count: LIST_PAGE });
  const visibleCount = page.key === filterKey ? page.count : LIST_PAGE;

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

  const allEvents = useMemo(() => eventsQ.data ?? [], [eventsQ.data]);
  const shownEvents = allEvents.slice(0, visibleCount);
  const remaining = allEvents.length - shownEvents.length;

  const selectedJurisdiction = jurisdictionsQ.data?.find((j) => j.id === filters.jurisdictionId);
  const activeFilterCount =
    (filters.status !== "ALL" ? 1 : 0) +
    (filters.riskBand !== "ALL" ? 1 : 0) +
    (filters.category !== "ALL" ? 1 : 0) +
    (filters.hours !== "ALL" ? 1 : 0) +
    (filters.jurisdictionId !== "ALL" ? 1 : 0);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* page header */}
      <Reveal className="hairline-b bg-ink-900 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 leading-tight">Map Explorer</h1>
          <p className="text-[0.7rem] text-muted-foreground mt-0.5">
            See every waterlogging incident on one map. Click a shaded area to focus on that zone.
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

      {/* mobile: filters open the bottom sheet (44px touch target) */}
      <div className="lg:hidden hairline-b bg-ink-900 px-4 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="min-h-11 flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-ink-900 px-3 text-xs font-semibold text-slate-200 hover:bg-ink-800 transition-colors"
          aria-label="Open filters and layers"
          aria-expanded={sheetOpen}
        >
          <SlidersHorizontal className="size-4 text-water" aria-hidden />
          Filters &amp; Layers
          {activeFilterCount > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-blue-50 text-water data-mono text-[0.6rem] font-semibold">
              {activeFilterCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => navigate("report")}
          className="min-h-11 rounded-lg bg-aqua px-4 text-xs font-semibold text-ink-950 hover:bg-aqua-dim transition-colors"
        >
          Report
        </button>
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* desktop filter rail */}
        <Reveal
          delay={0.06}
          className="hidden lg:flex lg:w-72 shrink-0 hairline-r bg-ink-900 flex-col overflow-y-auto"
        >
          <FilterRailContent
            filters={filters}
            setFilters={setFilters}
            selectedJurisdiction={selectedJurisdiction}
            weather={weatherQ.data}
          />
        </Reveal>

        {/* mobile bottom sheet (vaul): same rail content, drag handle + snap */}
        <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
          <DrawerContent className="max-h-[85dvh]">
            <DrawerHeader className="text-left pb-0">
              <DrawerTitle className="text-sm font-bold font-display text-slate-900">Filters &amp; Layers</DrawerTitle>
              <DrawerDescription className="text-xs text-muted-foreground">
                Narrow the map to what you care about. Changes apply instantly.
              </DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6 pt-2">
              <FilterRailContent
                filters={filters}
                setFilters={setFilters}
                selectedJurisdiction={selectedJurisdiction}
                weather={weatherQ.data}
                onDone={() => setSheetOpen(false)}
              />
            </div>
          </DrawerContent>
        </Drawer>

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

          <div className="h-64 lg:h-56 shrink-0 hairline-t bg-ink-900 overflow-y-auto cv-auto">
            {eventsQ.isLoading ? (
              <LoadingRows rows={4} className="p-3.5" />
            ) : allEvents.length > 0 ? (
              <>
                <ul>
                  {shownEvents.map((e) => (
                    <EventRow key={e.id} event={e} />
                  ))}
                </ul>
                {remaining > 0 && (
                  <div className="p-3">
                    <button
                      onClick={() => setPage({ key: filterKey, count: visibleCount + LIST_PAGE })}
                      className="w-full rounded-lg border border-border px-3 py-2 micro-label !text-[0.58rem] text-slate-600 transition-colors hover:bg-ink-850 hover:text-slate-900"
                    >
                      show more · {remaining} remaining
                    </button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                title="No Events Match These Filters"
                hint="Loosen the severity, status, or time window filters."
                action={
                  <button onClick={() => setFilters({ status: "ALL", riskBand: "ALL", category: "ALL", hours: "ALL", jurisdictionId: "ALL" })} className="micro-label !text-[0.6rem] text-water hover:text-water-dim transition-colors mt-1">
                    reset filters
                  </button>
                }
              />
            )}
          </div>

          <div className="shrink-0 hairline-t bg-ink-950/60 px-3 py-1.5 flex items-center gap-3">
            <span className="data-mono text-[0.62rem] text-muted-foreground flex items-center gap-1">
              <CountUp value={eventsQ.data?.length ?? 0} className="text-slate-700" /> events shown
              {eventsQ.dataUpdatedAt ? <span> · updated <TimeAgo iso={new Date(eventsQ.dataUpdatedAt).toISOString()} title={false} /></span> : null}
            </span>
            <button onClick={() => navigate("report")} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 min-h-8 micro-label !text-[0.58rem] text-slate-600 hover:bg-ink-850 hover:text-slate-900 transition-colors">
              report waterlogging →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shared filter/layer rail used by the desktop aside and the mobile sheet. */
function FilterRailContent({
  filters,
  setFilters,
  selectedJurisdiction,
  weather,
  onDone,
}: {
  filters: ReturnType<typeof useUi.getState>["filters"];
  setFilters: ReturnType<typeof useUi.getState>["setFilters"];
  selectedJurisdiction: { name: string } | undefined;
  weather: WeatherResponse | undefined;
  onDone?: () => void;
}) {
  return (
    <div className="p-4 space-y-4">
      <FilterGroup label="Time Window">
        <Select value={String(filters.hours)} onValueChange={(v) => setFilters({ hours: v === "ALL" ? "ALL" : Number(v) })}>
          <SelectTrigger aria-label="Time window" className="h-11 lg:h-8 text-xs bg-ink-850 border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TIME_WINDOWS.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterGroup>

      <FilterGroup label="Risk Band">
        <div className="grid grid-cols-5 gap-1">
          {RISK_BANDS.map((b) => (
            <button
              key={b}
              onClick={() => setFilters({ riskBand: b })}
              aria-pressed={filters.riskBand === b}
              className={cn(
                "rounded-lg border micro-label !text-[0.55rem] py-2 lg:py-1.5 transition-colors",
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

      <FilterGroup label="Status">
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilters({ status: s })}
              aria-pressed={filters.status === s}
              className={cn(
                "rounded-lg border micro-label !text-[0.55rem] px-2 py-1.5 lg:px-1.5 lg:py-1 transition-colors",
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

      <FilterGroup label="Category">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Category filter toggles">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilters({ category: c })}
              aria-pressed={filters.category === c}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 lg:py-1 text-[0.65rem] font-medium transition-colors",
                filters.category === c
                  ? "border-blue-200 bg-blue-50 text-water"
                  : "border-border text-slate-500 hover:bg-ink-850 hover:text-slate-700"
              )}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Jurisdiction (Spatial)">
        {selectedJurisdiction ? (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
            <MapPin className="size-3 text-water shrink-0" aria-hidden />
            <span className="text-xs text-water flex-1 leading-tight font-medium">{selectedJurisdiction.name}</span>
            <button onClick={() => setFilters({ jurisdictionId: "ALL" })} aria-label="Clear jurisdiction filter" className="rounded-lg p-1 text-slate-400 hover:text-aqua hover:bg-white/[0.06] transition-colors">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <p className="text-[0.68rem] text-muted-foreground leading-relaxed">
            Click a shaded zone on the map to focus on it. Without a selection, incidents from the whole pilot area are shown.
          </p>
        )}
      </FilterGroup>

      <div className="hairline-t pt-3">
        <p className="micro-label mb-2">Layers</p>
        <div className="space-y-1">
          <LayerToggle k="events" label="Events" icon={Users} />
          <LayerToggle k="hotspots" label="Risk Hotspots" icon={Droplets} />
          <LayerToggle k="groundTruth" label="Ground-Truth Sites" icon={MapPin} />
          <LayerToggle k="rainfall" label="Rainfall Gauges" icon={CloudRain} />
          <LayerToggle k="assets" label="Drains &amp; Assets" icon={GitBranch} />
          <LayerToggle k="jurisdictions" label="Jurisdiction Bounds" icon={Landmark} />
        </div>
      </div>

      {weather && (
        <div className="hairline-t pt-3">
          <p className="micro-label mb-2">Rainfall (72h, Synthetic)</p>
          <ul className="space-y-1">
            {weather.stations.map((s) => (
              <li key={s.code} className="flex items-baseline justify-between text-xs">
                <span className="data-mono text-water">{s.code}</span>
                <span className="text-muted-foreground">{s.totalMm.toFixed(0)} mm</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="w-full min-h-11 rounded-lg bg-aqua text-ink-950 text-xs font-semibold hover:bg-aqua-dim transition-colors"
        >
          Show {filters.category === "ALL" ? "All" : CATEGORY_LABELS[filters.category as keyof typeof CATEGORY_LABELS]} Events
        </button>
      )}
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
    <label className="flex min-h-9 items-center gap-2.5 py-1 px-1.5 -mx-1.5 rounded-lg cursor-pointer select-none hover:bg-ink-850/60 transition-colors">
      <Switch checked={layers[k]} onCheckedChange={() => toggleLayer(k)} aria-label={label} className="scale-90 data-[state=checked]:bg-water" />
      <Icon className={cn("size-3.5", layers[k] ? "text-water" : "text-slate-400")} aria-hidden />
      <span className={cn("text-xs", layers[k] ? "text-slate-700" : "text-slate-500")}>{label}</span>
    </label>
  );
}
