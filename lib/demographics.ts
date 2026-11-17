import { censusKeyParam } from "@/lib/census";
import type { DemographicsCountyConfig } from "@/lib/metroApi";

const DEMOGRAPHIC_VARIABLES = [
  "B04006_101E",
  "C16001_006E",
  "C16001_008E",
  "B28002_001E",
  "B28002_013E",
  "B15003_001E",
  "B15003_002E",
  "B15003_003E",
  "B15003_004E",
  "B15003_005E",
  "B15003_006E",
  "B15003_007E",
  "B15003_008E",
  "B15003_009E",
  "B15003_010E",
  "B15003_011E",
  "B15003_012E",
  "B15003_013E",
  "B15003_014E",
  "B15003_015E",
  "B15003_016E",
].join(",");

export type DemographicsRow = {
  countyCode: string;
  boroughName?: string;
  countyName?: string;
  haitianPop: number;
  speakers: number;
  limitedEnglish: number;
  pctNoInternet: number;
  pctNoHS: number;
};

export async function fetchCountyDemographics(
  config: DemographicsCountyConfig
): Promise<DemographicsRow[]> {
  const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME,${DEMOGRAPHIC_VARIABLES}&for=county:*&in=state:${config.stateFips}${censusKeyParam()}`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Census API returned status ${res.status}`);
  }

  const data: string[][] = await res.json();
  const headers = data[0];
  const countyIdx = headers.indexOf("county");
  const countySet = new Set(config.counties);

  return data
    .slice(1)
    .filter((row) => countySet.has(row[countyIdx]))
    .map((row) => parseDemographicsRow(row, headers, config));
}

function parseDemographicsRow(
  row: string[],
  headers: string[],
  config: DemographicsCountyConfig
): DemographicsRow {
  const countyCode = row[headers.indexOf("county")];
  const regionName = config.nameByCountyCode[countyCode] || row[0];

  const haitianPop = parseInt(row[headers.indexOf("B04006_101E")], 10) || 0;
  const speakers = parseInt(row[headers.indexOf("C16001_006E")], 10) || 0;
  const limitedEnglish = parseInt(row[headers.indexOf("C16001_008E")], 10) || 0;

  const totalHH = parseInt(row[headers.indexOf("B28002_001E")], 10) || 0;
  const noInternet = parseInt(row[headers.indexOf("B28002_013E")], 10) || 0;
  const pctNoInternet = totalHH > 0 ? (noInternet / totalHH) * 100 : 0;

  const totalEd = parseInt(row[headers.indexOf("B15003_001E")], 10) || 0;
  let lowEdCount = 0;
  for (let i = 2; i <= 16; i++) {
    const varName = `B15003_0${i < 10 ? "0" + i : i}E`;
    lowEdCount += parseInt(row[headers.indexOf(varName)], 10) || 0;
  }
  const pctNoHS = totalEd > 0 ? (lowEdCount / totalEd) * 100 : 0;

  const base = {
    countyCode,
    haitianPop,
    speakers,
    limitedEnglish,
    pctNoInternet,
    pctNoHS,
  };

  if (config.nameField === "countyName") {
    return { ...base, countyName: regionName };
  }

  return { ...base, boroughName: regionName };
}
