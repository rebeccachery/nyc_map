import { NextResponse } from "next/server";
import { fetchMiamiSchools } from "@/lib/miamiOverlays";
import { fetchNycSchools } from "@/lib/nycOverlays";
import { parseMetroId } from "@/lib/metroApi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const metro = parseMetroId(new URL(request.url).searchParams.get("metro"));
    const geoJson = metro === "miami" ? await fetchMiamiSchools() : await fetchNycSchools();

    return NextResponse.json({ success: true, data: geoJson });
  } catch (error: unknown) {
    console.error("Error in schools API route:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
