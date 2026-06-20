import { NextResponse } from "next/server";
import { getCensusApiKey } from "@/lib/census";

export const dynamic = "force-dynamic";
const STATE_FIPS = "36";
const NYC_COUNTIES = ["005", "047", "061", "081", "085"];

const variables = [
  "B04006_101E", // Haitian Ancestry
  "C16001_006E", // Speakers: French/Haitian/Cajun
  "C16001_008E", // Speakers: French/Haitian/Cajun Limited English
  "B28002_001E", // Internet: Total HH
  "B28002_013E", // Internet: No subscription
  "B15003_001E", // Ed: Total 25+
  // Education without HS diploma (No schooling through 12th grade, no diploma)
  "B15003_002E", "B15003_003E", "B15003_004E", "B15003_005E", "B15003_006E",
  "B15003_007E", "B15003_008E", "B15003_009E", "B15003_010E", "B15003_011E",
  "B15003_012E", "B15003_013E", "B15003_014E", "B15003_015E", "B15003_016E"
].join(",");

const CENSUS_URL = `https://api.census.gov/data/2022/acs/acs5?get=NAME,${variables}&for=county:*&in=state:${STATE_FIPS}&key=${getCensusApiKey()}`;

export async function GET() {
  try {
    const res = await fetch(CENSUS_URL, { next: { revalidate: 3600 } });
    if (!res.ok) {
      throw new Error(`Census API returned status ${res.status}`);
    }
    const data = await res.json();
    const headers: string[] = data[0];
    
    const countyIdx = headers.indexOf("county");
    const countyRows = data.filter((row: string[]) => nycCountiesInclude(row[countyIdx]));

    const boroughMapping: Record<string, string> = {
      "005": "Bronx",
      "047": "Brooklyn",
      "061": "Manhattan",
      "081": "Queens",
      "085": "Staten Island",
    };

    const results = countyRows.map((row: string[]) => {
      const countyCode = row[countyIdx];
      const boroughName = boroughMapping[countyCode] || row[0];
      
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

      return {
        countyCode,
        boroughName,
        haitianPop,
        speakers,
        limitedEnglish,
        pctNoInternet,
        pctNoHS,
      };
    });

    return NextResponse.json({ success: true, data: results });
  } catch (error: unknown) {
    console.error("Error in demographics API route:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

function nycCountiesInclude(countyCode: string): boolean {
  return NYC_COUNTIES.includes(countyCode);
}
