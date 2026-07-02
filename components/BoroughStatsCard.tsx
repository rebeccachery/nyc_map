import MetricBar from "@/components/ui/MetricBar";
import SectionHeader from "@/components/ui/SectionHeader";
import StatBlock from "@/components/ui/StatBlock";
import { formatCount, formatLepPct, formatPct } from "@/lib/format";

type BoroughStatsProps = {
  scopeLabel: string;
  haitianPop: number;
  speakers: number;
  limitedEnglish: number;
  pctNoInternet: number;
  pctNoHS: number;
};

export default function BoroughStatsCard({
  scopeLabel,
  haitianPop,
  speakers,
  limitedEnglish,
  pctNoInternet,
  pctNoHS,
}: BoroughStatsProps) {
  return (
    <div className="space-y-3">
      <SectionHeader title={scopeLabel} caption="U.S. Census ACS 2022 county-level estimates" />

      <div className="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-amber-500/5 p-3.5">
        <div className="grid grid-cols-2 gap-4">
          <StatBlock label="Haitian ancestry" value={formatCount(haitianPop)} />
          <StatBlock
            label="Creole speakers"
            value={formatCount(speakers)}
            subtext={formatLepPct(limitedEnglish, speakers)}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-3.5">
        <MetricBar
          label="Households without internet"
          value={pctNoInternet}
          barClassName="bg-red-500"
          valueClassName="font-bold text-red-400"
          pulse
        />
        <MetricBar
          label="Adults without HS diploma"
          value={pctNoHS}
          barClassName="bg-orange-500"
          valueClassName="font-bold text-orange-400"
          pulse
        />
      </div>
    </div>
  );
}

export function CitywideSummary({
  totalHaitian,
  avgPct,
  zctaCount,
}: {
  totalHaitian: number;
  avgPct: number;
  zctaCount: number;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5">
      <SectionHeader
        title="Citywide snapshot"
        caption="Headline stats across all NYC ZIP codes on the map"
      />
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-value text-base">{formatCount(totalHaitian)}</p>
          <p className="text-caption">Haitian ancestry</p>
        </div>
        <div>
          <p className="text-value text-base">{formatPct(avgPct)}</p>
          <p className="text-caption">Avg. ZIP share</p>
        </div>
        <div>
          <p className="text-value text-base">{zctaCount}</p>
          <p className="text-caption">ZIP areas</p>
        </div>
      </div>
    </div>
  );
}
