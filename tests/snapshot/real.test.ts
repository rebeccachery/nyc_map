/**
 * Checks the committed real-data snapshots. Skipped until `npm run snapshot` has been run.
 */
import { describe, expect, it } from "vitest";
import { loadSnapshot, snapshotExists } from "@/lib/snapshot/load";

describe.skipIf(!snapshotExists("miami"))("real snapshot: miami", () => {
  const snap = () => loadSnapshot("miami");

  it("covers the three counties' ZIPs", () => {
    const { zips, manifest } = snap();
    expect(manifest.counts.zips).toBeGreaterThan(150);
    expect(manifest.counts.zips).toBeLessThanOrEqual(230);
    const regions = new Set(zips.features.map((f) => f.properties.region));
    expect(regions).toEqual(new Set(["Miami-Dade", "Broward", "Palm Beach"]));
  });

  it("includes Little Haiti (33127) as a reliable ZIP with Haitian ancestry", () => {
    const lh = snap().zips.features.find((f) => f.properties.zcta === "33127");
    expect(lh).toBeDefined();
    expect(lh!.properties.reliable).toBe(true);
    expect(lh!.properties.haitianPop).toBeGreaterThan(1000);
  });

  it("has libraries and schools from all three counties, mostly inside mapped ZIPs", () => {
    const { libraries, schools } = snap();
    for (const places of [libraries, schools]) {
      const sources = new Set(places.map((p) => p.sourceId.split("-")[0]));
      expect(sources).toEqual(new Set(["mdc", "broward", "pbc"]));
      const inside = places.filter((p) => p.zip !== null).length;
      expect(inside / places.length).toBeGreaterThan(0.9);
      // Every source must be mostly inside mapped ZIPs, so a wrong dataset can't hide behind good ones.
      for (const source of new Set(places.map((p) => p.sourceId))) {
        const own = places.filter((p) => p.sourceId === source);
        const ownInside = own.filter((p) => p.zip !== null).length;
        expect(ownInside / own.length, source).toBeGreaterThan(0.8);
      }
    }
    expect(libraries.length).toBeGreaterThan(80);
    // Broward County Library has ~38 locations; the old feed returned 9 Virginia branches.
    expect(libraries.filter((l) => l.sourceId === "broward-libraries").length).toBeGreaterThan(25);
    expect(schools.length).toBeGreaterThan(300);
  });

  it("has roughly one-third of reliable ZIPs in each education tier", () => {
    const reliable = snap().zips.features.filter((f) => f.properties.reliable);
    const high = reliable.filter((f) => f.properties.educationNeedTier === "high").length;
    expect(high / reliable.length).toBeGreaterThan(0.25);
    expect(high / reliable.length).toBeLessThan(0.4);
  });
});

describe.skipIf(!snapshotExists("nyc"))("real snapshot: nyc", () => {
  const snap = () => loadSnapshot("nyc");

  it("covers ~180 MODZCTAs across five boroughs", () => {
    const { zips } = snap();
    expect(zips.features.length).toBeGreaterThan(150);
    const regions = new Set(zips.features.map((f) => f.properties.region));
    for (const b of ["Brooklyn", "Queens", "Manhattan", "Bronx", "Staten Island"]) {
      expect(regions).toContain(b);
    }
  });

  it("has libraries and schools with performance metrics", () => {
    const { libraries, schools } = snap();
    expect(libraries.length).toBeGreaterThan(150);
    expect(schools.some((s) => typeof s.attrs.graduation_rate === "number")).toBe(true);
  });
});
