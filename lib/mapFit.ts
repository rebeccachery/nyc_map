import type { Feature, Position } from "geojson";

export type Bounds = { west: number; south: number; east: number; north: number };

/** Bounding box of a set of features and points; null when empty. */
export function boundsOf(features: Feature[], points: Position[] = []): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const add = ([lon, lat]: Position) => {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  };
  const walk = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === "number") add(coords as Position);
    else if (Array.isArray(coords)) coords.forEach(walk);
  };
  for (const f of features) walk((f.geometry as { coordinates?: unknown } | null)?.coordinates);
  points.forEach(add);
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/**
 * Centre and zoom that fit `b` into a `width`×`height` pixel area (Mapbox's 512px tiles),
 * leaving `padding` (0–1) of slack and keeping within sensible zooms for ZIP-level views.
 */
export function fitView(
  b: Bounds,
  width: number,
  height: number,
  padding = 0.25,
  minZoom = 8,
  maxZoom = 13
): { lat: number; lon: number; zoom: number } {
  const lonSpan = Math.max(b.east - b.west, 0.005);
  const ySpan = Math.max(mercY(b.north) - mercY(b.south), 0.0001);
  const usableW = Math.max(width, 200) * (1 - padding);
  const usableH = Math.max(height, 200) * (1 - padding);
  const zx = Math.log2((usableW * 360) / (512 * lonSpan));
  const zy = Math.log2((usableH * 2 * Math.PI) / (512 * ySpan));
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.min(zx, zy)));
  const midY = (mercY(b.north) + mercY(b.south)) / 2;
  const lat = (Math.atan(Math.exp(midY)) * 360) / Math.PI - 90;
  return { lat, lon: (b.west + b.east) / 2, zoom };
}
