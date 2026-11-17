/**
 * Builds a metro's ZIP (ZCTA) list from the Census 2020 ZCTA-to-county relationship file,
 * instead of maintaining it by hand.
 *
 * Rule: a ZCTA belongs to the county holding the largest share of its land area, and is
 * included when that county is one of the metro's counties.
 */
export const ZCTA_COUNTY_REL_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt";

export type ZctaCountyPart = { zcta: string; countyGeoid: string; landPart: number };

const REQUIRED = ["GEOID_ZCTA5_20", "GEOID_COUNTY_20", "AREALAND_PART"] as const;

export function parseZctaCountyRel(text: string): ZctaCountyPart[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) throw new Error("ZCTA-county relationship file is empty");
  const header = lines[0].replace(/^﻿/, "");
  const delim = header.includes("|") ? "|" : ",";
  const cols = header.split(delim);
  const idx = Object.fromEntries(REQUIRED.map((name) => [name, cols.indexOf(name)])) as Record<
    (typeof REQUIRED)[number],
    number
  >;
  const missing = REQUIRED.filter((name) => idx[name] < 0);
  if (missing.length > 0) {
    throw new Error(`ZCTA-county relationship file is missing columns: ${missing.join(", ")}`);
  }

  const parts: ZctaCountyPart[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(delim);
    const zcta = cells[idx.GEOID_ZCTA5_20]?.trim();
    const countyGeoid = cells[idx.GEOID_COUNTY_20]?.trim();
    if (!zcta || !countyGeoid) continue; // county area not inside any ZCTA
    parts.push({ zcta, countyGeoid, landPart: Number(cells[idx.AREALAND_PART]) || 0 });
  }
  return parts;
}

/** Returns [{ zcta, county }] sorted by ZCTA, using the largest-land-share rule. */
export function assignZctasToCounties(
  parts: ZctaCountyPart[],
  countyNameByGeoid: Record<string, string>
): { zcta: string; county: string }[] {
  const best = new Map<string, { countyGeoid: string; land: number }>();
  for (const { zcta, countyGeoid, landPart } of parts) {
    const current = best.get(zcta);
    if (!current || landPart > current.land) best.set(zcta, { countyGeoid, land: landPart });
  }

  const result: { zcta: string; county: string }[] = [];
  for (const [zcta, { countyGeoid, land }] of best) {
    const county = countyNameByGeoid[countyGeoid];
    if (county && land > 0) result.push({ zcta, county });
  }
  return result.sort((a, b) => a.zcta.localeCompare(b.zcta));
}

export const MIAMI_COUNTIES: Record<string, string> = {
  "12086": "Miami-Dade",
  "12011": "Broward",
  "12099": "Palm Beach",
};
