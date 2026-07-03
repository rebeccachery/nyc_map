import type { Feature, FeatureCollection } from "geojson";
import type { ParsedZctaRow } from "@/lib/census";
import {
  classifyNeedTier,
  computeCompositeNeedScore,
  computeTierBreaks,
  hasReliableData,
  tierToColorValue,
  type ZctaNeedInput,
} from "@/lib/haitianNeed";
import type { HaitianZctaApiResponse } from "@/lib/haitianZctaTypes";

export type ZctaBoundaryJoinInput = {
  zcta: string;
  feature: Feature;
  census: ParsedZctaRow;
  regionName: string;
};

export function enrichHaitianZctaFeatures(
  rows: ZctaBoundaryJoinInput[]
): HaitianZctaApiResponse {
  type EnrichedZcta = ZctaNeedInput & ZctaBoundaryJoinInput & { haitianPopPct: number };

  const enriched: EnrichedZcta[] = rows.map((row) => ({
    ...row,
    haitianPopPct: row.census.totalPop > 0 ? (row.census.haitianPop / row.census.totalPop) * 100 : 0,
    haitianPop: row.census.haitianPop,
    totalPop: row.census.totalPop,
    pctNoInternet: row.census.pctNoInternet,
    pctNoHS: row.census.pctNoHS,
  }));

  const reliable = enriched.filter((z) => hasReliableData(z.haitianPop, z.totalPop));
  const populationTierBreaks = computeTierBreaks(reliable.map((z) => z.haitianPopPct));
  const educationTierBreaks = computeTierBreaks(
    reliable.map((z) => computeCompositeNeedScore(z, reliable))
  );

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

    const regionProps =
      row.regionName && row.regionName !== "Unknown"
        ? { borough: row.regionName, county: row.regionName }
        : {};

    return {
      ...row.feature,
      id: row.zcta,
      properties: {
        ...row.feature.properties,
        zcta: row.zcta,
        ...regionProps,
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

  return {
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
  };
}
