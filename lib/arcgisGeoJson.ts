import type { Feature, FeatureCollection } from "geojson";

type ArcGisGeoJsonResponse = FeatureCollection & {
  properties?: { exceededTransferLimit?: boolean };
};

export async function fetchArcGisGeoJson(
  queryUrl: string,
  options: {
    where?: string;
    outFields?: string;
    pageSize?: number;
  } = {}
): Promise<FeatureCollection> {
  const where = options.where ?? "1=1";
  const outFields = options.outFields ?? "*";
  const pageSize = options.pageSize ?? 500;
  const features: Feature[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      where,
      outFields,
      outSR: "4326",
      f: "geojson",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });

    const res = await fetch(`${queryUrl}?${params.toString()}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      throw new Error(`ArcGIS query returned status ${res.status}`);
    }

    const data = (await res.json()) as ArcGisGeoJsonResponse;
    const batch = data.features ?? [];
    features.push(...batch);

    if (batch.length < pageSize) break;
    offset += batch.length;
    if (offset > 5000) break;
  }

  return { type: "FeatureCollection", features };
}

export async function fetchGeoJsonUrl(url: string): Promise<FeatureCollection> {
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`GeoJSON fetch returned status ${res.status}`);
  }
  return res.json();
}

export function mergeFeatureCollections(
  collections: FeatureCollection[]
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((collection) => collection.features),
  };
}
