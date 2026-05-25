import { NextResponse } from "next/server";
import { rowsToPointFeatureCollection } from "@/lib/geo";

export const dynamic = "force-dynamic";

const SCHOOLS_DATASET_ID = "vw9i-7mzq";
const BASE_URL = "https://data.cityofnewyork.us/resource";

export async function GET() {
  try {
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
      "boro"
    ].join(",");

    const url = `${BASE_URL}/${SCHOOLS_DATASET_ID}.json?$limit=1000&$select=${fields}&$where=latitude IS NOT NULL AND longitude IS NOT NULL`;
    
    const token = process.env.NEXT_PUBLIC_NYC_SODA_APP_TOKEN;
    const headers: Record<string, string> = {};
    if (token) {
      headers["X-App-Token"] = token;
    }

    const res = await fetch(url, { headers, next: { revalidate: 3600 } });
    if (!res.ok) {
      throw new Error(`NYC Open Data returned status ${res.status}`);
    }

    const rows = await res.json();
    const geoJson = rowsToPointFeatureCollection(rows, {
      latitudeKey: "latitude",
      longitudeKey: "longitude",
    });

    return NextResponse.json({ success: true, data: geoJson });
  } catch (error: unknown) {
    console.error("Error in schools API route:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
