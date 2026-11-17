import type { Feature, FeatureCollection } from "geojson";
import { rowsToPointFeatureCollection } from "@/lib/geo";

const BASE_URL = "https://data.cityofnewyork.us/resource";

const LIBRARIES_DATASET_ID = "feuq-due4";

type SocrataLibraryRow = {
  the_geom?: {
    type: "Point";
    coordinates: [number, number];
  };
  name?: string;
  streetname?: string;
  housenum?: string;
  city?: string;
  zip?: string;
  system?: string;
  borocode?: string;
  url?: string;
};

export async function fetchNycLibraries(): Promise<FeatureCollection> {
  const url = `${BASE_URL}/${LIBRARIES_DATASET_ID}.json?$limit=500`;

  const token = process.env.NEXT_PUBLIC_NYC_SODA_APP_TOKEN;
  const headers: Record<string, string> = {};
  if (token) headers["X-App-Token"] = token;

  const res = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`NYC Open Data returned status ${res.status}`);
  }

  const rows = (await res.json()) as SocrataLibraryRow[];
  const features: Feature[] = [];

  for (const row of rows) {
    if (row.the_geom?.coordinates) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: row.the_geom.coordinates,
        },
        properties: {
          name: row.name || "Unknown Library Branch",
          streetAddress: `${row.housenum || ""} ${row.streetname || ""}`.trim(),
          city: row.city || "",
          zip: row.zip || "",
          system: row.system || "Public Library",
          boroCode: row.borocode || "",
          url: row.url || "",
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

const SCHOOLS_DATASET_ID = "vw9i-7mzq";

export async function fetchNycSchools() {
  const fields = [
    "dbn",
    "school_name",
    "latitude",
    "longitude",
    "graduation_rate",
    "attendance_rate",
    "pct_stu_safe",
    "college_career_rate",
    "ell_programs",
    "overview_paragraph",
    "neighborhood",
    "primary_address_line_1",
    "city",
    "zip",
    "boro",
  ].join(",");

  const url = `${BASE_URL}/${SCHOOLS_DATASET_ID}.json?$limit=1000&$select=${fields}&$where=latitude IS NOT NULL AND longitude IS NOT NULL`;

  const token = process.env.NEXT_PUBLIC_NYC_SODA_APP_TOKEN;
  const headers: Record<string, string> = {};
  if (token) headers["X-App-Token"] = token;

  const res = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`NYC Open Data returned status ${res.status}`);
  }

  const rows = await res.json();
  return rowsToPointFeatureCollection(rows, {
    latitudeKey: "latitude",
    longitudeKey: "longitude",
  });
}
