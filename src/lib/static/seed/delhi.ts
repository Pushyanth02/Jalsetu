// Delhi pilot: 3 bounded jurisdictions (ward / corridor / catchment), modelled
// on real geography. ALL data generated from these definitions is SYNTHETIC
// DEMO DATA. Coordinates are approximate to real places; nothing here claims
// to be live municipal data.

import type { Ring } from "@/lib/geo";

export const PILOT_LABEL =
  "Bounded pilot: Model Town ward (MCD North), Minto Road corridor (NDMC), ITO-Barapullah catchment. Synthetic demo data.";

export interface JurisdictionDef {
  code: string;
  name: string;
  kind: "WARD" | "CORRIDOR" | "CATCHMENT";
  agencyCode: string | null;
  ring: Ring; // GeoJSON [lng, lat]
}

export interface HotspotDef {
  code: string;
  name: string;
  lat: number;
  lng: number;
  jurisdiction: string; // jurisdiction code
  groundTruthAgency: string;
  profile: "UNDERPASS" | "ROAD_LOW" | "DRAIN_OUTFALL" | "CROSSING";
}

export interface AgencyDef {
  code: string;
  name: string;
  kind: "CIVIC" | "UT" | "UTILITY" | "MONITOR";
  hotline: string;
  notes: string;
}

export const AGENCIES: AgencyDef[] = [
  { code: "MCD", name: "Municipal Corporation of Delhi", kind: "CIVIC", hotline: "155305", notes: "Small drains, colony roads, desilting of municipal drains" },
  { code: "PWD", name: "Public Works Department, GNCTD", kind: "UT", hotline: "1800-11-0282", notes: "Major roads, underpasses, PWD pump stations" },
  { code: "NDMC", name: "New Delhi Municipal Council", kind: "CIVIC", hotline: "011-23743100", notes: "NDMC area roads, drains and drains maintenance" },
  { code: "DJB", name: "Delhi Jal Board", kind: "UTILITY", hotline: "1916", notes: "Sewer network, sewer backups" },
  { code: "IFC", name: "Irrigation & Flood Control Dept, GNCTD", kind: "UT", hotline: "011-22454545", notes: "Trunk drains (Barapullah etc.), outfalls" },
  { code: "DDMA", name: "Delhi Disaster Management Authority", kind: "MONITOR", hotline: "1070", notes: "Escalation and cross-agency coordination" },
  { code: "DCP", name: "Delhi Traffic Police", kind: "MONITOR", hotline: "1095", notes: "Traffic diversion and barricading support" },
];

export const JURISDICTIONS: JurisdictionDef[] = [
  {
    code: "DL-MT-068",
    name: "Ward 68 - Model Town (MCD North City Zone)",
    kind: "WARD",
    agencyCode: "MCD",
    ring: [
      [77.1840, 28.6950], [77.1855, 28.7120], [77.1940, 28.7140], [77.2050, 28.7120],
      [77.2065, 28.7040], [77.2050, 28.6950], [77.1960, 28.6930], [77.1840, 28.6950],
    ],
  },
  {
    code: "DL-MR-C01",
    name: "Minto Road corridor (NDMC)",
    kind: "CORRIDOR",
    agencyCode: "NDMC",
    ring: [
      [77.2130, 28.6210], [77.2140, 28.6360], [77.2220, 28.6375], [77.2280, 28.6340],
      [77.2290, 28.6250], [77.2240, 28.6205], [77.2130, 28.6210],
    ],
  },
  {
    code: "DL-ITO-C02",
    name: "ITO-Barapullah drainage catchment (MCD Central / PWD / I&FC)",
    kind: "CATCHMENT",
    agencyCode: "MCD",
    ring: [
      [77.2340, 28.6100], [77.2350, 28.6280], [77.2420, 28.6380], [77.2540, 28.6385],
      [77.2610, 28.6320], [77.2600, 28.6180], [77.2500, 28.6080], [77.2380, 28.6065],
      [77.2340, 28.6100],
    ],
  },
];

export const HOTSPOTS: HotspotDef[] = [
  {
    code: "HS-MT-01",
    name: "Model Town underpass approach (GTB-Azadpur corridor)",
    lat: 28.7030, lng: 77.1968,
    jurisdiction: "DL-MT-068",
    groundTruthAgency: "PWD",
    profile: "UNDERPASS",
  },
  {
    code: "HS-MT-02",
    name: "Alipur Road low stretch near Model Town",
    lat: 28.7085, lng: 77.1912,
    jurisdiction: "DL-MT-068",
    groundTruthAgency: "MCD",
    profile: "ROAD_LOW",
  },
  {
    code: "HS-MR-01",
    name: "Minto Road underpass",
    lat: 28.6284, lng: 77.2215,
    jurisdiction: "DL-MR-C01",
    groundTruthAgency: "PWD",
    profile: "UNDERPASS",
  },
  {
    code: "HS-MR-02",
    name: "Baba Kharak Singh Marg depression",
    lat: 28.6328, lng: 77.2196,
    jurisdiction: "DL-MR-C01",
    groundTruthAgency: "NDMC",
    profile: "ROAD_LOW",
  },
  {
    code: "HS-ITO-01",
    name: "ITO crossing (Baba Harishdas Marg)",
    lat: 28.6280, lng: 77.2460,
    jurisdiction: "DL-ITO-C02",
    groundTruthAgency: "MCD", // deliberately ambiguous: MCD small drains vs PWD pump/road - tests routing honesty
    profile: "CROSSING",
  },
  {
    code: "HS-ITO-02",
    name: "Barapullah drain outfall near Nizamuddin",
    lat: 28.6180, lng: 77.2520,
    jurisdiction: "DL-ITO-C02",
    groundTruthAgency: "IFC",
    profile: "DRAIN_OUTFALL",
  },
];

export interface AssetDef {
  code: string;
  kind: "DRAIN" | "CULVERT" | "PUMP_STATION" | "ROAD_SEGMENT" | "UNDERPASS" | "DEPRESSION" | "OUTFALL";
  name: string;
  jurisdiction: string;
  agencyCode: string;
  lat: number;
  lng: number;
  path?: [number, number][]; // [lng, lat]
  condition: number; // 0-100
  maintenanceProfile: "RECENT" | "OVERDUE" | "NONE" | "IN_PROGRESS";
}

export const ASSETS: AssetDef[] = [
  // Model Town ward
  { code: "AST-MT-UP-01", kind: "UNDERPASS", name: "Model Town underpass", jurisdiction: "DL-MT-068", agencyCode: "PWD", lat: 28.7031, lng: 77.1969, condition: 48, maintenanceProfile: "OVERDUE" },
  { code: "AST-MT-PS-01", kind: "PUMP_STATION", name: "Model Town underpass pump station", jurisdiction: "DL-MT-068", agencyCode: "PWD", lat: 28.7028, lng: 77.1972, condition: 55, maintenanceProfile: "RECENT" },
  { code: "AST-MT-RD-01", kind: "ROAD_SEGMENT", name: "GTB Nagar-Azadpur corridor", jurisdiction: "DL-MT-068", agencyCode: "PWD", lat: 28.7045, lng: 77.1985, path: [[77.1920, 28.7000], [77.1980, 28.7035], [77.2040, 28.7070]], condition: 70, maintenanceProfile: "RECENT" },
  { code: "AST-MT-DR-01", kind: "DRAIN", name: "Alipur Road storm drain", jurisdiction: "DL-MT-068", agencyCode: "MCD", lat: 28.7083, lng: 77.1910, path: [[77.1850, 28.7070], [77.1912, 28.7085], [77.1960, 28.7095]], condition: 42, maintenanceProfile: "OVERDUE" },
  { code: "AST-MT-DR-02", kind: "DRAIN", name: "Model Town colony drain", jurisdiction: "DL-MT-068", agencyCode: "MCD", lat: 28.7000, lng: 77.1930, path: [[77.1900, 28.6980], [77.1935, 28.7005], [77.1960, 28.7020]], condition: 65, maintenanceProfile: "RECENT" },
  { code: "AST-MT-DP-01", kind: "DEPRESSION", name: "Alipur Road low stretch", jurisdiction: "DL-MT-068", agencyCode: "MCD", lat: 28.7085, lng: 77.1912, condition: 58, maintenanceProfile: "NONE" },
  { code: "AST-MT-CL-01", kind: "CULVERT", name: "Gujranwala Town culvert", jurisdiction: "DL-MT-068", agencyCode: "MCD", lat: 28.7010, lng: 77.1900, condition: 72, maintenanceProfile: "RECENT" },
  // Minto Road corridor
  { code: "AST-MR-UP-01", kind: "UNDERPASS", name: "Minto Road underpass", jurisdiction: "DL-MR-C01", agencyCode: "PWD", lat: 28.6284, lng: 77.2215, condition: 38, maintenanceProfile: "OVERDUE" },
  { code: "AST-MR-PS-01", kind: "PUMP_STATION", name: "Minto Road pump station", jurisdiction: "DL-MR-C01", agencyCode: "PWD", lat: 28.6281, lng: 77.2218, condition: 44, maintenanceProfile: "IN_PROGRESS" },
  { code: "AST-MR-RD-01", kind: "ROAD_SEGMENT", name: "Minto Road (NDMC)", jurisdiction: "DL-MR-C01", agencyCode: "NDMC", lat: 28.6295, lng: 77.2205, path: [[77.2160, 28.6250], [77.2210, 28.6290], [77.2260, 28.6320]], condition: 66, maintenanceProfile: "RECENT" },
  { code: "AST-MR-DR-01", kind: "DRAIN", name: "Minto Road storm drain", jurisdiction: "DL-MR-C01", agencyCode: "NDMC", lat: 28.6288, lng: 77.2212, path: [[77.2180, 28.6240], [77.2212, 28.6285], [77.2235, 28.6310]], condition: 50, maintenanceProfile: "OVERDUE" },
  { code: "AST-MR-DP-01", kind: "DEPRESSION", name: "Baba Kharak Singh Marg depression", jurisdiction: "DL-MR-C01", agencyCode: "NDMC", lat: 28.6328, lng: 77.2196, condition: 60, maintenanceProfile: "RECENT" },
  { code: "AST-MR-CL-01", kind: "CULVERT", name: "Ajmeri Gate culvert", jurisdiction: "DL-MR-C01", agencyCode: "MCD", lat: 28.6335, lng: 77.2245, condition: 68, maintenanceProfile: "RECENT" },
  // ITO-Barapullah catchment
  { code: "AST-ITO-RD-01", kind: "ROAD_SEGMENT", name: "Baba Harishdas Marg (ITO)", jurisdiction: "DL-ITO-C02", agencyCode: "PWD", lat: 28.6280, lng: 77.2455, path: [[77.2380, 28.6265], [77.2460, 28.6280], [77.2520, 28.6290]], condition: 62, maintenanceProfile: "RECENT" },
  { code: "AST-ITO-DR-01", kind: "DRAIN", name: "ITO storm drain (Ring Road)", jurisdiction: "DL-ITO-C02", agencyCode: "MCD", lat: 28.6272, lng: 77.2450, path: [[77.2390, 28.6255], [77.2452, 28.6272], [77.2500, 28.6282]], condition: 45, maintenanceProfile: "OVERDUE" },
  { code: "AST-BRP-DR-01", kind: "DRAIN", name: "Barapullah drain (trunk)", jurisdiction: "DL-ITO-C02", agencyCode: "IFC", lat: 28.6185, lng: 77.2480, path: [[77.2360, 28.6105], [77.2420, 28.6135], [77.2480, 28.6185], [77.2530, 28.6215]], condition: 35, maintenanceProfile: "OVERDUE" },
  { code: "AST-BRP-OF-01", kind: "OUTFALL", name: "Barapullah outfall structure", jurisdiction: "DL-ITO-C02", agencyCode: "IFC", lat: 28.6180, lng: 77.2520, condition: 32, maintenanceProfile: "OVERDUE" },
  { code: "AST-ITO-PS-01", kind: "PUMP_STATION", name: "ITO pump station", jurisdiction: "DL-ITO-C02", agencyCode: "PWD", lat: 28.6275, lng: 77.2468, condition: 58, maintenanceProfile: "RECENT" },
  { code: "AST-ITO-DP-01", kind: "DEPRESSION", name: "Vikas Marg approach low point", jurisdiction: "DL-ITO-C02", agencyCode: "PWD", lat: 28.6298, lng: 77.2498, condition: 63, maintenanceProfile: "RECENT" },
  { code: "AST-ITO-CL-01", kind: "CULVERT", name: "Sundar Nagari culvert", jurisdiction: "DL-ITO-C02", agencyCode: "MCD", lat: 28.6155, lng: 77.2400, condition: 71, maintenanceProfile: "RECENT" },
];

export interface StationDef {
  code: string;
  name: string;
  lat: number;
  lng: number;
  amplitude: number; // peak 3h rainfall scaling
}

// Synthetic rain-gauge stations modelled on the IMD Delhi network.
export const STATIONS: StationDef[] = [
  { code: "RG-SJ", name: "Safdarjung (synthetic)", lat: 28.5650, lng: 77.2050, amplitude: 0.8 },
  { code: "RG-PU", name: "Pusa (synthetic)", lat: 28.6398, lng: 77.1462, amplitude: 1.15 },
  { code: "RG-LD", name: "Lodi Road (synthetic)", lat: 28.5918, lng: 77.2273, amplitude: 1.05 },
  { code: "RG-PL", name: "Palam (synthetic)", lat: 28.5880, lng: 77.0820, amplitude: 0.6 },
];

/** Realistic citizen report descriptions (synthetic, written for demo). */
export const DESCRIPTIONS: Record<string, string[]> = {
  UNDERPASS: [
    "Waterlogging at the underpass, knee-deep water. Cars stalled near the exit ramp, traffic police diverting vehicles.",
    "Underpass flooded again. Knee deep water inside, no pumping visible for the last hour.",
    "The underpass is submerged after the rain. Two buses stuck, people walking through water.",
    "Ankle to knee water in the underpass. Pump seems to be running but not keeping up.",
    "Underpass closed due to flooding. Water level rising near the footpath side.",
  ],
  ROAD_LOW: [
    "Long stretch of road flooded, water above the footpath. Autos are avoiding this side.",
    "Water logging on the low stretch, drains are overflowing and water is not moving.",
    "Standing water on the road, about ankle deep, drain covers are blocked with leaves and plastic.",
    "Roadside water accumulating, the storm water drain appears fully choked.",
    "Flooded road patch after heavy rain, shopkeepers putting barriers outside.",
  ],
  DRAIN_OUTFALL: [
    "Drain overflowing onto the road, strong smell, water spreading towards the houses.",
    "Nallah water backing up at the outfall, road fully flooded with sewage mixed water.",
    "Drain outfall blocked, water rising on both sides of the road since morning.",
    "Barapullah drain overflow, black water on the road, people cannot cross.",
    "Drain over the embankment, outfall not taking the flow, surrounding lane flooded.",
  ],
  CROSSING: [
    "Major waterlogging at the crossing, traffic jam in all directions, water at wheel level.",
    "Intersection flooded, vehicles stuck in knee-deep water near the signal.",
    "The whole crossing is under water. Buses and cars stalled, traffic crawling.",
    "Water not draining at the crossing even one hour after rain stopped.",
    "Signal area waterlogged, two-wheelers falling, autos refusing to come this side.",
  ],
  NOISE_MINOR: [
    "Small puddle forming near the bus stop, not very deep but slippery.",
    "Water collection on the side of the lane, minor issue for pedestrians.",
    "Patch of standing water on the footpath, maybe a blocked small drain.",
    "Pothole filled with water after rain, two-wheelers skidding slightly.",
    "Some water accumulation near the park gate, drains seem slow.",
  ],
  NOISE_POTHOLE: [
    "Deep pothole hidden under water on the lane, dangerous for two-wheelers.",
    "Broken road patch with water, pothole getting worse each rain.",
    "Pothole full of water near the market, vehicles hitting it hard.",
  ],
};
