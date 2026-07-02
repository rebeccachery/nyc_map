import { notFound } from "next/navigation";
import CommuteApp from "@/components/CommuteApp";
import { getMetroConfig, isValidMetroId } from "@/lib/metroRegistry";

type MetroMapPageProps = {
  params: Promise<{ metroId: string }>;
};

export function generateStaticParams() {
  return [{ metroId: "nyc" }, { metroId: "miami" }];
}

export async function generateMetadata({ params }: MetroMapPageProps) {
  const { metroId } = await params;
  const metro = getMetroConfig(metroId);
  if (!metro) return { title: "Map not found" };
  return {
    title: `${metro.label} · Haitian Educational Equity Map`,
    description: metro.ui.tagline,
  };
}

export default async function MetroMapPage({ params }: MetroMapPageProps) {
  const { metroId } = await params;
  if (!isValidMetroId(metroId)) notFound();

  const metro = getMetroConfig(metroId);
  if (!metro) notFound();

  return <CommuteApp metroId={metroId} />;
}
