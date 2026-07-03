import miamiMsaData from "@/data/miami-msa-zctas.json";

export type MiamiZctaEntry = {
  zcta: string;
  county: string;
};

const ZCTA_TO_COUNTY = new Map<string, string>(
  miamiMsaData.zctas.map((entry) => [entry.zcta, entry.county])
);

export function getMiamiMsaZctas(): MiamiZctaEntry[] {
  return miamiMsaData.zctas;
}

export function getMiamiMsaZctaSet(): Set<string> {
  return new Set(miamiMsaData.zctas.map((entry) => entry.zcta));
}

export function zctaToMiamiCounty(zcta: string): string {
  return ZCTA_TO_COUNTY.get(zcta.padStart(5, "0")) ?? "Unknown";
}
