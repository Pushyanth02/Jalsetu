"use client";

import type { EventSummary } from "@/lib/client/api";

/**
 * Shared map utilities used by BOTH map engines (Google Maps + MapLibre
 * fallback): severity colors, plain-language status/risk copy, anchored
 * InfoWindow HTML, geodesic circles and nearest-event math.
 *
 * The popup HTML uses literal Tailwind classes on purpose: Tailwind v4's
 * source scanner picks them up from this file, so injected foreign-DOM
 * popups still match the design system.
 */

// --- severity + status colors --------------------------------------------------

export function severityFill(sev: number, status: string): string {
  if (status === "VERIFIED" || status === "CLOSED") return "#64748b";
  if (sev >= 4) return "#dc2626";
  if (sev === 3) return "#ea580c";
  if (sev === 2) return "#d97706";
  return "#64748b";
}

/** Beginner-friendly status wording (demystifies ops vocabulary). */
export const STATUS_PLAIN: Record<string, string> = {
  DETECTED: "Just Detected",
  TRIAGED: "Under Review",
  ASSIGNED: "Crew Assigned",
  IN_PROGRESS: "Field Crews On Site",
  VERIFIED: "Verified Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened After Closure",
};

const STATUS_HEX: Record<string, string> = {
  DETECTED: "#2563eb",
  TRIAGED: "#64748b",
  ASSIGNED: "#d97706",
  IN_PROGRESS: "#ea580c",
  VERIFIED: "#059669",
  CLOSED: "#64748b",
  REOPENED: "#dc2626",
};

/** Plain-language explanation of what a risk band means for a commuter. */
export const RISK_PLAIN: Record<string, string> = {
  LOW: "Minor ponding. Walking and two-wheelers may slow down. No detour needed right now.",
  MODERATE: "Standing water deep enough to trouble cars. Allow extra travel time and avoid the lowest stretch of the road.",
  HIGH: "Deep water on the road. Cars can stall and underpasses may close. Plan a different route.",
  CRITICAL: "Severe flooding. This stretch is unsafe for all vehicles. Avoid the area until crews clear it.",
};

const RISK_HEX: Record<string, string> = {
  LOW: "#64748b",
  MODERATE: "#d97706",
  HIGH: "#ea580c",
  CRITICAL: "#dc2626",
};

// --- time + distance helpers ---------------------------------------------------

export function timeAgoText(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Haversine distance in metres. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p;
  const dLng = (lng2 - lng1) * p;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestEvent(
  events: EventSummary[],
  lat: number,
  lng: number
): { event: EventSummary; distanceM: number } | null {
  let best: { event: EventSummary; distanceM: number } | null = null;
  for (const e of events) {
    const d = haversineM(lat, lng, e.lat, e.lng);
    if (!best || d < best.distanceM) best = { event: e, distanceM: d };
  }
  return best;
}

/** Geodesic circle polygon ring ([lng, lat] pairs) around a point. */
export function latLngCircle(lat: number, lng: number, radiusM: number, steps = 64): [number, number][] {
  const R = 6_378_137;
  const p = Math.PI / 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 360 * p;
    const delta = radiusM / R;
    const phi1 = lat * p;
    const lambda1 = lng * p;
    const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(bearing));
    const lambda2 =
      lambda1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(delta) * Math.cos(phi1),
        Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
      );
    coords.push([lambda2 / p, phi2 / p]);
  }
  return coords;
}

// --- InfoWindow HTML -------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Anchored marker popup (InfoWindow) content shared by both map engines.
 * Buttons use data attributes handled by delegated listeners on the map
 * container, so both Google InfoWindows and MapLibre Popups behave the same.
 */
export function eventPopupHTML(e: EventSummary, now = Date.now()): string {
  const statusHex = STATUS_HEX[e.status] ?? "#64748b";
  const statusPlain = STATUS_PLAIN[e.status] ?? e.status.toLowerCase().replace(/_/g, " ");
  const riskHex = RISK_HEX[e.riskBand] ?? "#64748b";
  const riskPlain = RISK_PLAIN[e.riskBand] ?? "";
  const updated = e.lastActivityAt ? timeAgoText(e.lastActivityAt, now) : "unknown";

  return `
<div class="w-[264px] p-3.5 font-sans" role="dialog" aria-label="Event ${escapeHtml(e.code)} summary">
  <div class="flex items-center gap-1.5 flex-wrap">
    <span class="data-mono text-[0.7rem] font-semibold" style="color:#2563eb">${escapeHtml(e.code)}</span>
    <span class="rounded-full px-2 py-0.5 text-[0.58rem] font-semibold tracking-wide uppercase" style="color:${statusHex};background:${statusHex}14;border:1px solid ${statusHex}33">${statusPlain}</span>
    <span class="rounded-full px-2 py-0.5 text-[0.58rem] font-semibold tracking-wide uppercase" style="color:${riskHex};background:${riskHex}14;border:1px solid ${riskHex}33">${e.riskBand} RISK</span>
  </div>
  <h3 class="mt-1.5 text-[0.82rem] font-semibold leading-snug text-slate-900">${escapeHtml(e.title)}</h3>
  <p class="mt-0.5 text-[0.66rem] text-slate-500 leading-snug">${escapeHtml(e.locationText)}</p>
  <p class="mt-2 text-[0.66rem] leading-relaxed text-slate-600"><span class="font-semibold text-slate-700">What this means:</span> ${riskPlain}</p>
  <p class="mt-2 text-[0.62rem] text-slate-500 leading-snug">${e.reportCount} citizen report${e.reportCount === 1 ? "" : "s"} · updated ${updated}</p>
  <div class="mt-3 flex gap-2">
    <button type="button" data-open-event="${escapeHtml(e.code)}" class="flex-1 rounded-lg text-white text-[0.65rem] font-semibold tracking-wide py-2" style="background:#2563eb">Open Full Dossier</button>
    <button type="button" data-zoom-event="${escapeHtml(e.code)}" class="rounded-lg border border-slate-200 text-slate-600 px-3 py-2 text-[0.65rem] font-medium" title="Zoom to this location">Zoom</button>
  </div>
</div>`.trim();
}

/**
 * Delegated popup actions on a map container element. Both engines inject
 * their InfoWindow DOM inside the map container, so one listener covers it.
 */
export function bindPopupDelegation(
  root: HTMLElement,
  handlers: {
    openEvent: (code: string) => void;
    zoomEvent: (e: EventSummary) => void;
    lookup: () => EventSummary[];
  }
): () => void {
  const onClick = (ev: Event) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const open = target.closest<HTMLElement>("[data-open-event]");
    if (open?.dataset.openEvent) {
      handlers.openEvent(open.dataset.openEvent);
      return;
    }
    const zoom = target.closest<HTMLElement>("[data-zoom-event]");
    if (zoom?.dataset.zoomEvent) {
      const code = zoom.dataset.zoomEvent;
      const found = handlers.lookup().find((e) => e.code === code);
      if (found) handlers.zoomEvent(found);
    }
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}
