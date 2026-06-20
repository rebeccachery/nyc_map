import {
  formatPct,
  formatScore,
  needScoreModeLabel,
  type NeedScoreMode,
  type TierBreaks,
} from "@/lib/haitianNeed";

type HeatLegendProps = {
  mode: NeedScoreMode;
  populationTierBreaks: TierBreaks;
  educationTierBreaks: TierBreaks;
};

export default function HeatLegend({
  mode,
  populationTierBreaks,
  educationTierBreaks,
}: HeatLegendProps) {
  const tierBreaks = mode === "population" ? populationTierBreaks : educationTierBreaks;
  const isEducation = mode === "education";

  return (
    <div
      className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3"
      aria-label={`${needScoreModeLabel(mode)} legend`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {needScoreModeLabel(mode)} — Need Levels
      </p>

      {isEducation && (
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
          Composite score: 40% Haitian pop · 30% no internet · 30% no HS diploma
        </p>
      )}

      <div
        className="mt-2 h-2.5 w-full rounded-full"
        style={{
          background:
            "linear-gradient(to right, rgba(254,243,199,0.65), rgba(251,191,36,0.75), rgba(249,115,22,0.85), rgba(234,88,12,0.95))",
        }}
        aria-hidden
      />

      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-zinc-400">
        <div>
          <span className="mb-0.5 block font-semibold text-zinc-300">Low Need</span>
          <span>
            {isEducation ? (
              <>score &lt; {formatScore(tierBreaks.lowMax)}</>
            ) : (
              <>&lt; {formatPct(tierBreaks.lowMax)}</>
            )}
          </span>
        </div>
        <div className="text-center">
          <span className="mb-0.5 block font-semibold text-amber-400">Medium Need</span>
          <span>
            {isEducation ? (
              <>
                {formatScore(tierBreaks.lowMax)}–{formatScore(tierBreaks.mediumMax)}
              </>
            ) : (
              <>
                {formatPct(tierBreaks.lowMax)}–{formatPct(tierBreaks.mediumMax)}
              </>
            )}
          </span>
        </div>
        <div className="text-right">
          <span className="mb-0.5 block font-semibold text-orange-400">High Need</span>
          <span>
            {isEducation ? (
              <>score ≥ {formatScore(tierBreaks.mediumMax)}</>
            ) : (
              <>≥ {formatPct(tierBreaks.mediumMax)}</>
            )}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500">
        <span
          className="h-2.5 w-2.5 rounded-sm border border-zinc-600 bg-zinc-700/60"
          aria-hidden
        />
        <span>Insufficient ACS data (small sample)</span>
      </div>
    </div>
  );
}
