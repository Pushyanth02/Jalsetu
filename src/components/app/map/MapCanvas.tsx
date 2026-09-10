"use client";

import { useEffect, useRef } from "react";
import { Map as MlMap, Marker, NavigationControl, LngLat, type StyleSpecification } from "maplibre-gl";
import Supercluster from "supercluster";
import { useUi } from "@/lib/client/store";
import { cn } from "@/lib/utils";
import type { EventSummary, HotspotResponse, JurisdictionResponse, AssetResponse, WeatherResponse } from "@/lib/client/api";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import "maplibre-gl/dist/maplibre-gl.css";

// Real MapLibre GL rendering: raster dark basemap (CARTO/OSM, no API key),
// GeoJSON layers for jurisdictions/drain/hotspots, HTML markers for events
// with supercluster clustering, weather stations sized by rainfall.

const DELHI_CENTER: [number, number] = [77.222, 28.635];

// Esri World Dark Gray Canvas: keyless dark basemap (z/y/x tile order),
// plus the Reference overlay for place labels. Calm, desaturated, fits the
// control-room aesthetic. Fallback background keeps the map usable offline.
export const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "esri-dark-base": {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Source: Esri, HERE, Garmin, FAO, NOAA, USGS | © OpenStreetMap contributors",
    },
    "esri-dark-labels": {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#0a0f11" } },
    { id: "basemap", type: "raster", source: "esri-dark-base", paint: { "raster-opacity": 0.9, "raster-brightness-max": 0.72 } },
    { id: "basemap-labels", type: "raster", source: "esri-dark-labels", paint: { "raster-opacity": 0.85 } },
  ],
};

function severityFill(sev: number, status: string): string {
  if (status === "VERIFIED" || status === "CLOSED") return "#5c7076";
  if (sev >= 4) return "#dc2626";
  if (sev === 3) return "#ea580c";
  if (sev === 2) return "#d97706";
  return "#64748b";
}

export interface MapData {
  events: EventSummary[];
  hotspots?: HotspotResponse;
  jurisdictions?: JurisdictionResponse[];
  assets?: AssetResponse[];
  weather?: WeatherResponse;
}

interface MapCanvasProps extends MapData {
  className?: string;
  compact?: boolean; // smaller UI for embeds
  initialZoom?: number;
  initialCenter?: [number, number]; // [lng, lat]
  interactive?: boolean;
}

export function MapCanvas({ events, hotspots, jurisdictions, assets, weather, className, compact, initialZoom = 10.6, initialCenter = DELHI_CENTER, interactive = true }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const clusterIndexRef = useRef<Supercluster | null>(null);
  const clusterMarkersRef = useRef<Map<number, Marker>>(new Map());
  const selectedRef = useRef<string | null>(null);
  const eventsRef = useRef<EventSummary[]>(events);
  const renderRef = useRef<() => void>(() => {});
  const weatherRenderRef = useRef<((w?: WeatherResponse) => void)>(() => {});
  const reduced = useReducedMotion();

  const selectedEventId = useUi((s) => s.selectedEventId);
  const layers = useUi((s) => s.layers);
  const selectEvent = useUi((s) => s.selectEvent);
  const focusMap = useUi((s) => s.mapFocus);
  const openEvent = useUi((s) => s.openEvent);

  // keep latest values accessible to imperative map code (refs written in effects)
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  useEffect(() => {
    selectedRef.current = selectedEventId;
  }, [selectedEventId]);

  // --- init map ---------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MlMap({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: { compact: true },
      interactive,
      maxZoom: 16,
      minZoom: 8.5,
    });
    mapRef.current = map;
    if (interactive) {
      map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    }

    const onMove = () => renderRef.current();
    map.on("moveend", onMove);
    map.on("load", () => {
      addStaticLayers(map);
      renderRef.current();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      clusterMarkersRef.current.clear();
    };
     
  }, []);

  // --- events data → cluster index ---------------------------------------------
  useEffect(() => {
    const index = new Supercluster({
      radius: Math.max(34, 64 - (compact ? 12 : 0)),
      maxZoom: 13,
      minPoints: 2,
    });
    index.load(
      events.map((e) => ({
        type: "Feature" as const,
        properties: { cluster: false, eventId: e.id },
        geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] },
      }))
    );
    clusterIndexRef.current = index;
    renderRef.current();
  }, [events]);

  // --- selection highlight ------------------------------------------------------
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      const el = marker.getElement();
      el.classList.toggle("is-selected", id === selectedEventId);
      el.setAttribute("aria-pressed", String(id === selectedEventId));
    }
  }, [selectedEventId]);

  // --- layer visibility -----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const setVisible = (ids: string[], on: boolean) =>
      ids.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      });
    setVisible(["jurisdictions-fill", "jurisdictions-line", "jurisdictions-outline"], layers.jurisdictions);
    setVisible(["hotspot-heat", "hotspot-circles"], layers.hotspots);
    setVisible(["gt-halos", "gt-circles"], layers.groundTruth);
    setVisible(["drain-lines", "asset-points", "pump-points"], layers.assets);
  }, [layers]);

  // --- static geojson data ----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    setGeoJson(map, "jurisdictions", jurisdictionsToGeo(jurisdictions ?? []));
    setGeoJson(map, "hotspots", hotspotsToGeo(hotspots?.computed ?? []));
    setGeoJson(map, "groundtruth", gtToGeo(hotspots?.groundTruth ?? []));
    const { drains, points } = assetsToGeo(assets ?? []);
    setGeoJson(map, "drains", drains);
    setGeoJson(map, "assets", points);
    weatherRenderRef.current(weather);
     
  }, [jurisdictions, hotspots, assets, weather]);

  // --- focus -----------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusMap) return;
    const target: [number, number] = [focusMap.lng, focusMap.lat];
    const opts = { zoom: focusMap.zoom ?? 14.5, center: target, duration: reduced ? 0 : 1200 };
    if (reduced) map.jumpTo(opts);
    else map.flyTo(opts);
     
  }, [focusMap?.key]);

  // --- event marker rendering (clustered) --------------------------------------------
  function renderEventMarkers() {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const index = clusterIndexRef.current;
    const current = eventsRef.current;
    const byId = new Map(current.map((e) => [e.id, e]));

    // clear clusters
    for (const marker of clusterMarkersRef.current.values()) marker.remove();
    clusterMarkersRef.current.clear();

    if (index) {
      const bounds = map.getBounds().toArray().flat() as [number, number, number, number];
      const zoom = Math.round(map.getZoom());
      const clusters = index.getClusters(bounds, zoom) as unknown as {
        properties: { cluster?: boolean; cluster_id?: number; point_count?: number };
        geometry: { coordinates: [number, number] };
      }[];
      for (const c of clusters) {
        if (!c.properties.cluster) continue;
        const id = c.properties.cluster_id!;
        const count = c.properties.point_count!;
        const el = document.createElement("button");
        el.className = "cluster-marker";
        const size = Math.min(44, 26 + Math.log2(count) * 4);
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.textContent = String(count);
        el.setAttribute("aria-label", `${count} events clustered, zoom in to expand`);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const expansion = index.getClusterExpansionZoom(id);
          map.easeTo({
            center: c.geometry.coordinates,
            zoom: Math.min(expansion, 16),
            duration: reduced ? 0 : 500,
          });
        });
        const marker = new Marker({ element: el }).setLngLat(c.geometry.coordinates).addTo(map);
        clusterMarkersRef.current.set(id, marker);
      }
    }

    // individual event markers (only unclustered)
    const zoom = Math.round(map.getZoom());
    const clusteredIds = new Set<string>();
    if (index) {
      const bounds = map.getBounds().toArray().flat() as [number, number, number, number];
      for (const c of index.getClusters(bounds, zoom) as unknown as {
        properties: { cluster?: boolean; cluster_id?: number; point_count?: number };
        geometry: { coordinates: [number, number] };
      }[]) {
        if (!c.properties.cluster) continue;
        const leaves = index.getLeaves(c.properties.cluster_id!, 200) as unknown as {
          properties: { eventId: string };
        }[];
        for (const leaf of leaves) clusteredIds.add(leaf.properties.eventId);
      }
    }

    const visible = new Set<string>();
    for (const e of current) {
      if (clusteredIds.has(e.id)) continue;
      // skip off-screen
      const ll = new LngLat(e.lng, e.lat);
      if (!map.getBounds().contains(ll)) continue;
      visible.add(e.id);
      let marker = markersRef.current.get(e.id);
      if (!marker) {
        const el = document.createElement("button");
        el.className = "event-marker";
        el.setAttribute("aria-label", "Open event details");
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          selectEvent(e.id);
        });
        el.addEventListener("dblclick", (ev) => {
          ev.stopPropagation();
          openEvent(e.code);
        });
        marker = new Marker({ element: el, anchor: "center" }).setLngLat([e.lng, e.lat]).addTo(map);
        markersRef.current.set(e.id, marker);
      } else {
        marker.setLngLat([e.lng, e.lat]);
      }
      const el = marker.getElement();
      const color = severityFill(e.severity, e.status);
      el.style.background = color;
      el.style.width = el.style.height = `${Math.min(26, 16 + e.riskScore / 12)}px`;
      el.setAttribute(
        "aria-label",
        `${e.code}, ${e.title}, risk ${e.riskScore} ${e.riskBand.toLowerCase()}, ${e.reportCount} reports. Activate to select, double-activate to open.`
      );
      el.classList.toggle("is-selected", e.id === selectedRef.current);
      el.classList.toggle("is-recurrence", e.recurrenceCount > 0);
    }
    // remove stale
    for (const [id, marker] of markersRef.current) {
      if (!visible.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }

  function renderWeatherMarker(station: WeatherResponse["stations"][number]) {
    const map = mapRef.current;
    if (!map) return;
    const el = document.createElement("div");
    el.className = "station-marker";
    const scale = Math.min(2.2, 0.7 + station.totalMm / 120);
    el.innerHTML = `<div style="width:${28 * scale}px;height:${28 * scale}px;border-radius:999px;background:radial-gradient(circle, rgba(59,130,246,0.55) 0%, rgba(59,130,246,0.2) 55%, transparent 70%);display:grid;place-items:center;position:relative">
      <span style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-family:var(--font-plex-mono),monospace;font-size:9px;color:#93a6c9;white-space:nowrap" class="st-label">${Math.round(station.totalMm)}mm</span>
    </div>`;
    el.title = `${station.name} - ${station.totalMm}mm in window (synthetic)`;
    const marker = new Marker({ element: el, anchor: "center" }).setLngLat([station.lng, station.lat]).addTo(map);
    stationMarkersRef.current.set(station.code, marker);
  }

  const stationMarkersRef = useRef<Map<string, Marker>>(new Map());
  function renderWeatherMarkers(weather?: WeatherResponse) {
    for (const m of stationMarkersRef.current.values()) m.remove();
    stationMarkersRef.current.clear();
    if (!weather || !mapRef.current) return;
    for (const s of weather.stations) renderWeatherMarker(s);
  }

  return <div ref={containerRef} role="application" aria-label="Delhi pilot map with waterlogging events, hotspots, rainfall and infrastructure layers" className={cn("size-full", className)} />;
}

// --- GeoJSON builders -------------------------------------------------------------

function setGeoJson(map: MlMap, sourceId: string, data: GeoJSON.FeatureCollection) {
  const src = map.getSource(sourceId) as import("maplibre-gl").GeoJSONSource | undefined;
  if (src) src.setData(data);
}

function jurisdictionsToGeo(js: JurisdictionResponse[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: js.map((j) => ({
      type: "Feature" as const,
      properties: { code: j.code, name: j.name, kind: j.kind },
      geometry: { type: "Polygon" as const, coordinates: j.geometry.coordinates },
    })),
  };
}

function hotspotsToGeo(hs: HotspotResponse["computed"]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: hs.map((h) => ({
      type: "Feature" as const,
      properties: { score: h.score, name: h.name, code: h.code },
      geometry: { type: "Point" as const, coordinates: [h.lng, h.lat] },
    })),
  };
}

function gtToGeo(gt: HotspotResponse["groundTruth"]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: gt.map((h) => ({
      type: "Feature" as const,
      properties: { name: h.name, code: h.code },
      geometry: { type: "Point" as const, coordinates: [h.lng, h.lat] },
    })),
  };
}

function assetsToGeo(assets: AssetResponse[]): {
  drains: GeoJSON.FeatureCollection;
  points: GeoJSON.FeatureCollection;
} {
  const drainFeatures: GeoJSON.Feature[] = [];
  const pointFeatures: GeoJSON.Feature[] = [];
  for (const a of assets) {
    if (a.path && (a.kind === "DRAIN" || a.kind === "ROAD_SEGMENT")) {
      drainFeatures.push({
        type: "Feature",
        properties: { code: a.code, name: a.name, kind: a.kind, agency: a.agencyCode, condition: a.conditionScore },
        geometry: { type: "LineString", coordinates: a.path },
      });
    } else {
      pointFeatures.push({
        type: "Feature",
        properties: { code: a.code, name: a.name, kind: a.kind, agency: a.agencyCode, condition: a.conditionScore },
        geometry: { type: "Point", coordinates: [a.lng, a.lat] },
      });
    }
  }
  return {
    drains: { type: "FeatureCollection", features: drainFeatures },
    points: { type: "FeatureCollection", features: pointFeatures },
  };
}

function addStaticLayers(map: MlMap) {
  // jurisdictions
  map.addSource("jurisdictions", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "jurisdictions-fill",
    type: "fill",
    source: "jurisdictions",
    paint: {
      "fill-color": ["match", ["get", "kind"], "WARD", "#3b82f6", "CORRIDOR", "#60a5fa", "#2563eb"],
      "fill-opacity": 0.05,
    },
  });
  map.addLayer({
    id: "jurisdictions-line",
    type: "line",
    source: "jurisdictions",
    paint: {
      "line-color": ["match", ["get", "kind"], "WARD", "#3b82f6", "CORRIDOR", "#60a5fa", "#2563eb"],
      "line-width": 1.2,
      "line-opacity": 0.55,
      "line-dasharray": [3, 2],
    },
  });

  // computed hotspots: heatmap + circles
  map.addSource("hotspots", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "hotspot-heat",
    type: "heatmap",
    source: "hotspots",
    layout: { visibility: "visible" },
    paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["get", "score"], 0, 0, 60, 0.6, 100, 1],
      "heatmap-intensity": 0.9,
      "heatmap-radius": 42,
      "heatmap-opacity": 0.55,
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0, "rgba(0,0,0,0)",
        0.2, "#1e3a8a",
        0.4, "#1d4ed8",
        0.6, "#3b82f6",
        0.8, "#f59e0b",
        1, "#dc2626",
      ],
    },
  });
  map.addLayer({
    id: "hotspot-circles",
    type: "circle",
    source: "hotspots",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "score"], 30, 4, 60, 7, 100, 11],
      "circle-color": "#ea580c",
      "circle-stroke-color": "#0a0f11",
      "circle-stroke-width": 1,
      "circle-opacity": 0.9,
    },
  });

  // ground truth hotspots: halo + dot
  map.addSource("groundtruth", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "gt-halos",
    type: "circle",
    source: "groundtruth",
    paint: {
      "circle-radius": 16,
      "circle-color": "transparent",
      "circle-stroke-color": "#d97706",
      "circle-stroke-width": 1.2,
      "circle-stroke-opacity": 0.7,
    },
  });
  map.addLayer({
    id: "gt-circles",
    type: "circle",
    source: "groundtruth",
    paint: {
      "circle-radius": 3,
      "circle-color": "#d97706",
    },
  });

  // infrastructure: drains (lines) + point assets
  map.addSource("drains", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "drain-lines",
    type: "line",
    source: "drains",
    paint: {
      "line-color": ["case", ["==", ["get", "kind"], "ROAD_SEGMENT"], "#64748b", "#2e8f85"],
      "line-width": ["case", ["==", ["get", "kind"], "ROAD_SEGMENT"], 1.4, 2.2],
      "line-opacity": 0.75,
    },
  });
  map.addSource("assets", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "asset-points",
    type: "circle",
    source: "assets",
    filter: ["!in", "kind", "PUMP_STATION"],
    paint: {
      "circle-radius": 3,
      "circle-color": "#64748b",
      "circle-stroke-color": "#0a0f11",
      "circle-stroke-width": 0.8,
      "circle-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "pump-points",
    type: "circle",
    source: "assets",
    filter: ["==", ["get", "kind"], "PUMP_STATION"],
    paint: {
      "circle-radius": 5,
      "circle-color": "#7fb8c9",
      "circle-stroke-color": "#0a0f11",
      "circle-stroke-width": 1,
    },
  });

  // clickable jurisdiction polygons → spatial filter
  map.on("click", "jurisdictions-fill", (e) => {
    const props = e.features?.[0]?.properties as { code: string } | undefined;
    if (props) {
      window.dispatchEvent(new CustomEvent("varuna:jurisdiction-click", { detail: props.code }));
    }
  });
  map.on("mouseenter", "jurisdictions-fill", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "jurisdictions-fill", () => (map.getCanvas().style.cursor = ""));
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
