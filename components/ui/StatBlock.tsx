type StatBlockProps = {
  label: string;
  value: string;
  subtext?: string;
  subtextClassName?: string;
};

export default function StatBlock({
  label,
  value,
  subtext,
  subtextClassName = "text-caption text-zinc-500",
}: StatBlockProps) {
  return (
    <div>
      <p className="text-label">{label}</p>
      <p className="text-value">{value}</p>
      {subtext && <p className={subtextClassName}>{subtext}</p>}
    </div>
  );
}
