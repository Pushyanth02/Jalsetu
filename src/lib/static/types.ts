// Row types for the in-browser snapshot database. They mirror prisma/schema.prisma
// field-by-field (camelCase, DateTime -> Date after revival) and add OPTIONAL
// relation fields so `include` results type-check the same way they did against
// the real Prisma client. Optional relation fields are only present when a query
// asked for them via include.

export interface AgencyRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  hotline: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface JurisdictionRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  agencyCode: string | null;
  bboxJson: string | null;
  geometryJson: string;
  centroidLat: number;
  centroidLng: number;
  areaKm2: number | null;
  pilot: boolean;
  createdAt: Date;
  // include()
  assets?: InfrastructureAssetRow[];
  events?: UrbanEventRow[];
  incidents?: HistoricalIncidentRow[];
  maintenance?: MaintenanceActionRow[];
  links?: ResponsibilityLinkRow[];
}

export interface InfrastructureAssetRow {
  id: string;
  code: string;
  kind: string;
  name: string;
  jurisdictionId: string;
  agencyCode: string;
  lat: number;
  lng: number;
  pathJson: string | null;
  conditionScore: number;
  capacityNote: string | null;
  lastInspectedAt: Date | null;
  createdAt: Date;
  // include()
  jurisdiction?: JurisdictionRow | null;
  maintenance?: MaintenanceActionRow[];
  links?: ResponsibilityLinkRow[];
  actions?: ActionItemRow[];
}

export interface WeatherObservationRow {
  id: string;
  stationCode: string;
  stationName: string;
  lat: number;
  lng: number;
  observedAt: Date;
  rainfallMm: number;
  source: string;
  createdAt: Date;
}

export interface HistoricalIncidentRow {
  id: string;
  jurisdictionId: string;
  lat: number;
  lng: number;
  occurredOn: Date;
  severity: string;
  durationHours: number | null;
  waterDepthCm: number | null;
  reportedVia: string;
  source: string;
  createdAt: Date;
}

export interface MaintenanceActionRow {
  id: string;
  assetId: string;
  jurisdictionId: string;
  agencyCode: string;
  kind: string;
  status: string;
  scheduledAt: Date;
  performedAt: Date | null;
  notes: string | null;
  source: string;
  createdAt: Date;
  // include()
  asset?: InfrastructureAssetRow | null;
  jurisdiction?: JurisdictionRow | null;
}

export interface CitizenReportRow {
  id: string;
  publicRef: string;
  description: string;
  category: string;
  severityReported: string;
  lat: number;
  lng: number;
  addressText: string | null;
  submittedAt: Date;
  channel: string;
  reporterPhone: string | null;
  consentGiven: boolean;
  status: string;
  urbanEventId: string | null;
  classificationJson: string | null;
  classificationProvider: string | null;
  classificationModel: string | null;
  classificationConfidence: number | null;
  isDuplicate: boolean;
  duplicateOfId: string | null;
  source: string;
  createdAt: Date;
  // include()
  urbanEvent?: UrbanEventRow | null;
  evidence?: EvidenceRow[];
}

export interface UrbanEventRow {
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
  firstReportedAt: Date;
  lastActivityAt: Date;
  reportCount: number;
  recurrenceCount: number;
  recurrenceWindowDays: number;
  riskScore: number;
  riskBand: string;
  riskFactorsJson: string | null;
  riskModelVersion: string | null;
  riskAssessedAt: Date | null;
  confidence: number;
  confidenceNote: string | null;
  classificationProvider: string | null;
  modelVersion: string | null;
  rainfall24hMm: number | null;
  rainfall72hMm: number | null;
  clusterKey: string | null;
  closedAt: Date | null;
  reopenedAt: Date | null;
  groundTruthHotspotId: string | null;
  groundTruthAgencyCode: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  // include()
  jurisdiction?: JurisdictionRow | null;
  reports?: CitizenReportRow[];
  evidence?: EvidenceRow[];
  links?: ResponsibilityLinkRow[];
  actions?: ActionItemRow[];
  verifications?: VerificationRow[];
  riskAssessments?: RiskAssessmentRow[];
}

export interface EvidenceRow {
  id: string;
  urbanEventId: string | null;
  reportId: string | null;
  verificationId: string | null;
  kind: string;
  caption: string | null;
  content: string;
  mediaType: string;
  capturedAt: Date;
  capturedBy: string;
  lat: number | null;
  lng: number | null;
  metadataJson: string | null;
  source: string;
  createdAt: Date;
  // include()
  urbanEvent?: UrbanEventRow | null;
  report?: CitizenReportRow | null;
  verification?: VerificationRow | null;
}

export interface ResponsibilityLinkRow {
  id: string;
  eventId: string;
  assetId: string | null;
  jurisdictionId: string;
  agencyCode: string;
  role: string;
  status: string;
  assignedAt: Date;
  reason: string | null;
  source: string;
  // include()
  event?: UrbanEventRow | null;
  asset?: InfrastructureAssetRow | null;
  jurisdiction?: JurisdictionRow | null;
}

export interface ActionItemRow {
  id: string;
  eventId: string;
  agencyCode: string | null;
  assetId: string | null;
  kind: string;
  instruction: string;
  priority: string;
  status: string;
  assignedAt: Date | null;
  dueAt: Date | null;
  completedAt: Date | null;
  assignedTo: string | null;
  outcome: string | null;
  createdAt: Date;
  // include()
  event?: UrbanEventRow | null;
  asset?: InfrastructureAssetRow | null;
}

export interface VerificationRow {
  id: string;
  eventId: string;
  stage: string;
  observedSeverity: string | null;
  waterDepthCm: number | null;
  notes: string | null;
  verifiedBy: string;
  verifiedAt: Date;
  beforeEvidenceId: string | null;
  afterEvidenceId: string | null;
  reopenReason: string | null;
  createdAt: Date;
  // include()
  event?: UrbanEventRow | null;
  evidence?: EvidenceRow[];
}

export interface RiskAssessmentRow {
  id: string;
  eventId: string;
  score: number;
  band: string;
  factorsJson: string;
  modelVersion: string;
  provider: string;
  computedAt: Date;
  // include()
  event?: UrbanEventRow | null;
}

export interface ModelRunRow {
  id: string;
  modelId: string;
  version: string;
  provider: string;
  status: string;
  inputCount: number;
  outputCount: number;
  latencyMs: number | null;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  notes: string | null;
  itemsJson: string | null;
}

export interface AuditLogRow {
  id: string;
  at: Date;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson: string | null;
  afterJson: string | null;
  note: string | null;
}

export interface HotspotRow {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  kind: string;
  score: number | null;
  method: string | null;
  evidenceJson: string | null;
  createdAt: Date;
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  agencyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SnapshotTables {
  agency: AgencyRow[];
  jurisdiction: JurisdictionRow[];
  infrastructureAsset: InfrastructureAssetRow[];
  weatherObservation: WeatherObservationRow[];
  historicalIncident: HistoricalIncidentRow[];
  maintenanceAction: MaintenanceActionRow[];
  citizenReport: CitizenReportRow[];
  urbanEvent: UrbanEventRow[];
  evidence: EvidenceRow[];
  responsibilityLink: ResponsibilityLinkRow[];
  actionItem: ActionItemRow[];
  verification: VerificationRow[];
  riskAssessment: RiskAssessmentRow[];
  modelRun: ModelRunRow[];
  auditLog: AuditLogRow[];
  hotspot: HotspotRow[];
  user: UserRow[];
}

export interface SnapshotFile {
  meta: {
    generatedAt: string;
    dataset: string;
    license: string;
    provenance: string;
    notOfficial: string;
  };
  tables: Record<keyof SnapshotTables, Record<string, unknown>[]>;
}
