import type { Feature, FeatureCollection } from "geojson";
import type { ParsedZctaRow } from "@/lib/census";
import { enrichHaitianZctaFeatures } from "@/lib/enrichHaitianZcta";
import type { HaitianZctaApiResponse } from "@/lib/haitianZctaTypes";

/**
 * A tiny fake "Miami" metro: a 4×3 grid of square ZIPs (each ~0.01° ≈ 1.1 km wide)
 * starting at lon -80.20, lat 25.80. Census values vary so tiers spread out;
 * ZIP 33912 is deliberately too small to be reliable.
 */
export const ORIGIN = { lon: -80.2, lat: 25.8 };
export const CELL = 0.01;

const COUNTIES = ["Miami-Dade", "Broward", "Palm Beach"];

export function cellCenter(col: number, row: number): [number, number] {
  return [ORIGIN.lon + (col + 0.5) * CELL, ORIGIN.lat + (row + 0.5) * CELL];
}

function square(col: number, row: number): Feature {
  const x0 = ORIGIN.lon + col * CELL;
  const y0 = ORIGIN.lat + row * CELL;
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x0, y0],
          [x0 + CELL, y0],
          [x0 + CELL, y0 + CELL],
          [x0, y0 + CELL],
          [x0, y0],
        ],
      ],
    },
    properties: {},
  };
}

export function zipCode(col: number, row: number): string {
  return `339${row}${col}`;
}

export function buildMiniZcta(): HaitianZctaApiResponse {
  const rows = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const zcta = zipCode(col, row);
      const i = row * 4 + col;
      const tiny = zcta === "33912";
      const census: ParsedZctaRow = {
        zcta,
        totalPop: tiny ? 120 : 5000 + i * 700,
        haitianPop: tiny ? 3 : 100 + i * 150,
        speakers: 50 + i * 40,
        limitedEnglish: 20 + i * 15,
        pctNoInternet: 5 + ((i * 7) % 25),
        pctNoHS: 8 + ((i * 11) % 30),
      };
      rows.push({ zcta, feature: square(col, row), census, regionName: COUNTIES[row] });
    }
  }
  return enrichHaitianZctaFeatures(rows);
}

function point(
  lonLat: [number, number] | null,
  properties: Record<string, unknown>
): Feature {
  return {
    type: "Feature",
    geometry: lonLat ? { type: "Point", coordinates: lonLat } : (null as unknown as Feature["geometry"]),
    properties,
  };
}

export function buildMiniLibraries(): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      point(cellCenter(0, 0), { name: "Little River Branch", zip: "33900", county: "Miami-Dade" }),
      // Reported ZIP is wrong; coordinates put it in 33911.
      point(cellCenter(1, 1), { name: "Wrong Zip Branch", zip: "33999", county: "Broward" }),
      // Broward-style: no ZIP at all.
      point(cellCenter(3, 1), { name: "No Zip Branch", zip: "", county: "Broward" }),
      // Just outside the grid but within the metro margin (e.g. on the coast).
      point([-80.205, 25.795], { name: "Edge Branch", zip: "33000", county: "Palm Beach" }),
      // Hundreds of km away: a stray bad record, dropped with a warning.
      point([-77.44, 37.54], { name: "Richmond Branch", zip: "", county: "Broward" }),
      // No geometry.
      point(null, { name: "Ghost Branch", county: "Miami-Dade" }),
    ],
  };
}

export function buildMiniSchools(): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      point(cellCenter(2, 0), {
        school_name: "Toussaint Elementary",
        primary_address_line_1: "1 Main St",
        zip: "33902",
        grades: "PK-5",
        enrollment: "640",
        county: "Miami-Dade",
      }),
      // Two schools with the same name at the same spot (co-located campuses).
      point(cellCenter(2, 2), { school_name: "Shared Campus", zip: "33922", county: "Palm Beach" }),
      point(cellCenter(2, 2), { school_name: "Shared Campus", zip: "33922", county: "Palm Beach" }),
    ],
  };
}
