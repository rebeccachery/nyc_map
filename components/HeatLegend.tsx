import { formatPct, formatScore } from "@/lib/format";
import { needScoreModeLabel, type NeedScoreMode, type TierBreaks } from "@/lib/haitianNeed";
import { legendSwatchClass } from "@/components/ui/NeedBadge";
import SectionHeader from "@/components/ui/SectionHeader";

type HeatLegendProps = {
  mode: NeedScoreMode;
  populationTierBreaks: TierBreaks;
  educationTierBreaks: TierBreaks;
};

type LegendRow = {
  tier: "low" | "medium" | "high" | "insufficient_data";
  label: string;
  threshold: string;
};

function buildRows(mode: NeedScoreMode, breaks: TierBreaks): LegendRow[] {
  const isEducation = mode === "education";

  return [
    {
      tier: "low",
      label: "Low need",
      threshold: isEducation
        ? `Score below ${formatScore(breaks.lowMax)}`
        : `Below ${formatPct(breaks.lowMax)} Haitian population`,
    },
    {
      tier: "medium",
      label: "Medium need",
      threshold: isEducation
        ? `${formatScore(breaks.lowMax)} – ${formatScore(breaks.mediumMax)}`
        : `${formatPct(breaks.lowMax)} – ${formatPct(breaks.mediumMax)}`,
    },
    {
      tier: "high",
      label: "High need",
      threshold: isEducation
        ? `Score ${formatScore(breaks.mediumMax)} and above`
        : `${formatPct(breaks.mediumMax)} and above`,
    },
    {
      tier: "insufficient_data",
      label: "Insufficient data",
      threshold: "Small sample — Census estimate unreliable",
    },
  ];
}

export default function HeatLegend({
  mode,
  populationTierBreaks,
  educationTierBreaks,
}: HeatLegendProps) {
  const tierBreaks = mode === "population" ? populationTierBreaks : educationTierBreaks;
  const rows = buildRows(mode, tierBreaks);

  return (
    <div
      className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3"
      aria-label={`${needScoreModeLabel(mode)} legend`}
    >
      <SectionHeader
        title={`${needScoreModeLabel(mode)} — need levels`}
        caption={
          mode === "education"
            ? "Combines Haitian population (40%), households without internet (30%), and adults without a high school diploma (30%). Tiers are relative to NYC ZIP codes with reliable data."
            : "Tiers are relative to all NYC ZIP codes with reliable Census data."
        }
      />

      <ul className="mt-3 space-y-2.5">
        {rows.map((row) => (
          <li key={row.tier} className="flex gap-2.5">
            <span
              className={`mt-0.5 h-3 w-3 shrink-0 rounded-sm ${legendSwatchClass(row.tier)}`}
              aria-hidden
            />
            <div>
              <p className="text-xs font-semibold text-zinc-200">{row.label}</p>
              <p className="text-caption">{row.threshold}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
