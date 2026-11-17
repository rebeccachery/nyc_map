import type { MetroId } from "@/lib/metroRegistry";
import { getMetroConfig } from "@/lib/metroRegistry";

const ALIASES: Record<MetroId, Record<string, string>> = {
  miami: {
    miamidade: "Miami-Dade",
    dade: "Miami-Dade",
    miamidadecounty: "Miami-Dade",
    dadecounty: "Miami-Dade",
    broward: "Broward",
    browardcounty: "Broward",
    palmbeach: "Palm Beach",
    palmbeachcounty: "Palm Beach",
    pbc: "Palm Beach",
  },
  nyc: {
    brooklyn: "Brooklyn",
    kings: "Brooklyn",
    kingscounty: "Brooklyn",
    queens: "Queens",
    queenscounty: "Queens",
    manhattan: "Manhattan",
    newyorkcounty: "Manhattan",
    bronx: "Bronx",
    thebronx: "Bronx",
    bronxcounty: "Bronx",
    statenisland: "Staten Island",
    richmond: "Staten Island",
    richmondcounty: "Staten Island",
  },
};

/** Words that name the whole metro rather than one county/borough. */
const METRO_WORDS: Record<MetroId, string[]> = {
  miami: ["miami", "miamimetro", "southflorida", "all", "everywhere", "metro"],
  nyc: ["nyc", "newyork", "newyorkcity", "all", "everywhere", "citywide", "city"],
};

function key(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

export type RegionResolution =
  | { ok: true; region: string }
  | { ok: false; error: string; hint: string };

export function listRegions(metro: MetroId): string[] {
  return getMetroConfig(metro)!.regions.map((r) => r.name);
}

export function resolveRegion(metro: MetroId, text: string): RegionResolution {
  const k = key(text);
  const match = ALIASES[metro][k];
  if (match) return { ok: true, region: match };
  const regions = listRegions(metro);
  if (METRO_WORDS[metro].includes(k)) {
    const label = getMetroConfig(metro)!.label;
    return {
      ok: false,
      error: `"${text}" names the whole ${label}, not one ${getMetroConfig(metro)!.ui.regionLabel}.`,
      hint:
        metro === "miami" && k === "miami"
          ? `Omit "regions" to cover the whole metro, or use "Miami-Dade" if the user means the county.`
          : `Omit "regions" to cover the whole metro.`,
    };
  }
  return {
    ok: false,
    error: `Unknown ${getMetroConfig(metro)!.ui.regionLabel} "${text}".`,
    hint: `Use one of: ${regions.join(", ")}.`,
  };
}
