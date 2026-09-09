// Deterministic synthetic-evidence photo generator (SVG data URLs).
// Every image is clearly labelled as synthetic. No real photography is faked.

export interface PhotoSpec {
  kind: "citizen" | "field-before" | "field-after";
  label: string; // location label
  depthCm?: number;
  timeLabel: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function syntheticPhoto(spec: PhotoSpec): string {
  const w = 480, h = 320;
  const isAfter = spec.kind === "field-after";
  const sky = isAfter ? "#1c2a30" : "#24333c";
  const road = isAfter ? "#2a3138" : "#232a31";
  const water = isAfter ? "#39525a" : "#2f5d6e";
  const depth = spec.depthCm ?? (isAfter ? 0 : 25);
  const waterY = h * 0.62 + Math.min(depth, 60) * 0.9;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Synthetic ${esc(spec.kind)} evidence photo">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${road}"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${water}" stop-opacity="0.9"/><stop offset="1" stop-color="#1d3a45" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <rect y="${h * 0.58}" width="${w}" height="${h * 0.42}" fill="${road}"/>
  <rect y="${waterY}" width="${w}" height="${h - waterY}" fill="url(#water)"/>
  ${isAfter ? "" : `<rect x="40" y="${waterY - 46}" width="14" height="52" rx="3" fill="#111a1f"/>
  <rect x="${w - 70}" y="${waterY - 38}" width="12" height="44" rx="3" fill="#0f171c"/>
  <ellipse cx="300" cy="${waterY + 14}" rx="60" ry="8" fill="#4c7686" opacity="0.45"/>`}
  <g font-family="monospace" font-size="12" fill="#8fa6ad">
    <rect x="12" y="12" width="196" height="18" rx="3" fill="#0b0f10" opacity="0.85"/>
    <text x="18" y="25" fill="#e8b64c">SYNTHETIC EVIDENCE · DEMO</text>
    <text x="16" y="${h - 42}" fill="#c8d6da">${esc(spec.label)}</text>
    <text x="16" y="${h - 26}" fill="#8fa6ad">${esc(spec.timeLabel)}${isAfter ? " · after intervention" : ` · ~${depth}cm standing water`}</text>
  </g>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
