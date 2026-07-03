export type MetroId = "nyc" | "miami";

export type MetroStatus = "live" | "coming_soon";

export type MetroRegion = {
  id: string;
  name: string;
  center: { lat: number; lon: number; zoom: number };
};

export type MetroUiCopy = {
  tagline: string;
  regionLabel: string;
  regionAllLabel: string;
  regionComparisonTitle: string;
  regionComparisonCaption: string;
  scopeOverviewLabel: string;
  zipPlaceholder: string;
  zipSearchErrorInvalid: string;
  zipSearchErrorNotFound: string;
  boundaryFootnote: string;
  dataAttribution: string;
  regionBubblesLabel: string;
  regionPropertyKey: "borough" | "county";
  demographicsNameKey: "boroughName" | "countyName";
};

export type MetroConfig = {
  id: MetroId;
  label: string;
  shortLabel: string;
  status: MetroStatus;
  haitianAncestryHint?: string;
  defaultCenter: { lat: number; lon: number; zoom: number };
  regions: MetroRegion[];
  ui: MetroUiCopy;
  overlays: {
    schools: { enabled: boolean; hasPerformanceMetrics: boolean };
    libraries: { enabled: boolean };
    regionBubbles: { enabled: boolean };
  };
};

export const METROS: MetroConfig[] = [
  {
    id: "nyc",
    label: "New York City",
    shortLabel: "NYC",
    status: "live",
    haitianAncestryHint: "~850k Haitian ancestry",
    defaultCenter: { lat: 40.7128, lon: -74.006, zoom: 10.2 },
    regions: [
      { id: "brooklyn", name: "Brooklyn", center: { lat: 40.6501, lon: -73.9496, zoom: 11.2 } },
      { id: "queens", name: "Queens", center: { lat: 40.7282, lon: -73.7949, zoom: 11.2 } },
      { id: "manhattan", name: "Manhattan", center: { lat: 40.7831, lon: -73.9712, zoom: 11.8 } },
      { id: "bronx", name: "Bronx", center: { lat: 40.8448, lon: -73.8648, zoom: 11.8 } },
      {
        id: "staten-island",
        name: "Staten Island",
        center: { lat: 40.5795, lon: -74.1502, zoom: 11.2 },
      },
    ],
    ui: {
      tagline: "Explore Haitian population and educational need by ZIP code across the five boroughs.",
      regionLabel: "borough",
      regionAllLabel: "All of NYC",
      regionComparisonTitle: "Borough comparison",
      regionComparisonCaption: "County-level Census estimates for broader context",
      scopeOverviewLabel: "Citywide overview",
      zipPlaceholder: "e.g. 11203",
      zipSearchErrorInvalid: "Enter a 5-digit NYC ZIP code.",
      zipSearchErrorNotFound: "ZIP code not found on this map.",
      boundaryFootnote: "U.S. Census ACS 2022 · NYC Open Data · ZIP code areas (MODZCTA)",
      dataAttribution: "NYC Open Data",
      regionBubblesLabel: "Borough population bubbles",
      regionPropertyKey: "borough",
      demographicsNameKey: "boroughName",
    },
    overlays: {
      schools: { enabled: true, hasPerformanceMetrics: true },
      libraries: { enabled: true },
      regionBubbles: { enabled: true },
    },
  },
  {
    id: "miami",
    label: "Miami Metro",
    shortLabel: "Miami",
    status: "live",
    haitianAncestryHint: "~830k Haitian ancestry",
    defaultCenter: { lat: 25.85, lon: -80.25, zoom: 9.5 },
    regions: [
      {
        id: "miami-dade",
        name: "Miami-Dade",
        center: { lat: 25.65, lon: -80.45, zoom: 10.5 },
      },
      { id: "broward", name: "Broward", center: { lat: 26.15, lon: -80.2, zoom: 10.5 } },
      {
        id: "palm-beach",
        name: "Palm Beach",
        center: { lat: 26.65, lon: -80.1, zoom: 10.0 },
      },
    ],
    ui: {
      tagline:
        "Explore Haitian population and educational need by ZIP code across Miami-Dade, Broward, and Palm Beach counties.",
      regionLabel: "county",
      regionAllLabel: "All of Miami Metro",
      regionComparisonTitle: "County comparison",
      regionComparisonCaption: "County-level Census estimates for broader context",
      scopeOverviewLabel: "Metro-wide overview",
      zipPlaceholder: "e.g. 33127",
      zipSearchErrorInvalid: "Enter a 5-digit ZIP code in this metro.",
      zipSearchErrorNotFound: "ZIP code not found on this map.",
      boundaryFootnote: "U.S. Census ACS 2022 · Miami-Dade, Broward & Palm Beach GIS · ZIP code areas (ZCTA)",
      dataAttribution: "Miami-Dade, Broward & Palm Beach GIS",
      regionBubblesLabel: "County population bubbles",
      regionPropertyKey: "county",
      demographicsNameKey: "countyName",
    },
    overlays: {
      schools: { enabled: true, hasPerformanceMetrics: false },
      libraries: { enabled: true },
      regionBubbles: { enabled: true },
    },
  },
];

export const DEFAULT_METRO_ID: MetroId = "nyc";

const METRO_BY_ID = new Map<MetroId, MetroConfig>(
  METROS.map((metro) => [metro.id, metro])
);

export function isValidMetroId(id: string): id is MetroId {
  return METRO_BY_ID.has(id as MetroId);
}

export function getMetroConfig(id: string): MetroConfig | undefined {
  if (!isValidMetroId(id)) return undefined;
  return METRO_BY_ID.get(id);
}

export function getLiveMetros(): MetroConfig[] {
  return METROS.filter((metro) => metro.status === "live");
}

export function isMetroLive(metro: MetroConfig): boolean {
  return metro.status === "live";
}

export function getRegionCenter(
  metro: MetroConfig,
  regionName: string | null
): { lat: number; lon: number; zoom: number } {
  if (!regionName) return metro.defaultCenter;
  const region = metro.regions.find((r) => r.name === regionName);
  return region?.center ?? metro.defaultCenter;
}
