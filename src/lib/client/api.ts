// Typed API client for the frontend. In the static (GitHub Pages) deployment
// there is no server: every request is served by the in-browser API shim
// (src/lib/static/router.ts) against the committed demo snapshot. The public
// surface (apiGet/apiPost/apiPut, ApiClientError, shared view types) is
// unchanged, so views need zero modifications.

import { staticApi } from "@/lib/static/router";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init?: RequestInit & { role?: string }
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const { role, method, body } = init ?? {};
  let parsedBody: unknown;
  if (typeof body === "string") {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = body;
    }
  } else if (body && typeof body === "object") {
    parsedBody = body;
  }
  const methodUpper = (method ?? "GET").toUpperCase();
  const res = await staticApi(path, { method: methodUpper, body: parsedBody, role });
  const envelope = res.envelope;
  if (!envelope.ok) {
    throw new ApiClientError(res.status, envelope.error.code, envelope.error.message, envelope.error.details);
  }
  return { data: envelope.data as T, meta: envelope.meta };
}

export const apiGet = <T>(path: string) => api<T>(path, { method: "GET" });
export const apiPost = <T>(path: string, body?: unknown, role?: string) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), role });
export const apiPut = <T>(path: string, body?: unknown, role?: string) =>
  api<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body), role });

// --- shared view types --------------------------------------------------------

export interface EventSummary {
  id: string;
  code: string;
  title: string;
  category: string;
  status: string;
  severity: number;
  lat: number;
  lng: number;
  locationText: string;
  jurisdictionId: string | null;
  agencyCode: string | null;
  firstReportedAt: string;
  lastActivityAt: string;
  reportCount: number;
  recurrenceCount: number;
  riskScore: number;
  riskBand: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  riskModelVersion: string | null;
  riskAssessedAt: string | null;
  confidence: number;
  confidenceNote: string | null;
  classificationProvider: string | null;
  modelVersion: string | null;
  rainfall24hMm: number | null;
  rainfall72hMm: number | null;
  closedAt: string | null;
  reopenedAt: string | null;
  groundTruthHotspotId: string | null;
  source: string;
}

export interface OverviewResponse {
  generatedAt: string;
  counts: {
    activeEvents: number;
    highRisk: number;
    unresolved: number;
    awaitingResponse: number;
    inField: number;
    verified: number;
    reopened: number;
    totalEvents: number;
  };
  rainfall: {
    pilot24hMm: number;
    pilot72hMm: number;
    nearestStation: { code: string; name: string; distanceM: number } | null;
    latestObservedAt: string | null;
    dataLabel: string;
  };
  events: EventSummary[];
  alerts: { severity: string; message: string; eventCode?: string }[];
  responseByAgency: { code: string; name: string; active: number; verified: number; highRisk: number }[];
  recentVerifications: { id: string; stage: string; verifiedAt: string; verifiedBy: string; notes: string | null }[];
  pilot: {
    jurisdictions: { id: string; code: string; name: string; kind: string; centroid: { lat: number; lng: number } }[];
    groundTruthHotspots: number;
  };
  ai: { provider: string; modelId: string; available: boolean; configuredBy: string };
  dataLabel: string;
}

export interface WeatherResponse {
  stations: {
    code: string;
    name: string;
    lat: number;
    lng: number;
    totalMm: number;
    avgMmPer3h: number;
    latestObservedAt: string | null;
    dataLabel: string;
  }[];
  series: { stationCode: string; t: string; mm: number }[];
  windowHours: number;
}

export interface HotspotResponse {
  computed: {
    code: string;
    name: string;
    lat: number;
    lng: number;
    score: number;
    method: string;
    eventCount: number;
    topEventCode?: string;
    dataLabel: string;
  }[];
  groundTruth: {
    code: string;
    name: string;
    lat: number;
    lng: number;
    radiusM: number;
    dataLabel: string;
    evidence: Record<string, unknown>;
  }[];
}

export interface JurisdictionResponse {
  id: string;
  code: string;
  name: string;
  kind: string;
  agencyCode: string | null;
  pilot: boolean;
  centroid: { lat: number; lng: number };
  geometry: { type: string; coordinates: number[][][] };
  dataLabel: string;
}

export interface AssetResponse {
  id: string;
  code: string;
  kind: string;
  name: string;
  agencyCode: string;
  lat: number;
  lng: number;
  conditionScore: number;
  lastInspectedAt: string | null;
  path: number[][] | null;
  jurisdiction: { code: string; name: string };
  dataLabel: string;
}
