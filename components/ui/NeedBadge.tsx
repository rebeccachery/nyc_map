import type { NeedTier } from "@/lib/haitianNeed";
import { tierLabel } from "@/lib/haitianNeed";

type NeedBadgeProps = {
  tier: NeedTier;
  className?: string;
};

function tierBadgeClass(tier: NeedTier): string {
  switch (tier) {
    case "high":
      return "bg-orange-600/90 text-orange-50";
    case "medium":
      return "bg-amber-500/90 text-amber-950";
    case "low":
      return "bg-zinc-600/90 text-zinc-100";
    case "insufficient_data":
      return "bg-zinc-700/80 text-zinc-300";
  }
}

export default function NeedBadge({ tier, className = "" }: NeedBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${tierBadgeClass(tier)} ${className}`}
    >
      {tierLabel(tier)}
    </span>
  );
}

export function legendSwatchClass(tier: NeedTier): string {
  switch (tier) {
    case "high":
      return "bg-orange-500";
    case "medium":
      return "bg-amber-400";
    case "low":
      return "bg-amber-100/80";
    case "insufficient_data":
      return "border border-zinc-600 bg-zinc-700/60";
  }
}
