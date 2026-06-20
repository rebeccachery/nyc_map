export type NeedTier = "high" | "medium" | "low" | "insufficient_data";

export type NeedScoreMode = "population" | "education";

export type TierBreaks = {
  lowMax: number;
  mediumMax: number;
};

export type ZctaNeedInput = {
  haitianPopPct: number;
  pctNoInternet: number;
  pctNoHS: number;
  haitianPop: number;
  totalPop: number;
};

const MIN_TOTAL_POP = 500;
const MIN_HAITIAN_POP = 10;

export const COMPOSITE_WEIGHTS = {
  haitianPopPct: 0.4,
  pctNoInternet: 0.3,
  pctNoHS: 0.3,
} as const;

export function hasReliableData(haitianPop: number, totalPop: number): boolean {
  return totalPop >= MIN_TOTAL_POP && haitianPop >= MIN_HAITIAN_POP;
}

export function computeTierBreaks(values: number[]): TierBreaks {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return { lowMax: 0, mediumMax: 0 };

  return {
    lowMax: percentile(sorted, 0.33),
    mediumMax: percentile(sorted, 0.67),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function percentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  const below = allValues.filter((v) => v < value).length;
  const equal = allValues.filter((v) => v === value).length;
  return ((below + equal * 0.5) / allValues.length) * 100;
}

export function computeCompositeNeedScore(
  input: ZctaNeedInput,
  context: ZctaNeedInput[]
): number {
  const popValues = context.map((c) => c.haitianPopPct);
  const netValues = context.map((c) => c.pctNoInternet);
  const edValues = context.map((c) => c.pctNoHS);

  const popRank = percentileRank(input.haitianPopPct, popValues);
  const netRank = percentileRank(input.pctNoInternet, netValues);
  const edRank = percentileRank(input.pctNoHS, edValues);

  return (
    COMPOSITE_WEIGHTS.haitianPopPct * popRank +
    COMPOSITE_WEIGHTS.pctNoInternet * netRank +
    COMPOSITE_WEIGHTS.pctNoHS * edRank
  );
}

export function classifyNeedTier(
  value: number,
  haitianPop: number,
  totalPop: number,
  breaks: TierBreaks
): NeedTier {
  if (!hasReliableData(haitianPop, totalPop)) return "insufficient_data";
  if (value >= breaks.mediumMax) return "high";
  if (value >= breaks.lowMax) return "medium";
  return "low";
}

export function tierToColorValue(tier: NeedTier): number {
  switch (tier) {
    case "insufficient_data":
      return 0;
    case "low":
      return 0.33;
    case "medium":
      return 0.66;
    case "high":
      return 1;
  }
}

export function tierLabel(tier: NeedTier): string {
  switch (tier) {
    case "high":
      return "High Need";
    case "medium":
      return "Medium Need";
    case "low":
      return "Low Need";
    case "insufficient_data":
      return "Insufficient Data";
  }
}

export function needScoreModeLabel(mode: NeedScoreMode): string {
  return mode === "population" ? "Haitian Population" : "Educational Need";
}

export function getActiveNeedFromProperties(
  properties: Record<string, unknown>,
  mode: NeedScoreMode
): {
  needTier: NeedTier;
  colorValue: number;
  scoreValue: number;
} {
  if (mode === "education") {
    return {
      needTier: (properties.educationNeedTier as NeedTier) ?? "insufficient_data",
      colorValue: Number(properties.educationColorValue ?? 0),
      scoreValue: Number(properties.educationNeedScore ?? 0),
    };
  }
  return {
    needTier: (properties.populationNeedTier as NeedTier) ?? "insufficient_data",
    colorValue: Number(properties.populationColorValue ?? 0),
    scoreValue: Number(properties.haitianPopPct ?? 0),
  };
}

export const HAITIAN_COLORSCALE: [number, string][] = [
  [0, "rgba(63, 63, 70, 0.35)"],
  [0.01, "rgba(254, 243, 199, 0.55)"],
  [0.33, "rgba(251, 191, 36, 0.65)"],
  [0.66, "rgba(249, 115, 22, 0.75)"],
  [1, "rgba(234, 88, 12, 0.9)"],
];

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatScore(value: number): string {
  return value.toFixed(1);
}
