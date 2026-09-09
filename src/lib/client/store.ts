"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";

// UI store: hash-routed views + map state. The only route is `/`, so all
// navigation is client-side with hash deep-links (#/events/UE-2026-0001).

export type ViewId =
  | "command"
  | "map"
  | "event"
  | "investigate"
  | "responsibility"
  | "verify"
  | "report"
  | "analytics"
  | "health";

export interface MapFilters {
  status: string | "ALL";
  riskBand: "ALL" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  category: string | "ALL";
  hours: number | "ALL";
  jurisdictionId: string | "ALL";
}

export interface LayerToggles {
  events: boolean;
  hotspots: boolean;
  groundTruth: boolean;
  rainfall: boolean;
  assets: boolean;
  jurisdictions: boolean;
}

interface UiState {
  view: ViewId;
  eventId: string | null; // event code or id
  selectedEventId: string | null; // marker selection (map)
  filters: MapFilters;
  layers: LayerToggles;
  mapFocus: { lat: number; lng: number; zoom?: number; key: number } | null;
  setView: (v: ViewId) => void;
  openEvent: (codeOrId: string) => void;
  selectEvent: (id: string | null) => void;
  setFilters: (f: Partial<MapFilters>) => void;
  toggleLayer: (k: keyof LayerToggles) => void;
  setLayers: (l: Partial<LayerToggles>) => void;
  focusMap: (lat: number, lng: number, zoom?: number) => void;
}

export const useUi = create<UiState>((set) => ({
  view: "command",
  eventId: null,
  selectedEventId: null,
  mapFocus: null,
  filters: { status: "ALL", riskBand: "ALL", category: "ALL", hours: "ALL", jurisdictionId: "ALL" },
  layers: { events: true, hotspots: true, groundTruth: true, rainfall: true, assets: true, jurisdictions: true },
  setView: (v) => {
    const h = hashFor(v);
    if (typeof window !== "undefined" && window.location.hash !== h) window.location.hash = h;
    else set({ view: v });
  },
  openEvent: (codeOrId) => {
    const h = hashFor("event", codeOrId);
    if (typeof window !== "undefined" && window.location.hash !== h) window.location.hash = h;
    else set({ view: "event", eventId: codeOrId, selectedEventId: null });
  },
  selectEvent: (id) => set({ selectedEventId: id }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setLayers: (l) => set((s) => ({ layers: { ...s.layers, ...l } })),
  focusMap: (lat, lng, zoom) => set({ mapFocus: { lat, lng, zoom, key: Date.now() } }),
}));

// --- hash router -------------------------------------------------------------

export function parseHash(hash: string): { view: ViewId; eventId: string | null } {
  const clean = hash.replace(/^#\/?/, "");
  if (!clean || clean === "command") return { view: "command", eventId: null };
  const [head, param] = clean.split("/");
  const views: ViewId[] = ["command", "map", "event", "investigate", "responsibility", "verify", "report", "analytics", "health"];
  if (head === "events" && param) return { view: "event", eventId: param };
  if (views.includes(head as ViewId)) return { view: head as ViewId, eventId: param ?? null };
  return { view: "command", eventId: null };
}

export function hashFor(view: ViewId, eventId?: string | null): string {
  if (view === "event" && eventId) return `#/events/${eventId}`;
  return `#/${view === "command" ? "" : view}`;
}

/** Syncs the store to the URL hash (back button works). */
export function useHashRouter() {
  useEffect(() => {
    const apply = () => {
      const { view, eventId } = parseHash(window.location.hash);
      useUi.setState({ view, eventId: view === "event" ? eventId : null });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
}

/** Navigate by setting hash (single source of truth). */
export function navigate(view: ViewId, eventId?: string | null) {
  window.location.hash = hashFor(view, eventId);
}

// --- misc hooks ----------------------------------------------------------------

export function useClock(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
