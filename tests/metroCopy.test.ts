import { describe, expect, it } from "vitest";
import { METROS } from "@/lib/metroRegistry";
import { loadSnapshot, snapshotExists } from "@/lib/snapshot/load";

/** The landing page's headline figure must agree with the data the map shows. */
describe("landing-page headline figures", () => {
  for (const metro of METROS) {
    it.skipIf(!snapshotExists(metro.id))(`${metro.label}: Haitian-ancestry headline matches the snapshot`, () => {
      const total = loadSnapshot(metro.id).zips.features.reduce((s, f) => s + f.properties.haitianPop, 0);
      const match = metro.haitianAncestryHint?.match(/~(\d+)k/);
      expect(match, "hint should read like '~336k …'").not.toBeNull();
      const claimed = Number(match![1]) * 1000;
      expect(Math.abs(claimed - total) / total).toBeLessThan(0.02);
    });
  }
});
