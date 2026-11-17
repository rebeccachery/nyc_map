import { NextResponse } from "next/server";
import { fetchMiamiLibraries } from "@/lib/miamiOverlays";
import { fetchNycLibraries } from "@/lib/nycOverlays";
import { parseMetroId } from "@/lib/metroApi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const metro = parseMetroId(new URL(request.url).searchParams.get("metro"));
    const featureCollection =
      metro === "miami" ? await fetchMiamiLibraries() : await fetchNycLibraries();

    return NextResponse.json({ success: true, data: featureCollection });
  } catch (error: unknown) {
    console.error("Error in libraries API route:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
