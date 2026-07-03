import type { FeatureCollection } from "geojson";

const MODZCTA_URL =
  "https://data.cityofnewyork.us/resource/pri4-ifjk.geojson?$limit=500";

const TIGER_ZCTA_QUERY_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/11/query";

const ZCTA_BATCH_SIZE = 40;

export async function fetchModzctaBoundaries(): Promise<FeatureCollection> {
  const token = process.env.NEXT_PUBLIC_NYC_SODA_APP_TOKEN;
  const headers: Record<string, string> = {};
  if (token) headers["X-App-Token"] = token;

  const res = await fetch(MODZCTA_URL, {
    headers,
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`MODZCTA fetch returned status ${res.status}`);
  }
  return res.json();
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchTigerZctaBatch(zctaCodes: string[]): Promise<FeatureCollection> {
  const quoted = zctaCodes.map((z) => `'${z}'`).join(",");
  const params = new URLSearchParams({
    where: `ZCTA5 IN (${quoted})`,
    outFields: "ZCTA5",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "200",
  });

  const res = await fetch(`${TIGER_ZCTA_QUERY_URL}?${params.toString()}`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`TIGER ZCTA fetch returned status ${res.status}`);
  }
  return res.json();
}

export async function fetchTigerZctaBoundaries(zctaCodes: string[]): Promise<FeatureCollection> {
  const uniqueCodes = [...new Set(zctaCodes.map((z) => z.padStart(5, "0")))];
  const batches = chunk(uniqueCodes, ZCTA_BATCH_SIZE);
  const features = [];

  for (const batch of batches) {
    const collection = await fetchTigerZctaBatch(batch);
    features.push(...collection.features);
  }

  return { type: "FeatureCollection", features };
}
