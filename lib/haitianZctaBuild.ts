import type { Feature } from "geojson";
import { fetchModzctaBoundaries, fetchTigerZctaBoundaries } from "@/lib/boundaries";
import { fetchCensusZctaData } from "@/lib/census";
import { enrichHaitianZctaFeatures } from "@/lib/enrichHaitianZcta";
import type { HaitianZctaApiResponse } from "@/lib/haitianZctaTypes";
import type { MetroId } from "@/lib/metroRegistry";
import { getMiamiMsaZctas, zctaToMiamiCounty } from "@/lib/miamiZctas";
import { zctaToBorough } from "@/lib/zctaBorough";

/**
 * Joins ZIP boundaries with Census ACS rows and scores need tiers.
 * Shared by the live `/api/haitian-zcta` route and `scripts/snapshot.ts`,
 * so the frozen snapshot uses exactly the same logic as the map.
 */
export async function buildNycHaitianZcta(): Promise<HaitianZctaApiResponse> {
  const [boundaries, censusByZcta] = await Promise.all([
    fetchModzctaBoundaries(),
    fetchCensusZctaData(),
  ]);

  const rows = [];
  for (const feature of boundaries.features) {
    const zcta = String(feature.properties?.modzcta ?? "").padStart(5, "0");
    const census = censusByZcta.get(zcta);
    if (!zcta || !census || census.totalPop <= 0) continue;

    rows.push({
      zcta,
      feature: feature as Feature,
      census,
      regionName: zctaToBorough(zcta),
    });
  }

  return enrichHaitianZctaFeatures(rows);
}

export async function buildMiamiHaitianZcta(): Promise<HaitianZctaApiResponse> {
  const miamiZctas = getMiamiMsaZctas();
  const zctaCodes = miamiZctas.map((entry) => entry.zcta);

  const [boundaries, censusByZcta] = await Promise.all([
    fetchTigerZctaBoundaries(zctaCodes),
    fetchCensusZctaData(),
  ]);

  const boundaryByZcta = new Map<string, Feature>();
  for (const feature of boundaries.features) {
    const zcta = String(feature.properties?.ZCTA5 ?? feature.properties?.zcta ?? "").padStart(
      5,
      "0"
    );
    if (zcta) boundaryByZcta.set(zcta, feature as Feature);
  }

  const rows = [];
  for (const entry of miamiZctas) {
    const feature = boundaryByZcta.get(entry.zcta);
    const census = censusByZcta.get(entry.zcta);
    if (!feature || !census || census.totalPop <= 0) continue;

    rows.push({
      zcta: entry.zcta,
      feature,
      census,
      regionName: entry.county || zctaToMiamiCounty(entry.zcta),
    });
  }

  return enrichHaitianZctaFeatures(rows);
}

export function buildHaitianZcta(metro: MetroId): Promise<HaitianZctaApiResponse> {
  return metro === "miami" ? buildMiamiHaitianZcta() : buildNycHaitianZcta();
}
