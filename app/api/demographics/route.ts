import { NextResponse } from "next/server";
import { fetchCountyDemographics } from "@/lib/demographics";
import { DEMOGRAPHICS_BY_METRO, parseMetroId } from "@/lib/metroApi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const metro = parseMetroId(new URL(request.url).searchParams.get("metro"));
    const results = await fetchCountyDemographics(DEMOGRAPHICS_BY_METRO[metro]);

    return NextResponse.json({ success: true, data: results });
  } catch (error: unknown) {
    console.error("Error in demographics API route:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
