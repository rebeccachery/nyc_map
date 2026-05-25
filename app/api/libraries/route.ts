import { NextResponse } from "next/server";
import type { Feature, FeatureCollection } from "geojson";

export const dynamic = "force-dynamic";

const LIBRARIES_DATASET_ID = "feuq-due4";
const BASE_URL = "https://data.cityofnewyork.us/resource";

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

export async function GET() {
  try {
    const url = `${BASE_URL}/${LIBRARIES_DATASET_ID}.json?$limit=500`;
    
    const token = process.env.NEXT_PUBLIC_NYC_SODA_APP_TOKEN;
    const headers: Record<string, string> = {};
    if (token) {
      headers["X-App-Token"] = token;
    }

    const res = await fetch(url, { headers, next: { revalidate: 3600 } });
    if (!res.ok) {
      throw new Error(`NYC Open Data returned status ${res.status}`);
    }

    const rows = (await res.json()) as SocrataLibraryRow[];
    
    const features: Feature[] = [];
    for (const row of rows) {
      if (row.the_geom && row.the_geom.coordinates) {
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

    const featureCollection: FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    return NextResponse.json({ success: true, data: featureCollection });
  } catch (error: unknown) {
    console.error("Error in libraries API route:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
