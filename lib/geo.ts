import type { Feature, FeatureCollection, GeoJsonProperties } from "geojson";

export function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Convert tabular API rows (e.g. Socrata) into GeoJSON points for the map.
 * Common NYC columns: `latitude` / `longitude`, or `lat` / `long`.
 */
export function rowsToPointFeatureCollection(
  rows: Record<string, unknown>[],
  options: {
    latitudeKey: string;
    longitudeKey: string;
  }
): FeatureCollection {
  const { latitudeKey, longitudeKey } = options;
  const features: Feature[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lat = toNumber(row[latitudeKey]);
    const lng = toNumber(row[longitudeKey]);
    if (lat === null || lng === null) continue;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: row as GeoJsonProperties,
    });
  }
  return { type: "FeatureCollection", features };
}
