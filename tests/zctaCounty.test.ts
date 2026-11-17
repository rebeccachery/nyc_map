import { describe, expect, it } from "vitest";
import { assignZctasToCounties, MIAMI_COUNTIES, parseZctaCountyRel } from "@/lib/zctaCounty";

const HEADER =
  "OID_ZCTA5_20|GEOID_ZCTA5_20|NAMELSAD_ZCTA5_20|AREALAND_ZCTA5_20|AREAWATER_ZCTA5_20|MTFCC_ZCTA5_20|CLASSFP_ZCTA5_20|FUNCSTAT_ZCTA5_20|OID_COUNTY_20|GEOID_COUNTY_20|NAMELSAD_COUNTY_20|AREALAND_COUNTY_20|AREAWATER_COUNTY_20|MTFCC_COUNTY_20|CLASSFP_COUNTY_20|FUNCSTAT_COUNTY_20|AREALAND_PART|AREAWATER_PART";

function row(zcta: string, county: string, land: number) {
  return `1|${zcta}|ZCTA5 ${zcta}|0|0|G6350|B5|S|2|${county}|X County|0|0|G4020|H1|A|${land}|0`;
}

const FILE = [
  HEADER,
  row("33127", "12086", 5_000_000), // Little Haiti, all Miami-Dade
  row("33458", "12099", 60_000_000), // Jupiter: mostly Palm Beach…
  row("33458", "12085", 1_000_000), // …with a sliver in Martin
  row("33455", "12085", 90_000_000), // Hobe Sound: mostly Martin…
  row("33455", "12099", 2_000_000), // …sliver in Palm Beach → excluded
  row("33009", "12011", 7_000_000), // Hallandale, Broward…
  row("33009", "12086", 7_500_000), // …if Miami-Dade part is larger, it wins
  "1|||0|0||||3|12086|Miami-Dade County|0|0|G4020|H1|A|100|0", // county area outside any ZCTA
  row("10001", "36061", 1_000_000), // Manhattan, not in metro
].join("\n");

describe("ZCTA county assignment", () => {
  it("parses the pipe-delimited Census file and skips rows without a ZCTA", () => {
    const parts = parseZctaCountyRel(FILE);
    expect(parts).toHaveLength(8);
    expect(parts[0]).toEqual({ zcta: "33127", countyGeoid: "12086", landPart: 5_000_000 });
  });

  it("assigns each ZCTA to its largest-land county and keeps only metro counties", () => {
    const result = assignZctasToCounties(parseZctaCountyRel(FILE), MIAMI_COUNTIES);
    expect(result).toEqual([
      { zcta: "33009", county: "Miami-Dade" },
      { zcta: "33127", county: "Miami-Dade" },
      { zcta: "33458", county: "Palm Beach" },
    ]);
  });

  it("fails loudly if the file format changes", () => {
    expect(() => parseZctaCountyRel("ZCTA|COUNTY\n33127|12086")).toThrow(/missing columns/);
  });
});
