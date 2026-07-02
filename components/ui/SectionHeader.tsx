type SectionHeaderProps = {
  title: string;
  caption?: string;
};

export default function SectionHeader({ title, caption }: SectionHeaderProps) {
  return (
    <div>
      <p className="text-section-title">{title}</p>
      {caption && <p className="mt-1 text-caption">{caption}</p>}
    </div>
  );
}
