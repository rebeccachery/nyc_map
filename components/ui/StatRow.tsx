type StatRowProps = {
  label: string;
  value: string;
  valueClassName?: string;
};

export default function StatRow({
  label,
  value,
  valueClassName = "font-semibold text-zinc-200",
}: StatRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-label">{label}</span>
      <span className={`text-right ${valueClassName}`}>{value}</span>
    </div>
  );
}
