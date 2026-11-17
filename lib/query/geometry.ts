import type { MultiPolygon, Polygon, Position } from "geojson";

const EARTH_RADIUS_MILES = 3958.7613;
const DEG = Math.PI / 180;

// WGS84 ellipsoid, in miles.
const WGS84_A_MILES = 6378.137 / 1.609344;
const WGS84_E2 = 0.00669437999014;

/**
 * Miles per degree of longitude and latitude at a given latitude on the WGS84 ellipsoid.
 * A local plane scaled this way matches geodesic distance to ~0.01% within 20 miles,
 * where a spherical Earth is off by up to 0.5%.
 */
export function milesPerDegree(lat: number): { kx: number; ky: number } {
  const s = Math.sin(lat * DEG);
  const w = 1 - WGS84_E2 * s * s;
  const n = WGS84_A_MILES / Math.sqrt(w); // prime vertical radius
  const m = (WGS84_A_MILES * (1 - WGS84_E2)) / (w * Math.sqrt(w)); // meridional radius
  return { kx: n * Math.cos(lat * DEG) * DEG, ky: m * DEG };
}

/** Distance in miles between two nearby points (< ~50 miles), using the local ellipsoidal plane. */
export function localMiles(a: Position, b: Position): number {
  const { kx, ky } = milesPerDegree((a[1] + b[1]) / 2);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * ky);
}

/** Great-circle distance in miles. */
export function haversineMiles(a: Position, b: Position): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

function ringContains(ring: Position[], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygons(geom: Polygon | MultiPolygon): Position[][][] {
  return geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
}

export function containsPoint(geom: Polygon | MultiPolygon, point: Position): boolean {
  const [lon, lat] = point;
  for (const rings of polygons(geom)) {
    if (!ringContains(rings[0], lon, lat)) continue;
    let inHole = false;
    for (const hole of rings.slice(1)) if (ringContains(hole, lon, lat)) inHole = true;
    if (!inHole) return true;
  }
  return false;
}

/**
 * Shortest distance in miles from a point to a polygon's boundary, or 0 if the point is inside.
 * Uses a local plane centred on the point, scaled to the WGS84 ellipsoid at that latitude.
 */
export function pointToPolygonMiles(point: Position, geom: Polygon | MultiPolygon): number {
  if (containsPoint(geom, point)) return 0;
  const [plon, plat] = point;
  const { kx, ky } = milesPerDegree(plat);
  let best = Infinity;
  for (const rings of polygons(geom)) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const ax = (ring[i - 1][0] - plon) * kx;
        const ay = (ring[i - 1][1] - plat) * ky;
        const bx = (ring[i][0] - plon) * kx;
        const by = (ring[i][1] - plat) * ky;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
        const d2 = (ax + t * dx) ** 2 + (ay + t * dy) ** 2;
        if (d2 < best) best = d2;
      }
    }
  }
  return Math.sqrt(best);
}

export type BBox = [number, number, number, number];

export function geometryBBox(geom: Polygon | MultiPolygon): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of polygons(geom)) {
    for (const [lon, lat] of rings[0]) {
      if (lon < b[0]) b[0] = lon;
      if (lat < b[1]) b[1] = lat;
      if (lon > b[2]) b[2] = lon;
      if (lat > b[3]) b[3] = lat;
    }
  }
  return b;
}

/** Lower bound on the distance (miles) from a point to anything inside a bounding box. */
export function pointToBBoxMiles(point: Position, box: BBox): number {
  const lon = Math.max(box[0], Math.min(point[0], box[2]));
  const lat = Math.max(box[1], Math.min(point[1], box[3]));
  return haversineMiles(point, [lon, lat]);
}
