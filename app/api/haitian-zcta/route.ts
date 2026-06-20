import { NextResponse } from "next/server";
import type { Feature, FeatureCollection } from "geojson";
import {
  CENSUS_VARIABLES,
  getCensusApiKey,
  parseCensusZctaRows,
} from "@/lib/census";
import {
  classifyNeedTier,
  computeCompositeNeedScore,
  computeTierBreaks,
  hasReliableData,
  tierToColorValue,
  type ZctaNeedInput,
} from "@/lib/haitianNeed";
import { zctaToBorough } from "@/lib/zctaBorough";

export const dynamic = "force-dynamic";

const MODZCTA_URL =
  "https://data.cityofnewyork.us/resource/pri4-ifjk.geojson?$limit=500";

async function fetchModzctaBoundaries(): Promise<FeatureCollection> {
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

async function fetchCensusZctaData() {
  const variables = ["NAME", ...CENSUS_VARIABLES].join(",");
  const url = `https://api.census.gov/data/2022/acs/acs5?get=${variables}&for=zip%20code%20tabulation%20area:*&key=${getCensusApiKey()}`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Census API returned status ${res.status}`);
  }
  const data: string[][] = await res.json();
  return parseCensusZctaRows(data);
}

export async function GET() {
  try {
    const [boundaries, censusByZcta] = await Promise.all([
      fetchModzctaBoundaries(),
      fetchCensusZctaData(),
    ]);

    type EnrichedZcta = ZctaNeedInput & {
      modzcta: string;
      feature: Feature;
      census: NonNullable<ReturnType<typeof censusByZcta.get>>;
      haitianPopPct: number;
    };

    const enriched: EnrichedZcta[] = [];

    for (const feature of boundaries.features) {
      const modzcta = String(feature.properties?.modzcta ?? "").padStart(5, "0");
      const census = censusByZcta.get(modzcta);
      if (!modzcta || !census || census.totalPop <= 0) continue;

      const haitianPopPct =
        census.totalPop > 0 ? (census.haitianPop / census.totalPop) * 100 : 0;

      enriched.push({
        modzcta,
        feature,
        census,
        haitianPopPct,
        haitianPop: census.haitianPop,
        totalPop: census.totalPop,
        pctNoInternet: census.pctNoInternet,
        pctNoHS: census.pctNoHS,
      });
    }

    const reliable = enriched.filter((z) => hasReliableData(z.haitianPop, z.totalPop));

    const populationTierBreaks = computeTierBreaks(
      reliable.map((z) => z.haitianPopPct)
    );

    const compositeScores = reliable.map((z) =>
      computeCompositeNeedScore(z, reliable)
    );
    const educationTierBreaks = computeTierBreaks(compositeScores);

    let totalHaitian = 0;
    let pctSum = 0;
    let educationScoreSum = 0;

    const features: Feature[] = enriched.map((row) => {
      const educationNeedScore = hasReliableData(row.haitianPop, row.totalPop)
        ? computeCompositeNeedScore(row, reliable)
        : 0;

      const populationNeedTier = classifyNeedTier(
        row.haitianPopPct,
        row.haitianPop,
        row.totalPop,
        populationTierBreaks
      );
      const educationNeedTier = classifyNeedTier(
        educationNeedScore,
        row.haitianPop,
        row.totalPop,
        educationTierBreaks
      );

      totalHaitian += row.census.haitianPop;
      if (populationNeedTier !== "insufficient_data") {
        pctSum += row.haitianPopPct;
        educationScoreSum += educationNeedScore;
      }

      return {
        ...row.feature,
        id: row.modzcta,
        properties: {
          ...row.feature.properties,
          zcta: row.modzcta,
          borough: zctaToBorough(row.modzcta),
          haitianPop: row.census.haitianPop,
          totalPop: row.census.totalPop,
          haitianPopPct: row.haitianPopPct,
          speakers: row.census.speakers,
          limitedEnglish: row.census.limitedEnglish,
          pctNoInternet: row.census.pctNoInternet,
          pctNoHS: row.census.pctNoHS,
          educationNeedScore,
          populationNeedTier,
          educationNeedTier,
          populationColorValue: tierToColorValue(populationNeedTier),
          educationColorValue: tierToColorValue(educationNeedTier),
          needTier: populationNeedTier,
          colorValue: tierToColorValue(populationNeedTier),
        },
      } satisfies Feature;
    });

    const validCount = reliable.length;

    return NextResponse.json({
      success: true,
      data: {
        features: { type: "FeatureCollection", features } satisfies FeatureCollection,
        stats: {
          populationTierBreaks,
          educationTierBreaks,
          citywide: {
            totalHaitian,
            avgPct: validCount > 0 ? pctSum / validCount : 0,
            avgEducationScore: validCount > 0 ? educationScoreSum / validCount : 0,
            zctaCount: features.length,
          },
        },
      },
    });
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
