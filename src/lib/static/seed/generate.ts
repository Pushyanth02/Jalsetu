import { mdb } from "../db";
import { Rng, hashSeed } from "@/lib/rng";
import { jitter, pointInPolygon, distanceM } from "@/lib/geo";
import { AGENCIES, ASSETS, DESCRIPTIONS, HOTSPOTS, JURISDICTIONS, STATIONS, type HotspotDef } from "./delhi";
import { syntheticPhoto } from "./photo";
import { ingestReport } from "../engine/pipeline";
import { audit, finishModelRun, startModelRun, toJson } from "../instrument";
import type { ReportCreateInput } from "@/lib/validation";
import type { Severity } from "@/lib/types";

// Port of src/lib/seed/generate.ts (read-only server reference) for the static,
// database-free deployment. Changes beyond the import swaps (db → mdb,
// @/lib/engine/pipeline → ../engine/pipeline, @/lib/json → ../instrument):
//   - prisma schema @default(...) values are set explicitly on every create
//     (the static db applies no schema defaults), and nullable columns the
//     source left to Prisma are materialized as null so regenerated rows keep
//     the exact column shape of the committed snapshot;
//   - classification during seeding runs through the deterministic MockProvider
//     (the source passed forceMockProvider anyway), so provider labels read
//     "MOCK" - the honest static behaviour.
// Business logic, loops, RNG seeding and the honest SYNTHETIC_DEMO labels are
// otherwise verbatim. Row ids / public refs come from the static db's random
// generator (the Prisma seed used cuid()) - data content, ordering and counts
// are deterministic for a fixed clock.

// Deterministic Delhi pilot seed. Structure is stable (fixed PRNG seed);
// timestamps are anchored to execution time so freshness metrics stay live.
// EVERYTHING here is labelled SYNTHETIC_DEMO.

const SEED = 20351;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function ringOf(j: (typeof JURISDICTIONS)[number]) {
  return j.ring.map(([lng, lat]) => [lng, lat] as [number, number]);
}

function insideAnyJurisdiction(p: { lat: number; lng: number }) {
  return JURISDICTIONS.some((j) =>
    pointInPolygon(p, [ringOf(j)])
  );
}

function minutesAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60_000);
}

export async function wipeDatabase() {
  // delete in FK-safe order
  await mdb.evidence.deleteMany();
  await mdb.verification.deleteMany();
  await mdb.actionItem.deleteMany();
  await mdb.responsibilityLink.deleteMany();
  await mdb.riskAssessment.deleteMany();
  await mdb.citizenReport.deleteMany();
  await mdb.urbanEvent.deleteMany();
  await mdb.hotspot.deleteMany();
  await mdb.maintenanceAction.deleteMany();
  await mdb.historicalIncident.deleteMany();
  await mdb.weatherObservation.deleteMany();
  await mdb.infrastructureAsset.deleteMany();
  await mdb.jurisdiction.deleteMany();
  await mdb.agency.deleteMany();
  await mdb.modelRun.deleteMany();
  await mdb.auditLog.deleteMany();
  await mdb.user.deleteMany();
}

export async function seedDatabase(): Promise<{ reports: number; events: number; observations: number }> {
  const rng = new Rng(SEED);
  await wipeDatabase();

  const runId = await startModelRun({
    modelId: "pipeline",
    version: "seed-1.0",
    provider: "MOCK",
    inputCount: 0,
    notes: "Deterministic seed generation (synthetic demo data)",
  });

  // --- agencies & jurisdictions ---------------------------------------------
  for (const a of AGENCIES) {
    await mdb.agency.create({ data: { code: a.code, name: a.name, kind: a.kind, hotline: a.hotline, notes: a.notes, createdAt: new Date() } }); // prisma @default(now()) translated
  }
  const jurisdictionIds = new Map<string, string>();
  for (const j of JURISDICTIONS) {
    const ring = ringOf(j);
    const created = await mdb.jurisdiction.create({
      data: {
        code: j.code,
        name: j.name,
        kind: j.kind,
        agencyCode: j.agencyCode,
        geometryJson: JSON.stringify([ring]),
        centroidLat: ring.reduce((s, r) => s + r[1], 0) / ring.length,
        centroidLng: ring.reduce((s, r) => s + r[0], 0) / ring.length,
        pilot: true,
        bboxJson: null, // prisma nullable column materialized (mdb has no schema defaults)
        areaKm2: null, // prisma nullable column materialized
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    jurisdictionIds.set(j.code, created.id);
    jurisdictionIdMap.set(j.code, created.id);
  }

  // --- assets + maintenance ---------------------------------------------------
  const assetIds = new Map<string, string>();
  for (const a of ASSETS) {
    const created = await mdb.infrastructureAsset.create({
      data: {
        code: a.code,
        kind: a.kind,
        name: a.name,
        jurisdictionId: jurisdictionIds.get(a.jurisdiction)!,
        agencyCode: a.agencyCode,
        lat: a.lat,
        lng: a.lng,
        pathJson: a.path ? JSON.stringify(a.path) : null,
        conditionScore: a.condition,
        lastInspectedAt: new Date(Date.now() - rng.int(20, 200) * DAY),
        capacityNote: null, // prisma nullable column materialized
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    assetIds.set(a.code, created.id);

    const profile = a.maintenanceProfile;
    if (profile === "RECENT") {
      await mdb.maintenanceAction.create({
        data: {
          assetId: created.id,
          jurisdictionId: jurisdictionIds.get(a.jurisdiction)!,
          agencyCode: a.agencyCode,
          kind: a.kind === "PUMP_STATION" ? "PUMP_SERVICE" : "DESILTING",
          status: "COMPLETED",
          scheduledAt: new Date(Date.now() - 75 * DAY),
          performedAt: new Date(Date.now() - rng.int(55, 70) * DAY),
          notes: "Pre-monsoon desilting completed; silt removed and outfall verified.",
          source: "SYNTHETIC_DEMO",
          createdAt: new Date(), // prisma @default(now()) translated
        },
      });
    } else if (profile === "OVERDUE") {
      await mdb.maintenanceAction.create({
        data: {
          assetId: created.id,
          jurisdictionId: jurisdictionIds.get(a.jurisdiction)!,
          agencyCode: a.agencyCode,
          kind: a.kind === "PUMP_STATION" ? "PUMP_SERVICE" : "DESILTING",
          status: "COMPLETED",
          scheduledAt: new Date(Date.now() - 450 * DAY),
          performedAt: new Date(Date.now() - rng.int(400, 440) * DAY),
          notes: "Desilting done last year; pre-monsoon round pending this season.",
          source: "SYNTHETIC_DEMO",
          createdAt: new Date(), // prisma @default(now()) translated
        },
      });
    } else if (profile === "IN_PROGRESS") {
      await mdb.maintenanceAction.create({
        data: {
          assetId: created.id,
          jurisdictionId: jurisdictionIds.get(a.jurisdiction)!,
          agencyCode: a.agencyCode,
          kind: "PUMP_SERVICE",
          status: "IN_PROGRESS",
          scheduledAt: new Date(Date.now() - 5 * DAY),
          performedAt: null, // prisma nullable column materialized
          notes: "Pump overhaul in progress; one of two pumps operational.",
          source: "SYNTHETIC_DEMO",
          createdAt: new Date(), // prisma @default(now()) translated
        },
      });
      // historical record so gap computation sees the previous service
      await mdb.maintenanceAction.create({
        data: {
          assetId: created.id,
          jurisdictionId: jurisdictionIds.get(a.jurisdiction)!,
          agencyCode: a.agencyCode,
          kind: "PUMP_SERVICE",
          status: "COMPLETED",
          scheduledAt: new Date(Date.now() - 400 * DAY),
          performedAt: new Date(Date.now() - 395 * DAY),
          notes: "Annual pump service completed last season.",
          source: "SYNTHETIC_DEMO",
          createdAt: new Date(), // prisma @default(now()) translated
        },
      });
    }
  }

  // --- weather: 96h of 3-hourly synthetic observations ------------------------
  // Monsoon storm: peak centred ~36h ago, σ ≈ 10h, plus diurnal convective noise.
  const stormPeak = Date.now() - 36 * HOUR;
  const obsCount = await generateWeather(rng, stormPeak);

  // --- historical incidents ---------------------------------------------------
  await generateHistoricalIncidents(rng);

  // --- ground truth hotspots --------------------------------------------------
  for (const h of HOTSPOTS) {
    await mdb.hotspot.create({
      data: {
        code: h.code,
        name: h.name,
        lat: h.lat,
        lng: h.lng,
        radiusM: 250,
        kind: "GROUND_TRUTH",
        method: "seed",
        evidenceJson: toJson({
          note: "Known flood-prone location in the synthetic pilot scenario",
          historicalIncidents: "see HistoricalIncident rows",
          jurisdiction: h.jurisdiction,
          groundTruthAgency: h.groundTruthAgency,
        }),
        score: null, // prisma nullable column materialized
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
  }

  // --- timeline: citizen reports ingested through the REAL engine -------------
  const timeline = buildReportTimeline(rng);

  let reports = 0;
  for (const item of timeline.items) {
    await ingestReport(item.input, "CITIZEN", {
      at: item.at,
      forceMockProvider: true,
      source: "SYNTHETIC_DEMO",
    });
    reports += 1;
  }

  // --- post-seed processing: ground-truth links + case shaping ----------------
  const events = await mdb.urbanEvent.findMany();
  for (const e of events) {
    const h = nearestHotspot({ lat: e.lat, lng: e.lng });
    if (h && distanceM({ lat: e.lat, lng: e.lng }, h) <= 160) {
      await mdb.urbanEvent.update({
        where: { id: e.id },
        data: { groundTruthHotspotId: h.code, groundTruthAgencyCode: h.groundTruthAgency },
      });
    }
  }

  // conflicting-evidence / low-confidence cases
  const conflictEvent = events.find((e) => distanceM({ lat: e.lat, lng: e.lng }, { lat: 28.7085, lng: 77.1912 }) < 120);
  if (conflictEvent) {
    await mdb.urbanEvent.update({
      where: { id: conflictEvent.id },
      data: {
        confidence: 0.38,
        confidenceNote:
          "Conflicting severity evidence across citizen reports (CRITICAL vs LOW at same location). Flagged for field verification.",
      },
    });
    await audit({
      actor: "SYSTEM",
      action: "CONFIDENCE_FLAGGED",
      entityType: "UrbanEvent",
      entityId: conflictEvent.id,
      note: "conflicting evidence",
    });
  }

  // --- verification workflow progression on selected events -------------------
  const byHotspot = new Map<string, typeof events>();
  for (const e of await mdb.urbanEvent.findMany()) {
    if (!e.groundTruthHotspotId) continue;
    const list = byHotspot.get(e.groundTruthHotspotId) ?? [];
    list.push(e);
    byHotspot.set(e.groundTruthHotspotId, list);
  }
  const pickEvent = (code: string) => {
    const list = byHotspot.get(code) ?? [];
    return list.sort((a, b) => b.reportCount - a.reportCount)[0] ?? null;
  };

  // 1) BKS Marg: full lifecycle → verified → closed (then recurrence report below)
  const bks = pickEvent("HS-MR-02");
  if (bks) {
    await progressLifecycle(bks.id, {
      assignedAt: 50 ,
      dispatchedAt: 48 ,
      observedAt: 46 ,
      evidenceAt: 45 ,
      actionAt: 42 ,
      verifiedAt: 40 ,
      closedAt: 38 ,
      depthCm: 22,
      label: "Baba Kharak Singh Marg",
    });
  }
  // 2) Barapullah outfall: full lifecycle → closed, no recurrence
  const brp = pickEvent("HS-ITO-02");
  if (brp) {
    await progressLifecycle(brp.id, {
      assignedAt: 44 ,
      dispatchedAt: 42 ,
      observedAt: 40 ,
      evidenceAt: 39 ,
      actionAt: 34 ,
      verifiedAt: 30 ,
      closedAt: 28 ,
      depthCm: 35,
      label: "Barapullah outfall",
    });
  }
  // 3) Minto Road underpass: mid-flight IN_PROGRESS with field evidence
  const minto = pickEvent("HS-MR-01");
  if (minto) {
    await progressLifecycle(minto.id, {
      assignedAt: 26 ,
      dispatchedAt: 24 ,
      observedAt: 20 ,
      evidenceAt: 18 ,
      label: "Minto Road underpass",
      depthCm: 40,
    });
  }
  // 4) Model Town underpass: assigned only
  const mt = pickEvent("HS-MT-01");
  if (mt) {
    await progressLifecycle(mt.id, { assignedAt: 14 , label: "Model Town underpass" });
  }
  // 5) ITO crossing: assigned + dispatched
  const ito = pickEvent("HS-ITO-01");
  if (ito) {
    await progressLifecycle(ito.id, { assignedAt: 10 , dispatchedAt: 8 , label: "ITO crossing" });
  }

  // --- recurrence after closure: BKS Marg re-reported ~6h ago ------------------
  if (bks) {
    await ingestReport(
      {
        description: "Water is back on the same stretch after tonight's rain. Drain blocked again, similar level as last week.",
        category: "WATERLOGGING",
        severityReported: "HIGH",
        lat: 28.6329 + rng.float(-0.0004, 0.0004),
        lng: 77.2196 + rng.float(-0.0004, 0.0004),
        addressText: "Baba Kharak Singh Marg",
        channel: "APP",
        consentGiven: true,
      },
      "CITIZEN",
      { at: new Date(Date.now() - 6 * HOUR), forceMockProvider: true, source: "SYNTHETIC_DEMO" }
    );
    reports += 1;
  }

  const finalEvents = await mdb.urbanEvent.findMany();
  await finishModelRun(runId, {
    status: "SUCCEEDED",
    outputCount: finalEvents.length,
    inputCount: reports,
    latencyMs: 0,
    notes: `seeded ${reports} reports → ${finalEvents.length} events, ${obsCount} weather observations`,
  });
  await audit({
    actor: "SYSTEM",
    action: "SEED_COMPLETED",
    entityType: "System",
    entityId: "seed",
    after: { reports, events: finalEvents.length, observations: obsCount },
    note: "Synthetic demo dataset generated deterministically",
  });

  return { reports, events: finalEvents.length, observations: obsCount };
}

// --- weather -----------------------------------------------------------------

async function generateWeather(rng: Rng, stormPeak: number): Promise<number> {
  let count = 0;
  const slots: number[] = [];
  for (let t = Date.now() - 96 * HOUR; t <= Date.now(); t += 3 * HOUR) slots.push(t);
  for (const s of STATIONS) {
    const stationRng = new Rng(hashSeed(s.code));
    for (const t of slots) {
      const dt = (t - stormPeak) / HOUR;
      const storm = 26 * s.amplitude * Math.exp(-(dt * dt) / (2 * 10 * 10));
      const diurnal = 3.5 * s.amplitude * Math.max(0, Math.sin(((t / HOUR) % 24) / 24 * 2 * Math.PI - Math.PI / 2));
      const noise = stationRng.float(0, 2.2);
      const rainfall = Math.max(0, +(storm + diurnal * 0.3 + noise).toFixed(1));
      await mdb.weatherObservation.create({
        data: {
          stationCode: s.code,
          stationName: s.name,
          lat: s.lat,
          lng: s.lng,
          observedAt: new Date(t),
          rainfallMm: rainfall,
          source: "SYNTHETIC_DEMO",
          createdAt: new Date(), // prisma @default(now()) translated
        },
      });
      count += 1;
    }
  }
  return count;
}

async function generateHistoricalIncidents(rng: Rng) {
  for (const h of HOTSPOTS) {
    const n = rng.int(4, 7);
    for (let i = 0; i < n; i++) {
      const year = rng.int(new Date().getFullYear() - 5, new Date().getFullYear() - 1);
      const month = rng.int(6, 9);
      const day = rng.int(1, 28);
      const p = jitter({ lat: h.lat, lng: h.lng }, 90, () => rng.float(0, 1));
      await mdb.historicalIncident.create({
        data: {
          jurisdictionId: jurisdictionIdFor(h.jurisdiction)!,
          lat: p.lat,
          lng: p.lng,
          occurredOn: new Date(Date.UTC(year, month - 1, day, 9, 30)),
          severity: rng.weighted([
            ["LOW", 1],
            ["MODERATE", 2],
            ["HIGH", 3],
            ["CRITICAL", 2],
          ] as [string, number][]),
          durationHours: rng.float(2, 11),
          waterDepthCm: rng.int(15, 80),
          reportedVia: rng.weighted([
            ["MEDIA", 2],
            ["AGENCY", 1],
            ["HOTLINE", 1],
          ] as [string, number][]),
          source: "SYNTHETIC_DEMO",
          createdAt: new Date(), // prisma @default(now()) translated
        },
      });
    }
  }
  // background incidents away from hotspots
  const noise = new Rng(hashSeed("incidents-noise"));
  let placed = 0;
  let guard = 0;
  while (placed < 26 && guard < 400) {
    guard += 1;
    const p = {
      lat: noise.float(28.61, 28.71),
      lng: noise.float(77.185, 77.26),
    };
    if (!insideAnyJurisdiction(p)) continue;
    if (nearestHotspot(p) && distanceM(p, nearestHotspot(p)!) < 350) continue;
    const j = JURISDICTIONS.find((x) => pointInPolygon(p, [ringOf(x)]))!;
    await mdb.historicalIncident.create({
      data: {
        jurisdictionId: jurisdictionIdFor(j.code)!,
        lat: p.lat,
        lng: p.lng,
        occurredOn: new Date(Date.UTC(noise.int(new Date().getFullYear() - 5, new Date().getFullYear() - 1), noise.int(6, 9), noise.int(1, 28), 9, 30)),
        severity: noise.weighted([
          ["LOW", 3],
          ["MODERATE", 2],
          ["HIGH", 1],
        ] as [string, number][]),
        durationHours: noise.float(1, 5),
        waterDepthCm: noise.int(5, 30),
        reportedVia: "HOTLINE",
        source: "SYNTHETIC_DEMO",
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    placed += 1;
  }
}

// --- report timeline ----------------------------------------------------------

interface TimelineItem {
  at: Date;
  input: ReportCreateInput;
}

function buildReportTimeline(rng: Rng): { items: TimelineItem[] } {
  const items: TimelineItem[] = [];
  const HOUR_ = HOUR;

  const push = (
    at: Date,
    h: HotspotDef,
    text: string,
    severity: Severity,
    category: string,
    photo: boolean
  ) => {
    const p = jitter({ lat: h.lat, lng: h.lng }, 70, () => rng.float(0, 1));
    const input: ReportCreateInput = {
      description: text,
      category: category as ReportCreateInput["category"],
      severityReported: severity,
      lat: p.lat,
      lng: p.lng,
      addressText: h.name,
      channel: rng.weighted([["APP", 2], ["WEB", 2], ["HOTLINE", 1]] as [string, number][]) as ReportCreateInput["channel"],
      consentGiven: true,
    };
    if (photo) {
      input.photoDataUrl = syntheticPhoto({
        kind: "citizen",
        label: h.name,
        timeLabel: new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      });
      input.photoCaption = "Citizen photo (synthetic)";
    }
    items.push({ at, input });
  };

  // complaint-light hotspots: structurally vulnerable but under-reported this
  // window (the core research case where frequency-only methods fail)
  const LIGHT = new Set(["HS-MT-02", "HS-ITO-02"]);

  for (const h of HOTSPOTS) {
    const texts = DESCRIPTIONS[h.profile];
    const cat = categoryForProfile(h.profile);
    if (LIGHT.has(h.code)) {
      // complaint-light structurally-vulnerable spot: 1-2 reports only;
      // risk must come from infrastructure + history, not complaint volume
      if (h.code === "HS-ITO-02") {
        push(new Date(Date.now() - rng.float(30, 33) * HOUR_), h, texts[1], "CRITICAL", cat, false);
        push(new Date(Date.now() - rng.float(8, 14) * HOUR_), h, texts[3], "HIGH", cat, false);
      } else {
        push(new Date(Date.now() - rng.float(30, 34) * HOUR_), h, texts[rng.int(0, texts.length - 1)], "MEDIUM", cat, false);
      }
      continue;
    }
    // wave 1: pre-storm (T-70h)
    push(new Date(Date.now() - (70 + rng.float(-2, 2)) * HOUR_), h, texts[rng.int(0, texts.length - 1)], "MEDIUM", cat, rng.bool(0.2));
    // wave 2: storm peak (T-38..T-28h)
    const wave2 = h.profile === "UNDERPASS" ? 5 : 4;
    for (let i = 0; i < wave2; i++) {
      const at = new Date(Date.now() - rng.float(28, 38) * HOUR_);
      const sev: Severity = rng.weighted([["HIGH", 3], ["CRITICAL", 2]] as [Severity, number][]);
      push(at, h, texts[rng.int(0, texts.length - 1)], sev, cat, rng.bool(0.45));
    }
    // wave 3: aftermath (T-22..T-10h)
    push(new Date(Date.now() - rng.float(10, 22) * HOUR_), h, texts[rng.int(0, texts.length - 1)], rng.bool(0.5) ? "HIGH" : "MEDIUM", cat, rng.bool(0.3));
  }

  // conflicting-evidence pair at Alipur Road (HS-MT-02): CRITICAL vs LOW
  const mt2 = HOTSPOTS[1];
  push(new Date(Date.now() - 33 * HOUR_), mt2, "Knee-deep water on the low stretch, autos stuck, water entering shops.", "CRITICAL", "WATERLOGGING", true);
  push(new Date(Date.now() - 30 * HOUR_), mt2, "Small puddle on the side of the road, mostly dried now, not a big issue I think.", "LOW", "WATERLOGGING", false);

  // low-confidence ambiguous report near ITO
  push(
    new Date(Date.now() - 31 * HOUR_),
    HOTSPOTS[4],
    "Not sure, maybe some water collected near the signal, could not see clearly from the bus.",
    "MEDIUM",
    "WATERLOGGING",
    false
  );

  // complaint magnets: busy visible spots, many minor reports, structurally sound
  const MAGNETS: { name: string; lat: number; lng: number; texts: string[]; n: number }[] = [
    {
      name: "GTB Nagar market approach",
      lat: 28.7008, lng: 77.2038,
      texts: [
        "Water patch at the market corner, autos going around it. Lots of people, minor nuisance only.",
        "Small puddle near the market gate, footpath edge. Crowd walking around it.",
        "Shallow water at the approach road, shopkeepers sweeping it away. Not deep.",
        "Some water collected near the metro exit, many commuters, but it is only ankle deep.",
      ],
      n: 4,
    },
    {
      name: "Pragati Maidan metro gate",
      lat: 28.6121, lng: 77.2471,
      texts: [
        "Puddle outside the metro gate, commuters hopping over it. Minor issue.",
        "Water near the gate after rain, metro staff putting boards. Shallow.",
        "Footpath wet with a small collection of water near gate 3, crowded but manageable.",
      ],
      n: 3,
    },
  ];
  for (const m of MAGNETS) {
    for (let i = 0; i < m.n; i++) {
      const p = jitter({ lat: m.lat, lng: m.lng }, 45, () => rng.float(0, 1));
      items.push({
        at: new Date(Date.now() - rng.float(6, 40) * HOUR_),
        input: {
          description: m.texts[i % m.texts.length],
          category: "WATERLOGGING",
          severityReported: rng.bool(0.6) ? "LOW" : "MEDIUM",
          lat: p.lat,
          lng: p.lng,
          addressText: m.name,
          channel: rng.pick(["WEB", "APP"] as const),
          consentGiven: true,
        },
      });
    }
  }

  // noise reports away from hotspots
  const noiseRng = new Rng(hashSeed("noise-reports"));
  let placed = 0;
  let guard = 0;
  while (placed < 13 && guard < 300) {
    guard += 1;
    const p = { lat: noiseRng.float(28.61, 28.715), lng: noiseRng.float(77.185, 77.262) };
    if (!insideAnyJurisdiction(p)) continue;
    const nh = nearestHotspot(p);
    if (nh && distanceM(p, nh) < 400) continue;
    const j = JURISDICTIONS.find((x) => pointInPolygon(p, [ringOf(x)]))!;
    const isPothole = noiseRng.bool(0.3);
    const texts = isPothole ? DESCRIPTIONS.NOISE_POTHOLE : DESCRIPTIONS.NOISE_MINOR;
    items.push({
      at: new Date(Date.now() - noiseRng.float(4, 60) * HOUR_),
      input: {
        description: texts[noiseRng.int(0, texts.length - 1)],
        category: isPothole ? "POTHOLE" : "WATERLOGGING",
        severityReported: noiseRng.weighted([["LOW", 3], ["MEDIUM", 2]] as [Severity, number][]),
        lat: p.lat,
        lng: p.lng,
        addressText: j.name.split("(")[0].trim(),
        channel: noiseRng.pick(["WEB", "APP"] as const),
        consentGiven: true,
      },
    });
    placed += 1;
  }

  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { items };
}

function categoryForProfile(profile: string): string {
  switch (profile) {
    case "DRAIN_OUTFALL":
      return "DRAIN_OVERFLOW";
    default:
      return "WATERLOGGING";
  }
}

// --- lifecycle progression ----------------------------------------------------

interface LifecycleTimes {
  assignedAt?: number; // hours ago
  dispatchedAt?: number;
  observedAt?: number;
  evidenceAt?: number;
  actionAt?: number;
  verifiedAt?: number;
  closedAt?: number;
  depthCm?: number;
  label: string;
}

async function progressLifecycle(eventId: string, t: LifecycleTimes) {
  const rng = new Rng(hashSeed(eventId));
  const unit = rng.pick(["PWD Field Unit C-2 (JE: R. Mehra)", "NDMC Field Team 4 (AE: S. Kaushik)", "MCD Drain Squad N-7 (JE: A. Bisht)", "I&FC Outfall Crew 3 (AE: D. Chandra)"]);

  if (t.assignedAt != null) {
    await mdb.actionItem.updateMany({
      where: { eventId, status: "RECOMMENDED" },
      data: { status: "ASSIGNED", assignedAt: minutesAgo(t.assignedAt * 60), assignedTo: unit },
    });
    await mdb.verification.create({
      data: {
        eventId,
        stage: "ASSIGNED",
        notes: `Actions assigned to ${unit}.`,
        verifiedBy: "AGENCY",
        verifiedAt: minutesAgo(t.assignedAt * 60),
        observedSeverity: null, // prisma nullable column materialized
        waterDepthCm: null, // prisma nullable column materialized
        beforeEvidenceId: null, // prisma nullable column materialized
        afterEvidenceId: null, // prisma nullable column materialized
        reopenReason: null, // prisma nullable column materialized
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    await mdb.urbanEvent.update({ where: { id: eventId }, data: { status: "ASSIGNED" } });
    await audit({ actor: "AGENCY", action: "ACTIONS_ASSIGNED", entityType: "UrbanEvent", entityId: eventId, note: unit });
  }
  if (t.dispatchedAt != null) {
    await mdb.verification.create({
      data: {
        eventId,
        stage: "DISPATCHED",
        notes: `Field team dispatched from depot; ETA 40 min (moderate traffic).`,
        verifiedBy: "AGENCY",
        verifiedAt: minutesAgo(t.dispatchedAt * 60),
        observedSeverity: null, // prisma nullable column materialized
        waterDepthCm: null, // prisma nullable column materialized
        beforeEvidenceId: null, // prisma nullable column materialized
        afterEvidenceId: null, // prisma nullable column materialized
        reopenReason: null, // prisma nullable column materialized
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    await audit({ actor: "AGENCY", action: "TEAM_DISPATCHED", entityType: "UrbanEvent", entityId: eventId });
  }
  if (t.observedAt != null) {
    await mdb.verification.create({
      data: {
        eventId,
        stage: "OBSERVED",
        observedSeverity: t.depthCm && t.depthCm > 30 ? "HIGH" : "MEDIUM",
        waterDepthCm: t.depthCm,
        notes: `Standing water ~${t.depthCm ?? 20}cm. Drain intake partially blocked; pumping required.`,
        verifiedBy: "FIELD_TEAM",
        verifiedAt: minutesAgo(t.observedAt * 60),
        beforeEvidenceId: null, // prisma nullable column materialized
        afterEvidenceId: null, // prisma nullable column materialized
        reopenReason: null, // prisma nullable column materialized
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    await mdb.urbanEvent.update({ where: { id: eventId }, data: { status: "IN_PROGRESS" } });
    await audit({ actor: "FIELD_TEAM", action: "FIELD_OBSERVED", entityType: "UrbanEvent", entityId: eventId, after: { depthCm: t.depthCm } });
  }
  if (t.evidenceAt != null) {
    const ev = await mdb.evidence.create({
      data: {
        urbanEventId: eventId,
        kind: "FIELD_PHOTO",
        caption: `Before intervention: ${t.label}`,
        content: syntheticPhoto({
          kind: "field-before",
          label: t.label,
          depthCm: t.depthCm,
          timeLabel: minutesAgo(t.evidenceAt * 60).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
        }),
        capturedBy: "FIELD_TEAM",
        capturedAt: minutesAgo(t.evidenceAt * 60),
        reportId: null, // prisma nullable column materialized
        verificationId: null, // prisma nullable column materialized
        lat: null, // prisma nullable column materialized
        lng: null, // prisma nullable column materialized
        metadataJson: null, // prisma nullable column materialized
        mediaType: "image/svg", // prisma @default("image/svg") translated
        source: "SYNTHETIC_DEMO", // prisma @default("SYNTHETIC_DEMO") translated
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    await mdb.verification.create({
      data: {
        eventId,
        stage: "EVIDENCE_UPLOADED",
        notes: "Field photo uploaded (synthetic evidence).",
        verifiedBy: "FIELD_TEAM",
        verifiedAt: minutesAgo(t.evidenceAt * 60),
        beforeEvidenceId: ev.id,
        observedSeverity: null, // prisma nullable column materialized
        waterDepthCm: null, // prisma nullable column materialized
        afterEvidenceId: null, // prisma nullable column materialized
        reopenReason: null, // prisma nullable column materialized
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    await audit({ actor: "FIELD_TEAM", action: "EVIDENCE_UPLOADED", entityType: "UrbanEvent", entityId: eventId, after: { evidenceId: ev.id } });
  }
  if (t.actionAt != null) {
    const ev = await mdb.evidence.create({
      data: {
        urbanEventId: eventId,
        kind: "FIELD_PHOTO",
        caption: `After intervention: ${t.label}`,
        content: syntheticPhoto({
          kind: "field-after",
          label: t.label,
          timeLabel: minutesAgo(t.actionAt * 60).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
        }),
        capturedBy: "FIELD_TEAM",
        capturedAt: minutesAgo(t.actionAt * 60),
        reportId: null, // prisma nullable column materialized
        verificationId: null, // prisma nullable column materialized
        lat: null, // prisma nullable column materialized
        lng: null, // prisma nullable column materialized
        metadataJson: null, // prisma nullable column materialized
        mediaType: "image/svg", // prisma @default("image/svg") translated
        source: "SYNTHETIC_DEMO", // prisma @default("SYNTHETIC_DEMO") translated
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    await mdb.actionItem.updateMany({
      where: { eventId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
      data: { status: "COMPLETED", completedAt: minutesAgo(t.actionAt * 60), outcome: "Desilted intake; pumped out standing water; road cleared and verified dry." },
    });
    await mdb.verification.create({
      data: {
        eventId,
        stage: "ACTION_RECORDED",
        notes: "Desilting and pumping completed; discharge verified.",
        verifiedBy: "FIELD_TEAM",
        verifiedAt: minutesAgo(t.actionAt * 60),
        afterEvidenceId: ev.id,
        observedSeverity: null, // prisma nullable column materialized
        waterDepthCm: null, // prisma nullable column materialized
        beforeEvidenceId: null, // prisma nullable column materialized
        reopenReason: null, // prisma nullable column materialized
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    await audit({ actor: "FIELD_TEAM", action: "ACTION_RECORDED", entityType: "UrbanEvent", entityId: eventId });
  }
  if (t.verifiedAt != null) {
    await mdb.verification.create({
      data: {
        eventId,
        stage: "VERIFIED",
        observedSeverity: "LOW",
        waterDepthCm: 0,
        notes: "Re-visit confirms water cleared; drain flowing. Closure approved.",
        verifiedBy: "FIELD_TEAM",
        verifiedAt: minutesAgo(t.verifiedAt * 60),
        beforeEvidenceId: null, // prisma nullable column materialized
        afterEvidenceId: null, // prisma nullable column materialized
        reopenReason: null, // prisma nullable column materialized
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    await mdb.urbanEvent.update({ where: { id: eventId }, data: { status: "VERIFIED" } });
    await audit({ actor: "FIELD_TEAM", action: "VERIFIED", entityType: "UrbanEvent", entityId: eventId });
  }
  if (t.closedAt != null) {
    await mdb.verification.create({
      data: {
        eventId,
        stage: "CLOSED",
        notes: "Event closed after verification. Recurrence watch active (30 days).",
        verifiedBy: "AGENCY",
        verifiedAt: minutesAgo(t.closedAt * 60),
        observedSeverity: null, // prisma nullable column materialized
        waterDepthCm: null, // prisma nullable column materialized
        beforeEvidenceId: null, // prisma nullable column materialized
        afterEvidenceId: null, // prisma nullable column materialized
        reopenReason: null, // prisma nullable column materialized
        createdAt: new Date(), // prisma @default(now()) translated
      },
    });
    await mdb.urbanEvent.update({ where: { id: eventId }, data: { status: "CLOSED", closedAt: minutesAgo(t.closedAt * 60) } });
    await mdb.actionItem.updateMany({ where: { eventId, status: "ASSIGNED" }, data: { status: "COMPLETED", completedAt: minutesAgo(t.closedAt * 60) } });
    await mdb.responsibilityLink.updateMany({ where: { eventId }, data: { status: "CLOSED" } });
    await audit({ actor: "AGENCY", action: "CLOSED", entityType: "UrbanEvent", entityId: eventId });
  }
}

// --- helpers -------------------------------------------------------------------

const jurisdictionIdMap = new Map<string, string>();
function jurisdictionIdFor(code: string): string | undefined {
  return jurisdictionIdMap.get(code);
}

function nearestHotspot(p: { lat: number; lng: number }): HotspotDef | null {
  let best: HotspotDef | null = null;
  let bestD = Infinity;
  for (const h of HOTSPOTS) {
    const d = distanceM(p, { lat: h.lat, lng: h.lng });
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}
