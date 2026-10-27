/**
 * Single source of truth for hex colours that cannot read Tailwind classes:
 * MapLibre paint properties, Recharts inline styles and generated popup HTML.
 *
 * Every value mirrors a token in `src/app/globals.css`. When the theme
 * changes there, update this file to match — nothing else should hardcode hex.
 *
 * Monsoon Ledger v2: true-neutral ink (no navy cast), one aqua signal,
 * warm severity. sevLow reads as quiet neutral data, not pale blue.
 */
export const PALETTE = {
  // surfaces (mirror --ink-* / --hairline)
  canvas: "#0b0b0b", // --ink-950
  surface: "#141414", // --ink-900
  raised: "#1b1b1b", // --ink-850
  chip: "#232323", // --ink-800
  hairline: "#222222", // --hairline
  input: "#3c3c3c", // --input (3:1 perceived affordance)

  // signal (mirror --aqua / --water)
  aqua: "#2dd4bf",
  aquaDim: "#6fe6d6",
  aquaDeep: "#0a6e63",
  aquaMid: "#17a892", // blue-500 ramp (drains, corridors)

  // severity (mirror --sev-* / --verified)
  sevLow: "#a0a0a0",
  sevModerate: "#f5a524",
  sevHigh: "#fb8f3c",
  sevCritical: "#ff4d6a",
  verified: "#14b88a",

  // text ramp (mirror inverted slate ramp; text floors are AA-safe)
  foreground: "#ededed",
  textMuted: "#9a9a9a", // slate-600
  textDim: "#8f8f8f", // slate-500
  textFaint: "#808080", // AA floor for quiet text/markers

  // overlays (mirror --popover)
  popover: "#151515",
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
