/**
 * Single source of truth for hex colours that cannot read Tailwind classes:
 * MapLibre paint properties, Recharts inline styles and generated popup HTML.
 *
 * Every value mirrors a token in `src/app/globals.css`. When the theme
 * changes there, update this file to match — nothing else should hardcode hex.
 */
export const PALETTE = {
  // surfaces (mirror --ink-* / --hairline)
  canvas: "#05080f", // --ink-950
  surface: "#0a1124", // --ink-900
  raised: "#101a33", // --ink-850
  chip: "#16213f", // --ink-800
  hairline: "#1a2440", // --hairline
  input: "#33406e", // --input (3:1 perceived affordance)

  // signal (mirror --aqua / --water)
  aqua: "#2dd4bf",
  aquaDim: "#6fe6d6",
  aquaDeep: "#0a6e63",
  aquaMid: "#17a892", // blue-500 ramp (drains, corridors)

  // severity (mirror --sev-* / --verified)
  sevLow: "#9dabe0",
  sevModerate: "#f5a524",
  sevHigh: "#fb8f3c",
  sevCritical: "#ff4d6a",
  verified: "#14b88a",

  // text ramp (mirror inverted slate ramp; text floors are AA-safe)
  foreground: "#eef2ff",
  textMuted: "#9dabe0", // slate-600
  textDim: "#94a3cf", // slate-500
  textFaint: "#8291c4", // AA floor for quiet text/markers (was 2.6:1 — invisible)

  // overlays (mirror --popover)
  popover: "#0c142b",
} as const;

/** Severity 1–4 fills, keyed the way map code passes severity. */
export function severityHex(sev: number): string {
  if (sev >= 4) return PALETTE.sevCritical;
  if (sev === 3) return PALETTE.sevHigh;
  if (sev === 2) return PALETTE.sevModerate;
  return PALETTE.textFaint;
}

/** Event status accents used in popups and markers. */
export const STATUS_HEX: Record<string, string> = {
  DETECTED: PALETTE.aqua,
  TRIAGED: PALETTE.textMuted,
  ASSIGNED: PALETTE.sevModerate,
  IN_PROGRESS: PALETTE.sevHigh,
  VERIFIED: PALETTE.verified,
  CLOSED: PALETTE.textFaint,
  REOPENED: PALETTE.sevCritical,
};

/** Risk-band accents, aligned with the map legend ramp. */
export const RISK_HEX: Record<string, string> = {
  LOW: PALETTE.sevLow,
  MODERATE: PALETTE.sevModerate,
  HIGH: PALETTE.sevHigh,
  CRITICAL: PALETTE.sevCritical,
};
