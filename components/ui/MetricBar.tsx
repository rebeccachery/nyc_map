import { formatPct } from "@/lib/format";

type MetricBarProps = {
  label: string;
  value: number;
  barClassName?: string;
  valueClassName?: string;
  pulse?: boolean;
};

export default function MetricBar({
  label,
  value,
  barClassName = "bg-red-500",
  valueClassName = "font-bold text-red-400",
  pulse = false,
}: MetricBarProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
        <span className="flex items-center gap-1.5">
          {pulse && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-80" />
          )}
          <span className="text-label font-semibold text-zinc-300">{label}</span>
        </span>
        <span className={valueClassName}>{formatPct(value)}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClassName}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}
