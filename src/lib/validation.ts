import { z } from "zod";
import { CATEGORIES, SEVERITIES, EVENT_STATUSES, AGENCY_CODES, VERIFICATION_STAGES, ACTION_KINDS } from "./types";

// Input validation schemas (zod). All API boundaries validate through these.

const latSchema = z
  .number({ message: "lat must be a number" })
  .min(28.3, "Latitude outside Delhi region")
  .max(28.9, "Latitude outside Delhi region");
const lngSchema = z
  .number({ message: "lng must be a number" })
  .min(76.8, "Longitude outside Delhi region")
  .max(77.6, "Longitude outside Delhi region");

export const reportCreateSchema = z.object({
  description: z
    .string()
    .trim()
    .min(12, "Describe the issue in at least 12 characters")
    .max(600, "Description too long (max 600 characters)"),
  category: z.enum(CATEGORIES).default("WATERLOGGING"),
  severityReported: z.enum(SEVERITIES).default("MEDIUM"),
  lat: latSchema,
  lng: lngSchema,
  addressText: z.string().trim().max(160).optional(),
  channel: z.enum(["WEB", "APP", "HOTLINE"]).default("WEB"),
  reporterPhone: z
    .string()
    .trim()
    .regex(/^(\+91[- ]?)?[6-9]\d{9}$/, "Indian mobile number expected, or omit")
    .optional()
    .or(z.literal("")),
  consentGiven: z.literal(true, { message: "Consent is required to submit a report" }),
  photoDataUrl: z
    .string()
    .max(600_000, "Photo too large (max ~600KB base64)")
    .refine((v) => v.startsWith("data:image/"), "Photo must be a data URL image")
    .optional(),
  photoCaption: z.string().trim().max(120).optional(),
});

export type ReportCreateInput = z.infer<typeof reportCreateSchema>;

export const eventListQuerySchema = z.object({
  status: z.enum(EVENT_STATUSES).optional(),
  jurisdictionId: z.string().optional(),
  riskBand: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]).optional(),
  category: z.enum(CATEGORIES).optional(),
  minSeverity: z.coerce.number().int().min(1).max(5).optional(),
  hours: z.coerce.number().int().min(1).max(720).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const eventMergeSchema = z.object({
  duplicateEventId: z.string().min(1, "duplicateEventId is required"),
  rationale: z.string().trim().min(4).max(400),
});

export const assignSchema = z.object({
  agencyCode: z.enum(AGENCY_CODES),
  role: z.enum(["PRIMARY", "SUPPORT", "ESCALATION"]).default("PRIMARY"),
  note: z.string().trim().max(300).optional(),
});

export const actionCreateSchema = z.object({
  kind: z.enum(ACTION_KINDS),
  instruction: z.string().trim().min(6).max(300),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  agencyCode: z.enum(AGENCY_CODES).optional(),
  assetId: z.string().optional(),
  assignedTo: z.string().trim().max(80).optional(),
  dueHours: z.coerce.number().min(1).max(336).optional(),
});

export const actionUpdateSchema = z.object({
  status: z.enum(["ASSIGNED", "IN_PROGRESS", "COMPLETED", "FAILED"]),
  outcome: z.string().trim().max(400).optional(),
});

export const verifySchema = z.object({
  stage: z.enum(VERIFICATION_STAGES),
  observedSeverity: z.enum(SEVERITIES).optional(),
  waterDepthCm: z.coerce.number().int().min(0).max(400).optional(),
  notes: z.string().trim().max(600).optional(),
  photoDataUrl: z
    .string()
    .max(600_000, "Photo too large")
    .refine((v) => v.startsWith("data:image/"), "Photo must be a data URL image")
    .optional(),
  photoCaption: z.string().trim().max(120).optional(),
  reopenReason: z.string().trim().max(400).optional(),
});

export const aiClassifySchema = z.object({
  reportId: z.string().min(1).optional(),
  description: z.string().trim().min(12).max(600).optional(),
  severityReported: z.enum(SEVERITIES).optional(),
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
}).refine((v) => v.reportId || (v.description && v.severityReported), {
  message: "Provide reportId, or description + severityReported",
});

export const clusterSchema = z.object({
  reportIds: z.array(z.string()).min(2).max(200).optional(),
  radiusM: z.coerce.number().int().min(50).max(1000).default(150),
});

export const aiRiskSchema = z.object({
  eventId: z.string().min(1, "eventId is required"),
  provider: z.enum(["GLM", "MOCK", "RULE"]).optional(),
});

export const reportsListQuerySchema = z.object({
  status: z.enum(["RECEIVED", "TRIAGED", "MERGED", "RESOLVED"]).optional(),
  hours: z.coerce.number().int().min(1).max(720).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const weatherQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(72),
});

export const seedAdminSchema = z.object({
  confirm: z.literal(true, { message: "Pass confirm:true to reseed (destroys existing data)" }),
});
