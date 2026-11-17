import { describe, expect, it } from "vitest";
import { QueryEngine } from "@/lib/query/engine";
import { resolveRegion } from "@/lib/query/regions";
import { runTool, toolJsonSchemas, TOOLS, type ToolSuccess } from "@/lib/query/tools";
import { buildSnapshot } from "@/lib/snapshot/build";
import { buildMiniLibraries, buildMiniSchools, buildMiniZcta } from "../fixtures/miniMetro";

const engine = new QueryEngine(
  buildSnapshot({
    metro: "miami",
    zcta: buildMiniZcta(),
    libraries: buildMiniLibraries(),
    schools: buildMiniSchools(),
    createdAt: "2026-11-13T00:00:00.000Z",
  })
);

function ok(name: string, input: unknown) {
  const r = runTool(engine, name, input);
  if (!r.ok) throw new Error(`${name} failed: ${r.error}`);
  return r as ToolSuccess<Record<string, unknown>>;
}

describe("region names", () => {
  it("accepts common spellings", () => {
    for (const t of ["Miami-Dade", "miami dade", "Dade County", "MIAMI-DADE COUNTY"]) {
      expect(resolveRegion("miami", t)).toEqual({ ok: true, region: "Miami-Dade" });
    }
    expect(resolveRegion("nyc", "Kings County")).toEqual({ ok: true, region: "Brooklyn" });
    expect(resolveRegion("nyc", "the Bronx")).toEqual({ ok: true, region: "Bronx" });
  });

  it("flags 'Miami' as ambiguous instead of guessing", () => {
    const r = resolveRegion("miami", "Miami");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.hint).toMatch(/Omit "regions".*Miami-Dade/);
  });
});

describe("runTool", () => {
  it("returns readable validation errors instead of throwing", () => {
    const r = runTool(engine, "find_zips", { metrics: [{ metric: "pctNoHS" }], limit: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/metrics\.0: Give min, max, or both/);
      expect(r.error).toMatch(/limit/);
    }
    expect(runTool(engine, "find_zips", { metrics: [{ metric: "graduationRate", min: 1 }] }).ok).toBe(false);
    expect(runTool(engine, "drop_tables", {})).toMatchObject({ ok: false, error: 'Unknown tool "drop_tables".' });
  });

  it("explains a ZIP that is not on the map", () => {
    const r = runTool(engine, "get_zip", { zcta: "10001" });
    expect(r).toMatchObject({ ok: false, error: "ZIP 10001 is not on the Miami Metro map." });
  });

  it("rejects withinMiles without nearZip", () => {
    const r = runTool(engine, "find_places", { kind: "library", withinMiles: 1 });
    expect(r).toMatchObject({ ok: false, error: "withinMiles needs nearZip." });
  });
});

describe("find_zips envelope", () => {
  const r = ok("find_zips", {
    need: { tiers: ["high", "medium"] },
    access: [{ kind: "library", withinMiles: 0.1, has: false }],
    limit: 2,
  });
  const data = r.data as { matchCount: number; returned: number; zips: { id: string; zcta: string }[] };

  it("cites exactly the returned rows, plus the datasets the distance filter used", () => {
    expect(r.citations).toEqual(data.zips.map((z) => z.id));
    expect(r.sources).toEqual(["broward-libraries", "census-acs5-2022", "mdc-libraries", "pbc-libraries", "tiger-zcta"]);
  });

  it("highlights every match on the map, not just the returned page", () => {
    expect(data.returned).toBe(2);
    expect(r.map!.highlightZips).toHaveLength(data.matchCount);
    expect(r.map!.layers.libraries).toBe(true);
  });

  it("states the need definition, distance measure and library scope", () => {
    const text = r.assumptions.join("\n");
    expect(text).toMatch(/top third of reliable ZIPs/);
    expect(text).toMatch(/score ≥ \d+\.\d is high/);
    expect(text).toMatch(/nearest edge of each ZIP/);
    expect(text).toMatch(/tutoring centers and school libraries are not included/);
    expect(text).toMatch(/1 ZIPs in scope were excluded/);
  });
});

describe("get_zip", () => {
  it("returns profile, rank, nearest places and cites them", () => {
    const r = ok("get_zip", { zcta: "33900" });
    const d = r.data as Record<string, unknown> & { nearestLibraries: { id: string; boundaryMiles: number }[] };
    expect(d.zcta).toBe("33900");
    expect(d.librariesInside).toBe(1);
    expect(d.nearestLibraries[0].boundaryMiles).toBe(0);
    expect(r.citations[0]).toBe("zip:33900");
    expect(r.citations).toContain(d.nearestLibraries[0].id);
    expect(r.sources).toContain("mdc-libraries");
  });

  it("warns when a ZIP is unreliable", () => {
    const r = ok("get_zip", { zcta: "33912" });
    expect(r.assumptions[0]).toMatch(/too few residents/);
  });
});

describe("find_places", () => {
  it("sorts by distance from a ZIP and respects withinMiles", () => {
    const r = ok("find_places", { kind: "library", nearZip: "33901", withinMiles: 0.5 });
    const places = (r.data as { places: { name: string; distanceMiles: number }[] }).places;
    expect(places.map((p) => p.name)).toEqual(["Little River Branch", "Wrong Zip Branch"]);
    expect(places[0].distanceMiles).toBeLessThan(places[1].distanceMiles);
  });

  it("filters by region and name", () => {
    const r = ok("find_places", { kind: "library", regions: ["broward"], nameContains: "zip" });
    const names = (r.data as { places: { name: string }[] }).places.map((p) => p.name);
    expect(names).toEqual(["No Zip Branch", "Wrong Zip Branch"]);
  });
});

describe("summarize_regions", () => {
  it("returns every region plus a metro total by default", () => {
    const r = ok("summarize_regions", {});
    const regions = (r.data as { regions: { region: string }[] }).regions.map((x) => x.region);
    expect(regions).toEqual(["Miami-Dade", "Broward", "Palm Beach", "All of Miami Metro"]);
  });

  it("cites only sources relevant to the chosen regions", () => {
    const r = ok("summarize_regions", { regions: ["Miami-Dade"] });
    expect(r.sources).toEqual(["census-acs5-2022", "mdc-libraries", "mdc-schools", "tiger-zcta"]);
  });
});

describe("describe_data", () => {
  it("lists what is not in the data", () => {
    const d = ok("describe_data", {}).data as { notInThisData: string[]; metrics: Record<string, string> };
    expect(d.notInThisData.join(" ")).toMatch(/Tutoring programs/);
    expect(d.notInThisData.join(" ")).toMatch(/school performance data .* for Miami/);
    expect(d.metrics.speakers).toMatch(/not Haitian-only/);
  });
});

describe("toolJsonSchemas", () => {
  it("produces an object schema for every tool", () => {
    const schemas = toolJsonSchemas();
    expect(schemas.map((s) => s.name)).toEqual(TOOLS.map((t) => t.name));
    for (const s of schemas) expect(s.input_schema.type).toBe("object");
    const findZips = schemas.find((s) => s.name === "find_zips")!;
    expect(Object.keys(findZips.input_schema.properties as object)).toContain("access");
  });
});

describe("regionRankings", () => {
  it("orders regions highest first on each figure and leaves out the metro-wide row", async () => {
    const { regionRankings } = await import("@/lib/query/tools");
    const { getEngine } = await import("@/lib/query/engine");
    const { loadSnapshot } = await import("@/lib/snapshot/load");
    const engine = getEngine(loadSnapshot("miami"));
    const rows = [...engine.regions.map((r) => engine.summarizeRegion(r)), engine.summarizeRegion(null)];
    const rankings = regionRankings(rows)!;
    // Broward has more residents of Haitian ancestry than Miami-Dade; the model has got this backwards.
    expect(rankings.residentsOfHaitianAncestry.map((s) => s.split(" (")[0])).toEqual(["Broward", "Miami-Dade", "Palm Beach"]);
    expect(rankings.haitianAncestrySharePct[0]).toMatch(/^Broward \(6\.64\)/);
    expect(rankings.highNeedZips[0]).toMatch(/^Miami-Dade \(23\)/);
    expect(Object.values(rankings).every((list) => list.length === 3)).toBe(true);
    expect(regionRankings([rows[0]])).toBeUndefined();
  });
});
