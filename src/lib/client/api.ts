// Typed API client for the frontend. All requests are relative-path,
// envelope-aware, and expose honest error information.

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

type Envelope<T> = { ok: true; data: T; meta?: Record<string, unknown> } | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function api<T>(path: string, init?: RequestInit & { role?: string }): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const { role, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (role) headers["x-demo-role"] = role;
  if (rest.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(path, { ...rest, headers });
  let json: Envelope<T>;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiClientError(res.status, "BAD_RESPONSE", `Non-JSON response (${res.status})`);
  }
  if (!json.ok) {
    throw new ApiClientError(res.status, json.error.code, json.error.message, json.error.details);
  }
  return { data: json.data, meta: json.meta };
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
