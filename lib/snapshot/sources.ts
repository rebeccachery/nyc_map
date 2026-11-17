import type { MetroId } from "@/lib/metroRegistry";
import type { SourceRef } from "@/lib/snapshot/types";

export const CENSUS_SOURCE: SourceRef = {
  id: "census-acs5-2022",
  name: "U.S. Census Bureau, ACS 2022 5-year estimates",
  url: "https://api.census.gov/data/2022/acs/acs5",
  usedFor:
    "Haitian ancestry (B04006), population (B01003), speakers of French, Haitian Creole, or Cajun and how well they speak English (C16001), households without internet (B28002), adults 25+ without a high school diploma (B15003)",
};

export const SOURCES_BY_METRO: Record<MetroId, SourceRef[]> = {
  nyc: [
    CENSUS_SOURCE,
    {
      id: "nyc-modzcta",
      name: "NYC Open Data, Modified ZIP Code Tabulation Areas (MODZCTA)",
      url: "https://data.cityofnewyork.us/Health/Modified-Zip-Code-Tabulation-Areas-MODZCTA-/pri4-ifjk",
      usedFor: "ZIP boundaries",
    },
    {
      id: "nyc-libraries",
      name: "NYC Open Data, Public Library Locations",
      url: "https://data.cityofnewyork.us/City-Government/Public-Library-Locations/feuq-due4",
      usedFor: "Library locations",
    },
    {
      id: "nyc-schools",
      name: "NYC Open Data, 2018–2019 School-Level Detailed Report Card",
      url: "https://data.cityofnewyork.us/Education/2018-2019-School-Level-Detailed-Report-Card/vw9i-7mzq",
      usedFor: "School locations and performance (graduation, attendance, ELL programs)",
    },
  ],
  miami: [
    CENSUS_SOURCE,
    {
      id: "tiger-zcta",
      name: "Census TIGERweb, ZIP Code Tabulation Areas",
      url: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/11",
      usedFor: "ZIP boundaries",
    },
    {
      id: "mdc-libraries",
      name: "Miami-Dade County GIS, Library layer (MD_Emaps)",
      url: "https://gisweb.miamidade.gov/arcgis/rest/services/MD_Emaps/MapServer/3",
      usedFor: "Miami-Dade library locations",
    },
    {
      id: "mdc-schools",
      name: "Miami-Dade County GIS, Public Schools layer (MD_Emaps)",
      url: "https://gisweb.miamidade.gov/arcgis/rest/services/MD_Emaps/MapServer/25",
      usedFor: "Miami-Dade school locations",
    },
    {
      id: "broward-libraries",
      name: "Broward County GIS, Libraries layer",
      url: "https://bcgishub.broward.org/server/rest/services/Core/Libraries/MapServer/0",
      usedFor: "Broward library locations",
    },
    {
      id: "broward-schools",
      name: "Broward County GeoHub, Schools",
      url: "https://geohub-bcgis.opendata.arcgis.com/datasets/b888ffdf409044829a8cfe9d69c16a02_0",
      usedFor: "Broward school locations",
    },
    {
      id: "pbc-libraries",
      name: "Palm Beach County GIS, Education Open Data (Libraries)",
      url: "https://maps.co.palm-beach.fl.us/arcgis/rest/services/OpenData/Education_Open_Data/MapServer/5",
      usedFor: "Palm Beach library locations",
    },
    {
      id: "pbc-schools",
      name: "Palm Beach County GIS, Education Open Data (Schools)",
      url: "https://maps.co.palm-beach.fl.us/arcgis/rest/services/OpenData/Education_Open_Data/MapServer/0",
      usedFor: "Palm Beach school locations",
    },
  ],
};

const MIAMI_COUNTY_PREFIX: Record<string, string> = {
  "Miami-Dade": "mdc",
  Broward: "broward",
  "Palm Beach": "pbc",
};

/** Which source a normalized library/school feature came from. */
export function placeSourceId(
  metro: MetroId,
  kind: "library" | "school",
  props: Record<string, unknown>
): string {
  const suffix = kind === "library" ? "libraries" : "schools";
  if (metro === "nyc") return `nyc-${suffix}`;
  const prefix = MIAMI_COUNTY_PREFIX[String(props.county ?? "")];
  if (!prefix) throw new Error(`Unknown Miami county on ${kind}: ${String(props.county)}`);
  return `${prefix}-${suffix}`;
}

export function zipBoundarySourceId(metro: MetroId): string {
  return metro === "nyc" ? "nyc-modzcta" : "tiger-zcta";
}
