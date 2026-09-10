"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, Loader2, Navigation } from "lucide-react";
import type { EventSummary } from "@/lib/client/api";
import { useUi } from "@/lib/client/store";
import { useToast } from "@/hooks/use-toast";
import { nearestEvent } from "./map-utils";
import { cn } from "@/lib/utils";

/**
 * "Locate Me" control: uses the browser Geolocation API to center the map on
 * the visitor, draw a live location dot + accuracy ring, and surface the
 * nearest waterlogging event with distance. All failure modes (permission
 * denied, unavailable, timeout) produce plain-language toasts.
 */
export function MapLocateControl({ events }: { events: EventSummary[] }) {
  const [state, setState] = useState<"idle" | "locating" | "located">("idle");
  const [nearest, setNearest] = useState<{ code: string; title: string; km: number } | null>(null);
  const eventsRef = useRef(events);
  const { toast } = useToast();
  const setUserPos = useUi((s) => s.setUserPos);
  const focusMap = useUi((s) => s.focusMap);
  const openEvent = useUi((s) => s.openEvent);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const onLocate = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      toast({
        title: "Location Is Not Available",
        description: "This browser cannot share your location. You can still search the map by area name.",
        variant: "destructive",
      });
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setUserPos({ lat: latitude, lng: longitude, accuracy });
        focusMap(latitude, longitude, 14);
        const n = nearestEvent(eventsRef.current, latitude, longitude);
        setNearest(n ? { code: n.event.code, title: n.event.title, km: n.distanceM / 1000 } : null);
        setState("located");
        toast({
          title: "Showing Your Location",
          description: "The blue dot is you. The ring shows how precise the fix is.",
        });
      },
      (err) => {
        setState("idle");
        const copy: Record<number, { title: string; description: string }> = {
          1: {
            title: "Location Permission Was Denied",
            description: "Allow location for this site in your browser settings to use Locate Me.",
          },
          2: {
            title: "Your Position Could Not Be Determined",
            description: "The device could not get a GPS fix. Try again near a window or outdoors.",
          },
          3: {
            title: "Locate Me Timed Out",
            description: "Finding your position took too long. Tap the button to try again.",
          },
        };
        const c = copy[err.code] ?? {
          title: "Location Is Not Available",
          description: "Sharing your location is switched off or unsupported here.",
        };
        toast({ ...c, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  return (
    <div className="absolute z-10 top-2 right-2 flex flex-col items-end gap-2 max-w-[70%]">
      <button
        type="button"
        onClick={onLocate}
        aria-label="Find my location on the map"
        className={cn(
          "inline-flex items-center gap-2 min-h-11 min-w-11 px-3 rounded-xl panel shadow-md",
          "text-slate-700 hover:bg-ink-850 active:scale-[0.97] transition-all",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        )}
      >
        {state === "locating" ? (
          <Loader2 className="size-4 animate-spin text-water" aria-hidden />
        ) : (
          <LocateFixed className={cn("size-4", state === "located" ? "text-water" : "text-slate-500")} aria-hidden />
        )}
        <span className="hidden sm:inline text-xs font-semibold">Locate Me</span>
      </button>

      {state === "located" && nearest && (
        <button
          type="button"
          onClick={() => openEvent(nearest.code)}
          className="panel rounded-xl px-3 py-2 shadow-md max-w-full text-left group animate-in fade-in slide-in-from-right-2 duration-200"
        >
          <span className="micro-label !text-[0.52rem] block text-muted-foreground">nearest waterlogging</span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className="data-mono text-[0.68rem] font-semibold text-water group-hover:text-water-dim truncate">
              {nearest.code}
            </span>
            <span className="data-mono text-[0.68rem] font-semibold text-sev-high">{nearest.km.toFixed(1)} km</span>
            <Navigation className="size-3 text-slate-400 shrink-0" aria-hidden />
          </span>
          <span className="mt-0.5 block text-[0.66rem] text-slate-600 truncate">{nearest.title}</span>
        </button>
      )}

      {state === "located" && !nearest && (
        <span className="panel rounded-xl px-3 py-1.5 shadow-md text-[0.66rem] text-slate-600">
          No waterlogging events near you
        </span>
      )}
    </div>
  );
}
