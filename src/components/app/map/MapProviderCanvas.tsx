"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { MapCanvas, type MapData } from "./MapCanvas";
import { MapErrorBoundary } from "./MapErrorBoundary";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Map provider orchestrator.
 *
 * Architecture: if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is configured, the Google
 * Maps canvas is the primary engine (loaded lazily so @googlemaps packages
 * never reach the bundle without a key). Any failure (script network error,
 * auth rejection, render crash) degrades honestly to the keyless MapLibre
 * fallback with a visible badge. Without a key, MapLibre runs directly.
 */

const GoogleMapCanvas = dynamic(() => import("./GoogleMapCanvas").then((m) => m.GoogleMapCanvas), {
  ssr: false,
});

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

type Provider = "google" | "maplibre";

interface Props extends MapData {
  className?: string;
  compact?: boolean;
  initialZoom?: number;
  initialCenter?: [number, number];
  interactive?: boolean;
}

export function MapProviderCanvas(props: Props) {
  const initial: Provider = GOOGLE_KEY ? "google" : "maplibre";
  const [provider, setProvider] = useState<Provider>(initial);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const { toast } = useToast();

  const onFatal = useCallback(
    (err: unknown) => {
      const reason = err instanceof Error ? err.message : "Google Maps failed to load";
      setFallbackReason(reason);
      setProvider("maplibre");
      toast({
        title: "Switched To The Fallback Map",
        description:
          "Google Maps could not load (network or key problem), so the open basemap is now showing the same data.",
        variant: "destructive",
      });
    },
    [toast]
  );

  const onRetry = useCallback(() => {
    setFallbackReason(null);
    setProvider(initial);
    setRetryKey((k) => k + 1);
  }, [initial]);

  return (
    <div className={cn("relative size-full min-h-0", props.className)}>
      <MapErrorBoundary key={`boundary-${retryKey}`} onRetry={onRetry}>
        {provider === "google" ? (
          <GoogleMapCanvas key={`google-${retryKey}`} {...props} apiKey={GOOGLE_KEY} onFatal={onFatal} />
        ) : (
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
        )}
      </MapErrorBoundary>

      {!props.compact && (
        <ProviderBadge provider={provider} reason={fallbackReason} />
      )}
    </div>
  );
}

function ProviderBadge({ provider, reason }: { provider: Provider; reason: string | null }) {
  const label =
    provider === "google"
      ? "Google Maps Basemap"
      : reason
        ? "Open Fallback Map · Google Maps Failed"
        : "Open Fallback Map · No API Key";
  return (
    <span
      className="absolute z-10 top-2 left-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200/60 bg-white/85 backdrop-blur px-2.5 py-1 text-[0.56rem] font-medium text-slate-500 pointer-events-none"
      title={reason ?? (provider === "google" ? "Interactive map powered by the Google Maps API" : "Keyless open basemap: Esri World Dark Gray Canvas + OpenStreetMap labels")}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", provider === "google" ? "bg-emerald-500" : "bg-slate-400")}
      />
      {label}
    </span>
  );
}
