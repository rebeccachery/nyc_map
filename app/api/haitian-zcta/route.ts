import { NextResponse } from "next/server";
import type { Feature } from "geojson";
import { fetchModzctaBoundaries, fetchTigerZctaBoundaries } from "@/lib/boundaries";
import { fetchCensusZctaData } from "@/lib/census";
import { enrichHaitianZctaFeatures } from "@/lib/enrichHaitianZcta";
import { getMiamiMsaZctas, zctaToMiamiCounty } from "@/lib/miamiZctas";
import { parseMetroId } from "@/lib/metroApi";
import { zctaToBorough } from "@/lib/zctaBorough";

export const dynamic = "force-dynamic";

async function buildNycHaitianZcta() {
  const [boundaries, censusByZcta] = await Promise.all([
    fetchModzctaBoundaries(),
    fetchCensusZctaData(),
  ]);

  const rows = [];
  for (const feature of boundaries.features) {
    const zcta = String(feature.properties?.modzcta ?? "").padStart(5, "0");
    const census = censusByZcta.get(zcta);
    if (!zcta || !census || census.totalPop <= 0) continue;

    rows.push({
      zcta,
      feature: feature as Feature,
      census,
      regionName: zctaToBorough(zcta),
    });
  }

  return enrichHaitianZctaFeatures(rows);
}

async function buildMiamiHaitianZcta() {
  const miamiZctas = getMiamiMsaZctas();
  const zctaCodes = miamiZctas.map((entry) => entry.zcta);

  const [boundaries, censusByZcta] = await Promise.all([
    fetchTigerZctaBoundaries(zctaCodes),
    fetchCensusZctaData(),
  ]);

  const boundaryByZcta = new Map<string, Feature>();
  for (const feature of boundaries.features) {
    const zcta = String(feature.properties?.ZCTA5 ?? feature.properties?.zcta ?? "").padStart(
      5,
      "0"
    );
    if (zcta) boundaryByZcta.set(zcta, feature as Feature);
  }

  const rows = [];
  for (const entry of miamiZctas) {
    const feature = boundaryByZcta.get(entry.zcta);
    const census = censusByZcta.get(entry.zcta);
    if (!feature || !census || census.totalPop <= 0) continue;

    rows.push({
      zcta: entry.zcta,
      feature,
      census,
      regionName: entry.county || zctaToMiamiCounty(entry.zcta),
    });
  }

  return enrichHaitianZctaFeatures(rows);
}

export async function GET(request: Request) {
  try {
    const metro = parseMetroId(new URL(request.url).searchParams.get("metro"));
    const data = metro === "miami" ? await buildMiamiHaitianZcta() : await buildNycHaitianZcta();

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
