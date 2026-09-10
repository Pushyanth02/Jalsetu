"use client";

import dynamic from "next/dynamic";
import { useUi } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type EventSummary, type HotspotResponse, type JurisdictionResponse, type AssetResponse, type WeatherResponse } from "@/lib/client/api";
import { LoadingRows, RiskBadge, SeverityTicks, StatusBadge, TimeAgo, ConfidenceChip } from "../shared/domain";
import { MapLegend } from "./MapLegend";
import { MapData, MapCanvas } from "./MapCanvas";
import { X } from "lucide-react";
import { navigate } from "@/lib/client/store";
import { cn } from "@/lib/utils";

// SSR-off dynamic map loader with a layout-matched skeleton.
const MapCanvasDyn = dynamic<MapData & { className?: string; compact?: boolean; initialZoom?: number; initialCenter?: [number, number]; interactive?: boolean }>(
  () => import("./MapCanvas").then((m) => m.MapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="size-full bg-ink-900 grid place-items-center" aria-busy="true">
        <LoadingRows rows={3} className="w-40" />
      </div>
    ),
  }
);

export { MapCanvasDyn as MapView };

/** Shared hook: filtered events + all map layers. */
export function useMapData() {
  const filters = useUi((s) => s.filters);
  const params = new URLSearchParams();
  if (filters.status !== "ALL") params.set("status", filters.status);
  if (filters.riskBand !== "ALL") params.set("riskBand", filters.riskBand);
  if (filters.category !== "ALL") params.set("category", filters.category);
  if (filters.hours !== "ALL") params.set("hours", String(filters.hours));
  if (filters.jurisdictionId !== "ALL") params.set("jurisdictionId", filters.jurisdictionId);
  params.set("limit", "200");

  const eventsQ = useQuery({
    queryKey: ["events", params.toString()],
    queryFn: () => apiGet<EventSummary[]>(`/api/events?${params}`).then((r) => r.data),
    refetchInterval: 45_000,
  });
  const hotspotsQ = useQuery({
    queryKey: ["hotspots"],
    queryFn: () => apiGet<HotspotResponse>("/api/hotspots").then((r) => r.data),
    staleTime: 120_000,
  });
  const jurisdictionsQ = useQuery({
    queryKey: ["jurisdictions"],
    queryFn: () => apiGet<JurisdictionResponse[]>("/api/jurisdictions").then((r) => r.data),
    staleTime: 600_000,
  });
  const assetsQ = useQuery({
    queryKey: ["assets"],
    queryFn: () => apiGet<AssetResponse[]>("/api/assets").then((r) => r.data),
    staleTime: 600_000,
  });
  const weatherQ = useQuery({
    queryKey: ["weather", 72],
    queryFn: () => apiGet<WeatherResponse>("/api/weather?hours=72").then((r) => r.data),
    refetchInterval: 120_000,
  });

  return { eventsQ, hotspotsQ, jurisdictionsQ, assetsQ, weatherQ };
}

/** Floating card for the selected map marker (keyboard accessible). */
export function MapSelectionCard({ events }: { events: EventSummary[] }) {
  const selectedId = useUi((s) => s.selectedEventId);
  const selectEvent = useUi((s) => s.selectEvent);
  const ev = events.find((e) => e.id === selectedId);
  if (!ev) return null;
  return (
    <div
      className={cn(
        "absolute z-20 bottom-3 left-3 right-3 sm:right-auto sm:w-96 panel rounded-xl p-3.5 shadow-xl",
        "animate-in fade-in slide-in-from-bottom-2 duration-200"
      )}
      role="dialog"
      aria-label={`Event ${ev.code}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="data-mono text-xs font-semibold text-water">{ev.code}</span>
            <StatusBadge status={ev.status} />
            <RiskBadge band={ev.riskBand} score={ev.riskScore} />
          </div>
          <h3 className="mt-1.5 text-sm font-medium leading-snug line-clamp-2">{ev.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{ev.locationText}</p>
          <div className="mt-2.5 flex items-center gap-3 flex-wrap">
            <SeverityTicks severity={ev.severity} />
            <span className="data-mono text-[0.65rem] text-muted-foreground">{ev.reportCount} reports</span>
            <ConfidenceChip confidence={ev.confidence} />
            <TimeAgo iso={ev.lastActivityAt} />
          </div>
        </div>
        <button
          onClick={() => selectEvent(null)}
          className="p-1 -m-1 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss selection"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => navigate("event", ev.code)}
          className="flex-1 rounded-lg bg-water text-white micro-label !text-[0.62rem] font-semibold !tracking-[0.12em] py-2 hover:bg-water-dim transition-colors"
        >
          Open full dossier
        </button>
        <button
          onClick={() => {
            useUi.getState().focusMap(ev.lat, ev.lng, 15.5);
          }}
          className="rounded-lg border border-border text-slate-600 px-3 py-2 micro-label !text-[0.62rem] hover:bg-ink-850 transition-colors"
        >
          Zoom
        </button>
      </div>
    </div>
  );
}

export function MapWithOverlays({ className, compact, initialZoom, initialCenter, events, weather, hotspots, jurisdictions, assets, showLegend = true, showSelection = true }: {
  className?: string;
  compact?: boolean;
  initialZoom?: number;
  initialCenter?: [number, number];
  events: EventSummary[];
  weather?: WeatherResponse;
  hotspots?: HotspotResponse;
  jurisdictions?: JurisdictionResponse[];
  assets?: AssetResponse[];
  showLegend?: boolean;
  showSelection?: boolean;
}) {
  return (
    <div className={cn("relative size-full min-h-0", className)}>
      <MapCanvasDyn
        events={events}
        weather={weather}
        hotspots={hotspots}
        jurisdictions={jurisdictions}
        assets={assets}
        compact={compact}
        initialZoom={initialZoom}
        initialCenter={initialCenter}
      />
      {showLegend && <MapLegend compact={compact} />}
      {showSelection && <MapSelectionCard events={events} />}
    </div>
  );
}

export { MapLegend };
export type { MapData };
void MapCanvas;
