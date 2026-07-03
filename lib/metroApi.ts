import { DEFAULT_METRO_ID, isValidMetroId, type MetroId } from "@/lib/metroRegistry";

export function parseMetroId(value: string | null | undefined): MetroId {
  if (value && isValidMetroId(value)) return value;
  return DEFAULT_METRO_ID;
}

export function metroApiQuery(metroId: MetroId): string {
  return `?metro=${metroId}`;
}

export type DemographicsCountyConfig = {
  stateFips: string;
  counties: string[];
  nameByCountyCode: Record<string, string>;
  nameField: "boroughName" | "countyName";
};

export const DEMOGRAPHICS_BY_METRO: Record<MetroId, DemographicsCountyConfig> = {
  nyc: {
    stateFips: "36",
    counties: ["005", "047", "061", "081", "085"],
    nameByCountyCode: {
      "005": "Bronx",
      "047": "Brooklyn",
      "061": "Manhattan",
      "081": "Queens",
      "085": "Staten Island",
    },
    nameField: "boroughName",
  },
  miami: {
    stateFips: "12",
    counties: ["086", "011", "099"],
    nameByCountyCode: {
      "086": "Miami-Dade",
      "011": "Broward",
      "099": "Palm Beach",
    },
    nameField: "countyName",
  },
};
