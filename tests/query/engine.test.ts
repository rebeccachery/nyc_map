import { describe, expect, it } from "vitest";
import { haversineMiles, pointToPolygonMiles } from "@/lib/query/geometry";
import { QueryEngine } from "@/lib/query/engine";
import { buildSnapshot } from "@/lib/snapshot/build";
import type { Snapshot } from "@/lib/snapshot/types";
import { buildMiniLibraries, buildMiniSchools, buildMiniZcta, cellCenter, CELL, ORIGIN } from "../fixtures/miniMetro";

function miniSnapshot(): Snapshot {
  return buildSnapshot({
    metro: "miami",
    zcta: buildMiniZcta(),
    libraries: buildMiniLibraries(),
    schools: buildMiniSchools(),
    createdAt: "2026-11-13T00:00:00.000Z",
  });
}

/** Width of one fixture cell in miles at the fixture's latitude. */
const CELL_MILES_EW = haversineMiles([ORIGIN.lon, 25.805], [ORIGIN.lon + CELL, 25.805]);

describe("geometry", () => {
  const square = {
    type: "Polygon" as const,
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]].map(([x, y]) => [-80.2 + x * CELL, 25.8 + y * CELL])],
  };

  it("is 0 inside a polygon", () => {
    expect(pointToPolygonMiles([-80.2 + CELL / 2, 25.8 + CELL / 2], square)).toBe(0);
  });

  it("matches great-circle distance to the nearest edge within 0.5%", () => {
    const pt: [number, number] = [-80.2 + 2 * CELL, 25.8 + CELL / 2];
    const expected = haversineMiles(pt, [-80.2 + CELL, 25.8 + CELL / 2]);
    expect(pointToPolygonMiles(pt, square)).toBeCloseTo(expected, 2);
    expect(Math.abs(pointToPolygonMiles(pt, square) - expected) / expected).toBeLessThan(0.005);
  });

  it("measures to a corner when that is closest", () => {
    const pt: [number, number] = [-80.2 - CELL, 25.8 - CELL];
    expect(pointToPolygonMiles(pt, square)).toBeCloseTo(haversineMiles(pt, [-80.2, 25.8]), 2);
  });
});

describe("QueryEngine distances", () => {
  const engine = new QueryEngine(miniSnapshot());

  it("puts a library inside its own ZIP at 0 miles and half a cell from the neighbour", () => {
    const lib = engine.places("library").find((p) => p.name === "Little River Branch")!;
    const own = engine.accessFor("33900").library.find((a) => a.id === lib.id)!;
    const east = engine.accessFor("33901").library.find((a) => a.id === lib.id)!;
    expect(own.boundaryMiles).toBe(0);
    expect(east.boundaryMiles).toBeCloseTo(CELL_MILES_EW / 2, 2);
    expect(own.centerMiles).toBeLessThan(0.05); // anchor is the cell centre, where the library sits
  });

  it("counts places within a radius by boundary or centre", () => {
    // 33902 contains Toussaint Elementary at its centre; 33903 is one cell east.
    expect(engine.countWithin("33903", "school", CELL_MILES_EW / 2 + 0.01, "boundary")).toBe(1);
    expect(engine.countWithin("33903", "school", CELL_MILES_EW / 2 + 0.01, "center")).toBe(0);
  });

  it("ranks reliable ZIPs by need, skipping unreliable ones", () => {
    expect(engine.educationNeedRank("33912")).toBeNull();
    const ranks = engine.zips
      .filter((z) => z.properties.reliable)
      .map((z) => engine.educationNeedRank(z.properties.zcta)!.rank)
      .sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
  });
});

describe("QueryEngine.findZips", () => {
  const engine = new QueryEngine(miniSnapshot());

  it("filters by need tier and excludes unreliable ZIPs by default", () => {
    const { matches, excludedUnreliable } = engine.findZips({ need: { tiers: ["high"] } });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.educationNeedTier === "high")).toBe(true);
    expect(excludedUnreliable).toBe(1);
    expect(engine.findZips({ includeUnreliable: true }).matches).toHaveLength(12);
  });

  it("sorts by need score descending by default, ties broken by ZIP", () => {
    const scores = engine.findZips({}).matches.map((m) => m.educationNeedScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("finds ZIPs with no library within a distance", () => {
    const { matches } = engine.findZips({
      access: [{ kind: "library", withinMiles: 0.1, has: false }],
      includeUnreliable: true,
    });
    const withLibraryInside = ["33900", "33911", "33913"];
    expect(matches.map((m) => m.zcta).filter((z) => withLibraryInside.includes(z))).toEqual([]);
    expect(matches).toHaveLength(9);
    expect(matches.every((m) => m.accessCounts![0] === 0)).toBe(true);
  });

  it("supports 'fewer than N' and 'at least N'", () => {
    const near = engine.findZips({
      zips: ["33922"],
      access: [{ kind: "school", withinMiles: 0.1, has: true, atLeast: 2 }],
    });
    expect(near.matches.map((m) => m.zcta)).toEqual(["33922"]); // two co-located schools
    const fewer = engine.findZips({
      zips: ["33922"],
      access: [{ kind: "school", withinMiles: 0.1, has: false, atLeast: 2 }],
    });
    expect(fewer.matches).toHaveLength(0);
  });

  it("filters by region and metric range", () => {
    const { matches } = engine.findZips({ regions: ["Broward"], metrics: [{ metric: "pctNoHS", min: 20 }] });
    expect(matches.every((m) => m.region === "Broward" && m.pctNoHS >= 20)).toBe(true);
  });

  it("sorts ZIPs with nothing within the cap as farthest", () => {
    const { matches } = engine.findZips({ sortBy: { key: "nearestLibraryMiles", order: "desc" }, includeUnreliable: true });
    const values = matches.map((m) => m.nearestLibraryMiles ?? Infinity);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

describe("library access exclusions", () => {
  it("does not count kiosks or law libraries as library access", () => {
    const snap = miniSnapshot();
    const lib = snap.libraries.find((l) => l.name === "Little River Branch")!;
    lib.name = "Hospital Library Kiosk";
    const engine = new QueryEngine(snap);
    expect(engine.accessFor("33900").library.some((a) => a.id === lib.id)).toBe(false);
    expect(engine.places("library").some((p) => p.id === lib.id)).toBe(true);
  });
});

describe("summarizeRegion", () => {
  const engine = new QueryEngine(miniSnapshot());

  it("adds counts exactly and splits tiers", () => {
    const all = engine.summarizeRegion(null);
    const parts = engine.regions.map((r) => engine.summarizeRegion(r));
    expect(parts.reduce((s, p) => s + p.haitianPop, 0)).toBe(all.haitianPop);
    expect(parts.reduce((s, p) => s + p.zipCount, 0)).toBe(12);
    expect(Object.values(all.tierCounts).reduce((a, b) => a + b, 0)).toBe(12);
    expect(all.tierCounts.insufficient_data).toBe(1);
    expect(all.haitianPopPct).toBeCloseTo((all.haitianPop / all.totalPop) * 100, 2);
  });

  it("counts places by region", () => {
    const md = engine.summarizeRegion("Miami-Dade");
    expect(md.libraries).toBe(1);
    expect(md.schools).toBe(1);
  });
});

describe("cell centre helper sanity", () => {
  it("cellCenter is inside the expected ZIP", () => {
    const engine = new QueryEngine(miniSnapshot());
    const zip = engine.getZip("33912")!;
    expect(pointToPolygonMiles(cellCenter(2, 1), zip.geometry)).toBe(0);
  });
});
