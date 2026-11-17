/** Engine checks against the committed real snapshots. Skipped until `npm run snapshot` has run. */
import { describe, expect, it } from "vitest";
import { getEngine } from "@/lib/query/engine";
import { runTool, type ToolSuccess } from "@/lib/query/tools";
import { loadSnapshot, snapshotExists } from "@/lib/snapshot/load";

describe.skipIf(!snapshotExists("miami"))("query engine on real Miami data", () => {
  const engine = () => getEngine(loadSnapshot("miami"));

  it("answers the flagship question with high-need ZIPs that truly lack a library within a mile", () => {
    const r = runTool(engine(), "find_zips", {
      need: { tiers: ["high"] },
      access: [{ kind: "library", withinMiles: 1, has: false }],
      limit: 200,
    }) as ToolSuccess<{ matchCount: number; zips: { zcta: string; educationNeedTier: string; nearestLibraryMiles: number | null }[] }>;
    expect(r.ok).toBe(true);
    expect(r.data.matchCount).toBeGreaterThan(0);
    for (const z of r.data.zips) {
      expect(z.educationNeedTier).toBe("high");
      expect(z.nearestLibraryMiles === null || z.nearestLibraryMiles > 1).toBe(true);
    }
  });

  it("finds a library within a mile of Little Haiti (33127)", () => {
    expect(engine().countWithin("33127", "library", 1)).toBeGreaterThan(0);
  });

  it("every citation resolves to a real record", () => {
    const e = engine();
    const r = runTool(e, "get_zip", { zcta: "33127" }) as ToolSuccess;
    for (const id of r.citations) {
      expect(id.startsWith("zip:") ? e.getZip(id.slice(4)) : e.getPlace(id), id).toBeDefined();
    }
  });
});
