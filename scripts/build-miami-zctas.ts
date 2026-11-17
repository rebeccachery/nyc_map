/**
 * Regenerates data/miami-msa-zctas.json from the Census 2020 ZCTA-to-county relationship file.
 *
 *   npm run zctas:miami
 *
 * Prints which ZIPs were added or removed compared with the current list.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assignZctasToCounties,
  MIAMI_COUNTIES,
  parseZctaCountyRel,
  ZCTA_COUNTY_REL_URL,
} from "@/lib/zctaCounty";

const OUTPUT = path.join(process.cwd(), "data", "miami-msa-zctas.json");

async function main() {
  console.log(`Downloading ${ZCTA_COUNTY_REL_URL} …`);
  const res = await fetch(ZCTA_COUNTY_REL_URL);
  if (!res.ok) throw new Error(`Census relationship file returned status ${res.status}`);
  const zctas = assignZctasToCounties(parseZctaCountyRel(await res.text()), MIAMI_COUNTIES);
  if (zctas.length < 150) {
    throw new Error(`Only ${zctas.length} ZIPs matched the three counties; refusing to overwrite.`);
  }

  const before = new Map<string, string>(
    (JSON.parse(readFileSync(OUTPUT, "utf8")).zctas as { zcta: string; county: string }[]).map(
      (e) => [e.zcta, e.county]
    )
  );
  const after = new Map(zctas.map((e) => [e.zcta, e.county]));

  const added = zctas.filter((e) => !before.has(e.zcta));
  const removed = [...before].filter(([z]) => !after.has(z));
  const moved = zctas.filter((e) => before.has(e.zcta) && before.get(e.zcta) !== e.county);

  writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        source: ZCTA_COUNTY_REL_URL,
        rule: "Each 2020 ZCTA is assigned to the county holding the largest share of its land area; ZCTAs whose main county is Miami-Dade, Broward, or Palm Beach are included.",
        zctas,
      },
      null,
      2
    ) + "\n"
  );

  const counts = Object.values(MIAMI_COUNTIES)
    .map((c) => `${c} ${zctas.filter((e) => e.county === c).length}`)
    .join(", ");
  console.log(`Wrote ${zctas.length} ZIPs (${counts}) to ${OUTPUT}`);
  console.log(`Added (${added.length}): ${added.map((e) => `${e.zcta} ${e.county}`).join(", ") || "none"}`);
  console.log(`Removed (${removed.length}): ${removed.map(([z, c]) => `${z} ${c}`).join(", ") || "none"}`);
  if (moved.length > 0) {
    console.log(`County changed (${moved.length}): ${moved.map((e) => `${e.zcta} → ${e.county}`).join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
