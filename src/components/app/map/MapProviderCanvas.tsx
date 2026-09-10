"use client";

import { useCallback, useState } from "react";
import { MapCanvas, type MapData } from "./MapCanvas";
import { MapErrorBoundary } from "./MapErrorBoundary";
import { cn } from "@/lib/utils";

/**
 * Map provider orchestrator - keyless edition.
 *
 * The interactive map runs on MapLibre GL with free, key-less raster tiles
 * (Esri World Dark Gray Canvas + OpenStreetMap labels). No API key is read,
 * requested or stored anywhere: the app is fully static and deployable to
 * GitHub Pages as-is. The error boundary still guards the canvas and offers
 * an honest retry when tile loading degrades offline.
 */

interface Props extends MapData {
  className?: string;
  compact?: boolean;
  initialZoom?: number;
  initialCenter?: [number, number];
  interactive?: boolean;
}

export function MapProviderCanvas(props: Props) {
  const [retryKey, setRetryKey] = useState(0);

  const onRetry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  return (
    <div className={cn("relative size-full min-h-0", props.className)}>
      <MapErrorBoundary key={`boundary-${retryKey}`} onRetry={onRetry}>
        <MapCanvas
          key={`maplibre-${retryKey}`}
          events={props.events}
          hotspots={props.hotspots}
          jurisdictions={props.jurisdictions}
          assets={props.assets}
          weather={props.weather}
          className={props.className}
          compact={props.compact}
          initialZoom={props.initialZoom}
          initialCenter={props.initialCenter}
          interactive={props.interactive}
        />
      </MapErrorBoundary>

      {!props.compact && <ProviderBadge />}
    </div>
  );
}

function ProviderBadge() {
  return (
    <span
      className="absolute z-10 top-2 left-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200/60 bg-white/85 backdrop-blur px-2.5 py-1 text-[0.56rem] font-medium text-slate-500 pointer-events-none"
      title="Keyless open basemap: Esri World Dark Gray Canvas + OpenStreetMap labels. No API key required."
    >
      <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
      Open Basemap · No API Key
    </span>
  );
}
