// Geospatial utilities (pure functions, no external GIS dependency).

export type LatLng = { lat: number; lng: number };
export type Ring = [number, number][]; // GeoJSON-style [lng, lat]
export type BBox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

const R = 6371000; // earth radius, m
const rad = (d: number) => (d * Math.PI) / 180;

/** Haversine distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bboxOf(ring: Ring): BBox {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function pointInRing(p: LatLng, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: LatLng, rings: Ring[]): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(p, rings[0])) return false; // outer ring
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(p, rings[i])) return false; // hole
  }
  return true;
}

export function polygonCentroid(ring: Ring): LatLng {
  const n = ring.length;
  let lat = 0,
    lng = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return { lat: lat / n, lng: lng / n };
}

/** Jitter a point by up to `radiusM` metres, deterministic via rng. */
export function jitter(p: LatLng, radiusM: number, rnd: () => number): LatLng {
  const bearing = rnd() * 2 * Math.PI;
  const dist = Math.sqrt(rnd()) * radiusM; // uniform disc
  const dLat = (dist * Math.cos(bearing)) / 111320;
  const dLng =
    (dist * Math.sin(bearing)) / (111320 * Math.cos(rad(p.lat)) || 1);
  return { lat: +(p.lat + dLat).toFixed(6), lng: +(p.lng + dLng).toFixed(6) };
}

/** Interpolate points along a polyline (for drain paths). */
export function interpolatePath(
  path: LatLng[],
  stepM: number
): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i],
      b = path[i + 1];
    const total = distanceM(a, b);
    const steps = Math.max(1, Math.round(total / stepM));
    for (let s = 0; s < steps; s++) {
      out.push({
        lat: a.lat + ((b.lat - a.lat) * s) / steps,
        lng: a.lng + ((b.lng - a.lng) * s) / steps,
      });
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

/** Inverse-distance-weighted interpolation of a scalar from stations. */
export function idwInterpolate(
  p: LatLng,
  stations: { lat: number; lng: number; value: number }[],
  power = 2
): number {
  let num = 0,
    den = 0;
  for (const s of stations) {
    const d = Math.max(distanceM(p, s), 1);
    const w = 1 / Math.pow(d, power);
    num += w * s.value;
    den += w;
  }
  return den === 0 ? 0 : num / den;
}

export function fmtLatLng(p: LatLng): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}
