"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MarkerClusterer, SuperClusterAlgorithm, type Cluster, type Renderer } from "@googlemaps/markerclusterer";
import { useUi } from "@/lib/client/store";
import { cn } from "@/lib/utils";
import type { MapData } from "./MapCanvas";
import { severityFill, eventPopupHTML, bindPopupDelegation } from "./map-utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * Google Maps canvas (primary engine), loaded via @googlemaps/js-api-loader
 * (modern setOptions + importLibrary functional API) with an environment
 * key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).
 *
 * Rendering contract mirrors the MapLibre fallback: severity-colored event
 * markers sized by risk, clustering with styled cluster icons, anchored
 * InfoWindows with beginner-friendly copy, jurisdiction/hotspot/ground-truth/
 * drain/weather layers, focus animation and a live location dot. All
 * listeners and overlay instances are torn down on unmount.
 *
 * Failures (script network error, auth rejection) call onFatal so the
 * orchestrator degrades honestly to the keyless MapLibre basemap.
 */

const DELHI_CENTER: [number, number] = [77.222, 28.635];

/** Calm dark "ops room" style tuned to the JalSetu basemap aesthetic. */
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#151a2b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#151a2b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7e8bab" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2b3450" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#2b3450" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#182034" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#232942" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1b2138" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2b3450" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8b96b8" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", stylers: [{ color: "#10182b" }] },
  { featureType: "landscape", stylers: [{ color: "#12172a" }] },
];

interface GoogleApi {
  maps: google.maps.MapsLibrary;
  marker: google.maps.MarkerLibrary;
  core: google.maps.CoreLibrary;
}

interface GoogleMapCanvasProps extends MapData {
  apiKey: string;
  className?: string;
  compact?: boolean;
  initialZoom?: number;
  initialCenter?: [number, number]; // [lng, lat]
  interactive?: boolean;
  onFatal: (err: unknown) => void;
}

interface OverlayGroups {
  jurisdictions: google.maps.Polygon[];
  hotspots: google.maps.Circle[];
  groundTruth: google.maps.Marker[];
  weather: google.maps.Marker[];
  drains: google.maps.Polyline[];
  assetPoints: google.maps.Marker[];
}

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

export function GoogleMapCanvas({
  apiKey,
  events,
  hotspots,
  jurisdictions,
  assets,
  weather,
  className,
  compact,
  initialZoom = 10.6,
  initialCenter = DELHI_CENTER,
  interactive = true,
  onFatal,
}: GoogleMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const apiRef = useRef<GoogleApi | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const eventMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const overlaysRef = useRef<OverlayGroups>({ jurisdictions: [], hotspots: [], groundTruth: [], weather: [], drains: [], assetPoints: [] });
  const userOverlayRef = useRef<{ marker: google.maps.Marker; circle: google.maps.Circle } | null>(null);
  const eventsRef = useRef(events);
  const unbindRef = useRef<(() => void) | null>(null);
  const reduced = useReducedMotion();
  const [readyTick, setReadyTick] = useState(0);

  const selectedEventId = useUi((s) => s.selectedEventId);
  const layers = useUi((s) => s.layers);
  const selectEvent = useUi((s) => s.selectEvent);
  const focusMap = useUi((s) => s.mapFocus);
  const openEvent = useUi((s) => s.openEvent);
  const userPos = useUi((s) => s.userPos);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // --- init ------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    setOptions({ key: apiKey, v: "weekly" });
    Promise.all([importLibrary("maps"), importLibrary("marker"), importLibrary("core")])
      .then(([maps, marker, core]) => {
        if (cancelled || !containerRef.current) return;
        apiRef.current = { maps, marker, core };

        const map = new maps.Map(containerRef.current, {
          backgroundColor: "#0a0f11",
          center: { lat: initialCenter[1], lng: initialCenter[0] },
          zoom: initialZoom,
          minZoom: 8,
          maxZoom: 17,
          styles: DARK_STYLE,
          disableDefaultUI: true,
          zoomControl: interactive,
          zoomControlOptions: { position: core.ControlPosition.RIGHT_BOTTOM },
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: interactive ? "greedy" : "none",
          draggable: interactive,
          scrollwheel: interactive,
          keyboardShortcuts: interactive,
          disableDoubleClickZoom: true,
          clickableIcons: false,
        });
        mapRef.current = map;

        infoWindowRef.current = new maps.InfoWindow({ maxWidth: 300 });

        // delegated popup actions (InfoWindow DOM lives inside the container)
        unbindRef.current = bindPopupDelegation(containerRef.current, {
          openEvent: (code) => useUi.getState().openEvent(code),
          zoomEvent: (e) => useUi.getState().focusMap(e.lat, e.lng, 15.5),
          lookup: () => eventsRef.current,
        });

        // Google auth failure hook (invalid/refused key) → honest fallback
        window.gm_authFailure = () => onFatal(new Error("Google Maps rejected the API key"));

        setReadyTick((t) => t + 1);
      })
      .catch((err) => {
        if (!cancelled) onFatal(err);
      });

    return () => {
      cancelled = true;
      const g = apiRef.current;
      unbindRef.current?.();
      unbindRef.current = null;
      if (window.gm_authFailure) delete window.gm_authFailure;
      for (const m of eventMarkersRef.current.values()) {
        if (g) g.core.event.clearInstanceListeners(m);
        m.setMap(null);
      }
      eventMarkersRef.current.clear();
      if (clustererRef.current) {
        clustererRef.current.clearMarkers();
        clustererRef.current.setMap(null);
        clustererRef.current = null;
      }
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      const ov = overlaysRef.current;
      ov.jurisdictions.forEach((o) => o.setMap(null));
      ov.hotspots.forEach((o) => o.setMap(null));
      ov.drains.forEach((o) => o.setMap(null));
      ov.groundTruth.forEach((m) => m.setMap(null));
      ov.weather.forEach((m) => m.setMap(null));
      ov.assetPoints.forEach((m) => m.setMap(null));
      ov.jurisdictions = [];
      ov.hotspots = [];
      ov.groundTruth = [];
      ov.weather = [];
      ov.drains = [];
      ov.assetPoints = [];
      if (userOverlayRef.current) {
        userOverlayRef.current.marker.setMap(null);
        userOverlayRef.current.circle.setMap(null);
        userOverlayRef.current = null;
      }
      if (mapRef.current && g) g.core.event.clearInstanceListeners(mapRef.current);
      mapRef.current = null;
      apiRef.current = null;
    };
     
  }, []);

  // --- event markers + clustering ---------------------------------------------
  useEffect(() => {
    const g = apiRef.current;
    const map = mapRef.current;
    if (!g || !map || readyTick === 0) return;

    // drop previous markers (listeners included)
    for (const m of eventMarkersRef.current.values()) {
      g.core.event.clearInstanceListeners(m);
      m.setMap(null);
    }
    eventMarkersRef.current.clear();

    if (!layers.events) {
      clustererRef.current?.clearMarkers();
      return;
    }

    const markers: google.maps.Marker[] = events.map((e) => {
      const d = Math.min(26, 16 + e.riskScore / 12);
      const m = new g.marker.Marker({
        position: { lat: e.lat, lng: e.lng },
        icon: eventIcon(g, e, false, d),
        title: `${e.code} · ${e.title} · risk ${e.riskScore} (${e.riskBand.toLowerCase()}) · ${e.reportCount} reports`,
        zIndex: 100 + Math.round(e.riskScore),
      });
      m.addListener("click", () => {
        selectEvent(e.id);
        infoWindowRef.current?.setContent(eventPopupHTML(e));
        infoWindowRef.current?.open({ map, anchor: m });
      });
      m.addListener("dblclick", () => openEvent(e.code));
      eventMarkersRef.current.set(e.id, m);
      return m;
    });

    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({
        map,
        markers,
        algorithm: new SuperClusterAlgorithm({ radius: Math.max(34, 64 - (compact ? 12 : 0)), maxZoom: 13 }),
        renderer: jalsetuClusterRenderer(g),
      });
    } else {
      clustererRef.current.clearMarkers();
      clustererRef.current.addMarkers(markers);
    }
  }, [events, readyTick, compact, layers.events, selectEvent, openEvent]);

  // --- selection highlight ------------------------------------------------------
  useEffect(() => {
    if (readyTick === 0) return;
    const g = apiRef.current;
    if (!g) return;
    for (const [id, m] of eventMarkersRef.current) {
      const ev = eventsRef.current.find((e) => e.id === id);
      if (!ev) continue;
      m.setIcon(eventIcon(g, ev, id === selectedEventId, Math.min(26, 16 + ev.riskScore / 12)));
      m.setZIndex(id === selectedEventId ? 400 : 100 + Math.round(ev.riskScore));
    }
  }, [selectedEventId, readyTick]);

  // --- static layers data --------------------------------------------------------
  function applyLayerVisibility() {
    const map = mapRef.current;
    if (!map) return;
    const ov = overlaysRef.current;
    ov.jurisdictions.forEach((o) => o.setMap(layers.jurisdictions ? map : null));
    ov.hotspots.forEach((o) => o.setMap(layers.hotspots ? map : null));
    ov.groundTruth.forEach((m) => m.setMap(layers.groundTruth ? map : null));
    ov.weather.forEach((m) => m.setMap(layers.rainfall ? map : null));
    ov.drains.forEach((o) => o.setMap(layers.assets ? map : null));
    ov.assetPoints.forEach((m) => m.setMap(layers.assets ? map : null));
  }

  useEffect(() => {
    const g = apiRef.current;
    const map = mapRef.current;
    if (!g || !map || readyTick === 0) return;
    const ov = overlaysRef.current;

    for (const o of [...ov.jurisdictions, ...ov.drains]) g.core.event.clearInstanceListeners(o);
    ov.jurisdictions.forEach((o) => o.setMap(null));
    ov.hotspots.forEach((o) => o.setMap(null));
    ov.drains.forEach((o) => o.setMap(null));
    ov.groundTruth.forEach((m) => m.setMap(null));
    ov.weather.forEach((m) => m.setMap(null));
    ov.assetPoints.forEach((m) => m.setMap(null));
    ov.jurisdictions = [];
    ov.hotspots = [];
    ov.groundTruth = [];
    ov.weather = [];
    ov.drains = [];
    ov.assetPoints = [];

    for (const j of jurisdictions ?? []) {
      const ring = (j.geometry.coordinates[0] ?? []).map(([lng, lat]) => ({ lat, lng }));
      const color = j.kind === "WARD" ? "#3b82f6" : j.kind === "CORRIDOR" ? "#60a5fa" : "#2563eb";
      const poly = new g.maps.Polygon({
        map,
        paths: ring,
        fillColor: color,
        fillOpacity: 0.05,
        strokeColor: color,
        strokeOpacity: 0.55,
        strokeWeight: 1.2,
      });
      poly.addListener("click", () => {
        window.dispatchEvent(new CustomEvent("varuna:jurisdiction-click", { detail: j.code }));
      });
      poly.addListener("mouseover", () => map.setOptions({ draggableCursor: "pointer" }));
      poly.addListener("mouseout", () => map.setOptions({ draggableCursor: "" }));
      ov.jurisdictions.push(poly);
    }

    for (const h of hotspots?.computed ?? []) {
      ov.hotspots.push(
        new g.maps.Circle({
          map,
          center: { lat: h.lat, lng: h.lng },
          radius: 160 + h.score * 3.2,
          fillColor: "#ea580c",
          fillOpacity: 0.16,
          strokeColor: "#ea580c",
          strokeOpacity: 0.4,
          strokeWeight: 1,
        })
      );
    }

    for (const gt of hotspots?.groundTruth ?? []) {
      ov.groundTruth.push(
        new g.marker.Marker({
          map,
          position: { lat: gt.lat, lng: gt.lng },
          icon: {
            url: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="none" stroke="#d97706" stroke-opacity="0.7" stroke-width="1.5"/><circle cx="9" cy="9" r="3" fill="#d97706"/></svg>`),
            scaledSize: new g.core.Size(18, 18),
            anchor: new g.core.Point(9, 9),
          },
          title: `${gt.name} · ground-truth hotspot`,
          zIndex: 60,
        })
      );
    }

    const drains: google.maps.Polyline[] = [];
    const points: google.maps.Marker[] = [];
    for (const a of assets ?? []) {
      if (a.path && (a.kind === "DRAIN" || a.kind === "ROAD_SEGMENT")) {
        drains.push(
          new g.maps.Polyline({
            map,
            path: a.path.map(([lng, lat]) => ({ lat, lng })),
            strokeColor: a.kind === "ROAD_SEGMENT" ? "#64748b" : "#2e8f85",
            strokeWeight: a.kind === "ROAD_SEGMENT" ? 1.4 : 2.2,
            strokeOpacity: 0.75,
          })
        );
      } else {
        const pump = a.kind === "PUMP_STATION";
        const d = pump ? 10 : 6;
        points.push(
          new g.marker.Marker({
            map,
            position: { lat: a.lat, lng: a.lng },
            icon: {
              url: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 1}" fill="${pump ? "#7fb8c9" : "#64748b"}" fill-opacity="0.85"/></svg>`),
              scaledSize: new g.core.Size(d, d),
              anchor: new g.core.Point(d / 2, d / 2),
            },
            title: `${a.name} · ${a.kind.toLowerCase().replace(/_/g, " ")} · ${a.agencyCode}`,
            zIndex: 50,
          })
        );
      }
    }
    ov.drains = drains;
    ov.assetPoints = points;

    for (const s of weather?.stations ?? []) {
      const scale = Math.min(2.2, 0.7 + s.totalMm / 120);
      const d = Math.round(28 * scale);
      ov.weather.push(
        new g.marker.Marker({
          map,
          position: { lat: s.lat, lng: s.lng },
          icon: {
            url: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}"><defs><radialGradient id="g"><stop offset="0%" stop-color="rgba(59,130,246,0.55)"/><stop offset="60%" stop-color="rgba(59,130,246,0.18)"/><stop offset="100%" stop-color="rgba(59,130,246,0)"/></radialGradient></defs><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="url(#g)"/></svg>`),
            scaledSize: new g.core.Size(d, d),
            anchor: new g.core.Point(d / 2, d / 2),
          },
          label: {
            text: `${Math.round(s.totalMm)}mm`,
            color: "#93a6c9",
            fontSize: "9px",
            fontFamily: "'IBM Plex Mono', monospace",
          },
          title: `${s.name} · ${Math.round(s.totalMm)}mm in window (synthetic)`,
          zIndex: 40,
        })
      );
    }

    applyLayerVisibility();
     
  }, [jurisdictions, hotspots, assets, weather, readyTick]);

  useEffect(() => {
    if (readyTick === 0) return;
    applyLayerVisibility();
     
  }, [layers, readyTick]);

  // --- focus -----------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusMap) return;
    const target = { lat: focusMap.lat, lng: focusMap.lng };
    if (reduced) {
      map.setCenter(target);
      map.setZoom(focusMap.zoom ?? 14.5);
    } else {
      map.panTo(target);
      window.setTimeout(() => map.setZoom(focusMap.zoom ?? 14.5), 60);
    }
     
  }, [focusMap?.key]);

  // --- live location -----------------------------------------------------------------
  useEffect(() => {
    const g = apiRef.current;
    const map = mapRef.current;
    if (!g || !map || !userPos || readyTick === 0) return;
    if (userOverlayRef.current) {
      userOverlayRef.current.marker.setPosition({ lat: userPos.lat, lng: userPos.lng });
      userOverlayRef.current.circle.setCenter({ lat: userPos.lat, lng: userPos.lng });
      userOverlayRef.current.circle.setRadius(Math.max(30, userPos.accuracy));
      return;
    }
    const marker = new g.marker.Marker({
      map,
      position: { lat: userPos.lat, lng: userPos.lng },
      icon: {
        url: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="#2563eb" fill-opacity="0.35"/><circle cx="9" cy="9" r="4.5" fill="#2563eb" stroke="#ffffff" stroke-width="2"/></svg>`),
        scaledSize: new g.core.Size(18, 18),
        anchor: new g.core.Point(9, 9),
      },
      title: "Your location",
      zIndex: 600,
    });
    const circle = new g.maps.Circle({
      map,
      center: { lat: userPos.lat, lng: userPos.lng },
      radius: Math.max(30, userPos.accuracy),
      fillColor: "#2563eb",
      fillOpacity: 0.1,
      strokeColor: "#2563eb",
      strokeOpacity: 0.35,
      strokeWeight: 1,
    });
    userOverlayRef.current = { marker, circle };
     
  }, [userPos?.key, readyTick]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Delhi pilot map with waterlogging events, hotspots, rainfall and infrastructure layers"
      className={cn("size-full", className)}
    />
  );
}

// --- icon builders -----------------------------------------------------------------

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n\s*/g, ""))}`;
}

function eventIcon(
  g: GoogleApi,
  e: { severity: number; status: string },
  selected: boolean,
  d: number
): google.maps.Icon {
  const color = severityFill(e.severity, e.status);
  const ring = selected ? `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 1}" fill="none" stroke="#3b82f6" stroke-width="3"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">${ring}<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - (selected ? 3.5 : 1.5)}" fill="${color}" stroke="#ffffff" stroke-width="2"/></svg>`;
  return {
    url: svgUrl(svg),
    scaledSize: new g.core.Size(d, d),
    anchor: new g.core.Point(d / 2, d / 2),
  };
}

function jalsetuClusterRenderer(g: GoogleApi): Renderer {
  return {
    render(cluster: Cluster): google.maps.Marker {
      const count = cluster.count ?? cluster.markers?.length ?? 0;
      const size = Math.min(44, 26 + Math.log2(Math.max(count, 1)) * 4);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1.5}" fill="#212942" fill-opacity="0.92" stroke="#607ac2" stroke-width="1"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#f1f5f9" font-family="'IBM Plex Mono', monospace" font-size="11">${count}</text></svg>`;
      return new g.marker.Marker({
        position: cluster.position,
        icon: {
          url: svgUrl(svg),
          scaledSize: new g.core.Size(size, size),
          anchor: new g.core.Point(size / 2, size / 2),
        },
        zIndex: 500,
      });
    },
  };
}
