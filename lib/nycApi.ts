import { rowsToPointFeatureCollection } from "@/lib/geo";
import type { FeatureCollection } from "geojson";

const BASE_URL = "https://data.cityofnewyork.us/resource";

function sodaHeaders(): HeadersInit {
  const token =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_NYC_SODA_APP_TOKEN
      : undefined;
  return token ? { "X-App-Token": token } : {};
}

/** Build a Socrata SODA 2.0 URL for any NYC Open Data dataset `resource` id. */
export function sodaUrl(
  resourceId: string,
  params?: Record<string, string | number | undefined>
): string {
  const u = new URL(`${BASE_URL}/${resourceId}.json`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) u.searchParams.set(key, String(value));
    }
  }
  return u.toString();
}

export async function fetchSodaRows<T extends Record<string, unknown>>(
  resourceId: string,
  params?: Record<string, string | number | undefined>
): Promise<T[]> {
  const res = await fetch(sodaUrl(resourceId, params), {
    headers: sodaHeaders(),
  });
  if (!res.ok) {
    throw new Error(`NYC Open Data request failed (${res.status})`);
  }
  return res.json() as Promise<T[]>;
}

/**
 * Sample 311 service requests with coordinates (dataset `fhrw-4uyv`).
 * Replace this with your own resource id + column mapping as needed.
 */
export async function fetch311PointSample(
  limit = 250
): Promise<FeatureCollection> {
  const rows = await fetchSodaRows<Record<string, unknown>>("fhrw-4uyv", {
    $limit: limit,
    $select:
      "unique_key,created_date,complaint_type,status,latitude,longitude,borough",
    $where: "latitude IS NOT NULL AND longitude IS NOT NULL",
  });
  return rowsToPointFeatureCollection(rows, {
    latitudeKey: "latitude",
    longitudeKey: "longitude",
  });
}
