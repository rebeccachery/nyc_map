import type { FeatureCollection } from "geojson";
import type { NeedScoreMode, TierBreaks } from "./haitianNeed";

export type HaitianZctaApiStats = {
  populationTierBreaks: TierBreaks;
  educationTierBreaks: TierBreaks;
  citywide: {
    totalHaitian: number;
    avgPct: number;
    avgEducationScore: number;
    zctaCount: number;
  };
};

export type HaitianZctaApiResponse = {
  features: FeatureCollection;
  stats: HaitianZctaApiStats;
};

export type LayerErrors = Partial<
  Record<"demographics" | "haitianZcta" | "schools" | "libraries", string>
>;

export { type NeedScoreMode };
