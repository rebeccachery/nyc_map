import { NextResponse } from "next/server";
import { buildHaitianZcta } from "@/lib/haitianZctaBuild";
import { parseMetroId } from "@/lib/metroApi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const metro = parseMetroId(new URL(request.url).searchParams.get("metro"));
    const data = await buildHaitianZcta(metro);

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Error in haitian-zcta API route:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
