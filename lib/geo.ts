import type { Feature, FeatureCollection } from "geojson";

export function rowsToPointFeatureCollection(
  rows: Record<string, unknown>[],
  options: {
    latitudeKey: string;
    longitudeKey: string;
  }
): FeatureCollection {
  const features: Feature[] = rows
    .map((row) => {
      const lat = parseFloat(String(row[options.latitudeKey]));
      const lng = parseFloat(String(row[options.longitudeKey]));
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
        properties: row,
      } satisfies Feature;
    })
    .filter(Boolean) as Feature[];

  return { type: "FeatureCollection", features };
}

export function getFeatureCentroid(feature: Feature): { lat: number; lon: number } | null {
  const geom = feature.geometry;
  if (!geom) return null;

  if (geom.type === "Point") {
    const [lon, lat] = geom.coordinates;
    return { lat, lon };
  }

  if (geom.type === "MultiPolygon" || geom.type === "Polygon") {
    const rings =
      geom.type === "Polygon" ? [geom.coordinates[0]] : geom.coordinates.map((p) => p[0]);
    const ring = rings[0];
    if (!ring?.length) return null;
    let latSum = 0;
    let lonSum = 0;
    for (const [lon, lat] of ring) {
      latSum += lat;
      lonSum += lon;
    }
    return { lat: latSum / ring.length, lon: lonSum / ring.length };
  }

  return null;
}
