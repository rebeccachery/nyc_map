export const CENSUS_VARIABLES = [
  "B04006_101E",
  "B01003_001E",
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
] as const;

export function getCensusApiKey(): string | undefined {
  const key = process.env.CENSUS_API_KEY?.trim();
  return key ? key : undefined;
}

/** `&key=...` when a key is configured; the Census API also works keyless at low rate limits. */
export function censusKeyParam(): string {
  const key = getCensusApiKey();
  return key ? `&key=${encodeURIComponent(key)}` : "";
}

export const CENSUS_ACS_ZCTA_URL = "https://api.census.gov/data/2022/acs/acs5";

export type ParsedZctaRow = {
  zcta: string;
  haitianPop: number;
  totalPop: number;
  speakers: number;
  limitedEnglish: number;
  pctNoInternet: number;
  pctNoHS: number;
};

export async function fetchCensusZctaData(): Promise<Map<string, ParsedZctaRow>> {
  const variables = ["NAME", ...CENSUS_VARIABLES].join(",");
  const url = `https://api.census.gov/data/2022/acs/acs5?get=${variables}&for=zip%20code%20tabulation%20area:*${censusKeyParam()}`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Census API returned status ${res.status}`);
  }
  const data: string[][] = await res.json();
  return parseCensusZctaRows(data);
}

export function parseCensusZctaRows(data: string[][]): Map<string, ParsedZctaRow> {
  const headers = data[0];
  const zctaIdx = headers.indexOf("zip code tabulation area");
  const map = new Map<string, ParsedZctaRow>();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const zcta = row[zctaIdx];
    if (!zcta) continue;

    const haitianPop = parseInt(row[headers.indexOf("B04006_101E")], 10) || 0;
    const totalPop = parseInt(row[headers.indexOf("B01003_001E")], 10) || 0;
    const speakers = parseInt(row[headers.indexOf("C16001_006E")], 10) || 0;
    const limitedEnglish =
      parseInt(row[headers.indexOf("C16001_008E")], 10) || 0;

    const totalHH = parseInt(row[headers.indexOf("B28002_001E")], 10) || 0;
    const noInternet = parseInt(row[headers.indexOf("B28002_013E")], 10) || 0;
    const pctNoInternet = totalHH > 0 ? (noInternet / totalHH) * 100 : 0;

    const totalEd = parseInt(row[headers.indexOf("B15003_001E")], 10) || 0;
    let lowEdCount = 0;
    for (let j = 2; j <= 16; j++) {
      const varName = `B15003_0${j < 10 ? "0" + j : j}E`;
      lowEdCount += parseInt(row[headers.indexOf(varName)], 10) || 0;
    }
    const pctNoHS = totalEd > 0 ? (lowEdCount / totalEd) * 100 : 0;

    map.set(zcta, {
      zcta,
      haitianPop,
      totalPop,
      speakers,
      limitedEnglish,
      pctNoInternet,
      pctNoHS,
    });
  }

  return map;
}
