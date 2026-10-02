"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MlMap, Marker, Popup, NavigationControl, LngLat, type StyleSpecification } from "maplibre-gl";
import Supercluster from "supercluster";
import { useUi } from "@/lib/client/store";
import { cn } from "@/lib/utils";
import type { EventSummary, HotspotResponse, JurisdictionResponse, AssetResponse, WeatherResponse } from "@/lib/client/api";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { severityFill, eventPopupHTML, bindPopupDelegation, latLngCircle } from "./map-utils";
import { PALETTE } from "@/lib/palette";
import "maplibre-gl/dist/maplibre-gl.css";

// Keyless MapLibre GL fallback engine: raster dark basemap (Esri, no API key),
// GeoJSON layers for jurisdictions/drain/hotspots, HTML markers for events
// with supercluster clustering, weather stations sized by rainfall, anchored
// InfoWindow popups and a live location dot. Contract-compatible with the
// Google Maps primary engine.

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
    { id: "background", type: "background", paint: { "background-color": PALETTE.canvas } },
    { id: "basemap", type: "raster", source: "esri-dark-base", paint: { "raster-opacity": 0.9, "raster-brightness-max": 0.72 } },
    { id: "basemap-labels", type: "raster", source: "esri-dark-labels", paint: { "raster-opacity": 0.85 } },
  ],
};

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
  const unbindPopupRef = useRef<(() => void) | null>(null);
  const reduced = useReducedMotion();

  const selectedEventId = useUi((s) => s.selectedEventId);
  const layers = useUi((s) => s.layers);
  const selectEvent = useUi((s) => s.selectEvent);
  const focusMap = useUi((s) => s.mapFocus);
  const openEvent = useUi((s) => s.openEvent);
  const userPos = useUi((s) => s.userPos);
  const popupRef = useRef<Popup | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const [styleReady, setStyleReady] = useState(false);

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
      setStyleReady(true);
      renderRef.current();
    });

    unbindPopupRef.current = bindPopupDelegation(containerRef.current, {
      openEvent: (code) => useUi.getState().openEvent(code),
      zoomEvent: (e) => useUi.getState().focusMap(e.lat, e.lng, 15.5),
      lookup: () => eventsRef.current,
    });

    return () => {
      unbindPopupRef.current?.();
      unbindPopupRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
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

  // --- markers re-render whenever data or style readiness changes -----------------
  // (data frequently resolves BEFORE the tile style finishes loading, so the
  // 'load' event flips styleReady and this effect re-renders everything)
  useEffect(() => {
    if (!styleReady) return;
    renderRef.current();
  }, [styleReady, events, compact]);

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
    if (!map || !styleReady) return;
    const setVisible = (ids: string[], on: boolean) =>
      ids.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      });
    setVisible(["jurisdictions-fill", "jurisdictions-line", "jurisdictions-outline"], layers.jurisdictions);
    setVisible(["hotspot-heat", "hotspot-circles"], layers.hotspots);
    setVisible(["gt-halos", "gt-circles"], layers.groundTruth);
    setVisible(["drain-lines", "asset-points", "pump-points"], layers.assets);
  }, [layers, styleReady]);

  // --- static geojson data ----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    setGeoJson(map, "jurisdictions", jurisdictionsToGeo(jurisdictions ?? []));
    setGeoJson(map, "hotspots", hotspotsToGeo(hotspots?.computed ?? []));
    setGeoJson(map, "groundtruth", gtToGeo(hotspots?.groundTruth ?? []));
    const { drains, points } = assetsToGeo(assets ?? []);
    setGeoJson(map, "drains", drains);
    setGeoJson(map, "assets", points);
    weatherRenderRef.current(weather);
     
  }, [jurisdictions, hotspots, assets, weather, styleReady]);

  // --- focus -----------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusMap) return;
    const target: [number, number] = [focusMap.lng, focusMap.lat];
    const opts = { zoom: focusMap.zoom ?? 14.5, center: target, duration: reduced ? 0 : 1200 };
    if (reduced) map.jumpTo(opts);
    else map.flyTo(opts);
     
  }, [focusMap?.key]);

  // --- live location ------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userPos || !styleReady) return;
    const src = map.getSource("user-accuracy") as import("maplibre-gl").GeoJSONSource | undefined;
    if (src) {
      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [latLngCircle(userPos.lat, userPos.lng, Math.max(30, userPos.accuracy))] },
          },
        ],
      });
    }
    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "user-dot";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "Your current location");
      userMarkerRef.current = new Marker({ element: el, anchor: "center" })
        .setLngLat([userPos.lng, userPos.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userPos.lng, userPos.lat]);
    }
  }, [userPos?.key, styleReady]);

  // --- event marker rendering (clustered) --------------------------------------------
  function renderEventMarkers() {
    const map = mapRef.current;
    if (!map) return;
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
          openPopupFor(e);
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

  /** Anchored InfoWindow popup (MapLibre Popup) for an event marker. */
  function openPopupFor(e: EventSummary) {
    const map = mapRef.current;
    if (!map) return;
    popupRef.current?.remove();
    const popup = new Popup({ closeButton: true, closeOnClick: true, offset: 14, maxWidth: "300px" })
      .setLngLat([e.lng, e.lat])
      .setHTML(eventPopupHTML(e))
      .addTo(map);
    popupRef.current = popup;
    popup.once("close", () => {
      if (popupRef.current === popup) popupRef.current = null;
    });
  }

  function renderWeatherMarker(station: WeatherResponse["stations"][number]) {
    const map = mapRef.current;
    if (!map) return;
    const el = document.createElement("div");
    el.className = "station-marker";
    const scale = Math.min(2.2, 0.7 + station.totalMm / 120);
    el.innerHTML = `<div style="width:${28 * scale}px;height:${28 * scale}px;border-radius:999px;background:radial-gradient(circle, ${PALETTE.aqua}8c 0%, ${PALETTE.aqua}33 55%, transparent 70%);display:grid;place-items:center;position:relative">
      <span style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-family:var(--font-plex-mono),monospace;font-size:9px;color:${PALETTE.textMuted};white-space:nowrap" class="st-label">${Math.round(station.totalMm)}mm</span>
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

  // latest-ref bindings: keep the imperative renderers addressable from the
  // map 'load'/'moveend' listeners and data effects (re-bound every render
  // so closures always see current events/filters).
  useEffect(() => {
    renderRef.current = renderEventMarkers;
    weatherRenderRef.current = renderWeatherMarkers;
  });

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
      "fill-color": ["match", ["get", "kind"], "WARD", PALETTE.aquaMid, "CORRIDOR", PALETTE.aquaDim, PALETTE.aqua],
      "fill-opacity": 0.05,
    },
  });
  map.addLayer({
    id: "jurisdictions-line",
    type: "line",
    source: "jurisdictions",
    paint: {
      "line-color": ["match", ["get", "kind"], "WARD", PALETTE.aquaMid, "CORRIDOR", PALETTE.aquaDim, PALETTE.aqua],
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
        0.2, PALETTE.aquaDeep,
        0.4, PALETTE.aquaMid,
        0.6, PALETTE.aqua,
        0.8, PALETTE.sevModerate,
        1, PALETTE.sevCritical,
      ],
    },
  });
  map.addLayer({
    id: "hotspot-circles",
    type: "circle",
    source: "hotspots",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "score"], 30, 4, 60, 7, 100, 11],
      "circle-color": PALETTE.sevHigh,
      "circle-stroke-color": PALETTE.canvas,
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
      "circle-stroke-color": PALETTE.sevModerate,
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
      "circle-color": PALETTE.sevModerate,
    },
  });

  // infrastructure: drains (lines) + point assets
  map.addSource("drains", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "drain-lines",
    type: "line",
    source: "drains",
    paint: {
      "line-color": ["case", ["==", ["get", "kind"], "ROAD_SEGMENT"], PALETTE.textFaint, PALETTE.aqua],
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
      "circle-color": PALETTE.textFaint,
      "circle-stroke-color": PALETTE.canvas,
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
      "circle-color": PALETTE.aquaDim,
      "circle-stroke-color": PALETTE.canvas,
      "circle-stroke-width": 1,
    },
  });

  // user accuracy circle
  map.addSource("user-accuracy", { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "user-accuracy-fill",
    type: "fill",
    source: "user-accuracy",
    paint: { "fill-color": PALETTE.aqua, "fill-opacity": 0.1 },
  });
  map.addLayer({
    id: "user-accuracy-line",
    type: "line",
    source: "user-accuracy",
    paint: { "line-color": PALETTE.aqua, "line-opacity": 0.35, "line-width": 1 },
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
