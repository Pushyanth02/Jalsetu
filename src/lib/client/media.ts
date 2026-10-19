/**
 * JalSetu contextual scene media system.
 *
 * Every event / report / scenario gets a scene image that is:
 *  1. **Contextually appropriate** — chosen by report category (+ free-text
 *     keyword fallback) and, when known, by severity intensity (minor
 *     ponding vs deep flooding variants).
 *  2. **Randomized** — a stable FNV-1a hash of the entity id picks a variant
 *     from the pool, so different events of the same category show different
 *     photos while the same event always shows the same photo (stable URLs,
 *     cache friendly, no hydration mismatch).
 *
 * All images are AI-generated illustrative scenes (see /img/scenes), shipped
 * as avif + webp + png triples. They are labelled "illustrative" in the UI so
 * they are never mistaken for real evidence photos.
 */

import { assetPath } from "./assets";

export type SceneCategory =
  | "WATERLOGGING"
  | "POTHOLE"
  | "DRAIN_OVERFLOW"
  | "SEWER_BACKUP"
  | "UNDERPASS";

/** "lo" = minor ponding scene, "hi" = deep-water / severe scene. */
export type SceneIntensity = "lo" | "hi";

export interface SceneImage {
  avif: string;
  webp: string;
  png: string;
  label: string;
  intensity: SceneIntensity;
}

interface PoolSpec {
  label: string;
  /** variants 1-2 are low intensity, 3-4 are high intensity */
  base: string;
}

const POOL_SPECS: Record<SceneCategory, PoolSpec> = {
  WATERLOGGING: { label: "waterlogged street", base: "street-flood" },
  POTHOLE: { label: "water-filled pothole", base: "pothole" },
  DRAIN_OVERFLOW: { label: "overflowing storm drain", base: "drain-overflow" },
  SEWER_BACKUP: { label: "sewer manhole overflow", base: "sewer-backup" },
  UNDERPASS: { label: "flooded underpass", base: "underpass" },
};

const SCENE_DIR = "/img/scenes";

function variant(base: string, n: 1 | 2 | 3 | 4, label: string): SceneImage {
  const name = `${base}-${n}`;
  return {
    avif: assetPath(`${SCENE_DIR}/${name}.avif`),
    webp: assetPath(`${SCENE_DIR}/${name}.webp`),
    png: assetPath(`${SCENE_DIR}/${name}.png`),
    label,
    intensity: n <= 2 ? "lo" : "hi",
  };
}

/** All scene variants per category (4 each: lo, lo, hi, hi). */
export const SCENE_POOLS: Record<SceneCategory, SceneImage[]> = {
  WATERLOGGING: [1, 2, 3, 4].map((n) => variant("street-flood", n as 1 | 2 | 3 | 4, POOL_SPECS.WATERLOGGING.label)),
  POTHOLE: [1, 2, 3, 4].map((n) => variant("pothole", n as 1 | 2 | 3 | 4, POOL_SPECS.POTHOLE.label)),
  DRAIN_OVERFLOW: [1, 2, 3, 4].map((n) => variant("drain-overflow", n as 1 | 2 | 3 | 4, POOL_SPECS.DRAIN_OVERFLOW.label)),
  SEWER_BACKUP: [1, 2, 3, 4].map((n) => variant("sewer-backup", n as 1 | 2 | 3 | 4, POOL_SPECS.SEWER_BACKUP.label)),
  UNDERPASS: [1, 2, 3, 4].map((n) => variant("underpass", n as 1 | 2 | 3 | 4, POOL_SPECS.UNDERPASS.label)),
};

/** Hero skyline (landing / og). */
export const SCENE_HERO: { avif: string; webp: string; png: string } = {
  avif: assetPath(`${SCENE_DIR}/hero-delhi-monsoon.avif`),
  webp: assetPath(`${SCENE_DIR}/hero-delhi-monsoon.webp`),
  png: assetPath(`${SCENE_DIR}/hero-delhi-monsoon.png`),
};

/** Weather / rainfall context images (rotated deterministically). */
const WEATHER_SCENES = [
  { base: `${SCENE_DIR}/weather-gauge-1` },
  { base: `${SCENE_DIR}/weather-rain-2` },
  { base: "/img/weather-delhi" },
].map(({ base }) => ({
  avif: assetPath(`${base}.avif`),
  webp: assetPath(`${base}.webp`),
  png: assetPath(`${base}.png`),
}));

/** FNV-1a 32-bit hash — small, fast, evenly distributed for pool picks. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Map a report category (+ optional free text) to a scene category.
 * Keyword fallback keeps citizen-written descriptions ("big crater on the
 * road") matched even when the category enum is generic.
 */
export function sceneCategoryFor(category?: string | null, description?: string | null): SceneCategory {
  const cat = (category ?? "").toUpperCase();
  const desc = (description ?? "").toLowerCase();
  if (cat === "POTHOLE" || desc.includes("pothole") || desc.includes("crater") || desc.includes("broken road")) return "POTHOLE";
  if (cat === "DRAIN_OVERFLOW" || desc.includes("drain") || desc.includes("overflow") || desc.includes("nalah") || desc.includes("nala")) return "DRAIN_OVERFLOW";
  if (cat === "SEWER_BACKUP" || desc.includes("sewer") || desc.includes("manhole") || desc.includes("backup")) return "SEWER_BACKUP";
  if (cat === "UNDERPASS" || desc.includes("underpass") || desc.includes("subway") || desc.includes("ito") || desc.includes("minto")) return "UNDERPASS";
  return "WATERLOGGING";
}

/**
 * Pick a scene variant deterministically.
 * @param seed     stable entity id (event code / report id) — drives randomization
 * @param intensity when known, restricts to lo/hi variants (undefined = any)
 */
export function pickScene(
  category: SceneCategory,
  seed: string,
  intensity?: SceneIntensity
): SceneImage {
  const pool = SCENE_POOLS[category];
  const filtered = intensity ? pool.filter((v) => v.intensity === intensity) : pool;
  const use = filtered.length > 0 ? filtered : pool;
  return use[hashSeed(seed) % use.length];
}

/** Derive scene intensity from a numeric severity score (0-100). */
export function intensityFromScore(score?: number | null): SceneIntensity | undefined {
  if (score == null || Number.isNaN(score)) return undefined;
  if (score >= 55) return "hi";
  if (score <= 30) return "lo";
  return undefined;
}

/** Derive scene intensity from a severity/risk enum string. */
export function intensityFromBand(band?: string | null): SceneIntensity | undefined {
  switch ((band ?? "").toUpperCase()) {
    case "LOW":
    case "MINOR":
      return "lo";
    case "HIGH":
    case "CRITICAL":
    case "MAJOR":
      return "hi";
    default:
      return undefined;
  }
}

/**
 * One-call scene lookup for reports: category + description + id + severity.
 * Returns the {avif,webp,png,label} triple used by <picture> thumbnails.
 */
export function sceneThumb(
  category: string | null | undefined,
  description: string | null | undefined,
  seed: string,
  severity?: string | number | null
): SceneImage {
  const sceneCat = sceneCategoryFor(category, description);
  const intensity =
    typeof severity === "number"
      ? intensityFromScore(severity)
      : intensityFromBand(severity as string | null | undefined);
  return pickScene(sceneCat, seed || "default", intensity);
}

/** Deterministic weather image (rotates by seed, e.g. day-of-year). */
export function weatherScene(seed: string): { avif: string; webp: string; png: string } {
  return WEATHER_SCENES[hashSeed(seed) % WEATHER_SCENES.length];
}
