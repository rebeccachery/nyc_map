import { booleanPointInPolygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "@/lib/snapshot/build";
import { placeSourceId } from "@/lib/snapshot/sources";
import {
  buildMiniLibraries,
  buildMiniSchools,
  buildMiniZcta,
  cellCenter,
} from "../fixtures/miniMetro";

const CREATED_AT = "2026-11-13T00:00:00.000Z";

function build() {
  return buildSnapshot({
    metro: "miami",
    zcta: buildMiniZcta(),
    libraries: buildMiniLibraries(),
    schools: buildMiniSchools(),
    createdAt: CREATED_AT,
  });
}

describe("buildSnapshot: ZIPs", () => {
  it("keeps every ZIP with stable ids, sorted", () => {
    const { zips } = build();
    expect(zips.features).toHaveLength(12);
    const codes = zips.features.map((f) => f.properties.zcta);
    expect(codes).toEqual([...codes].sort());
    expect(zips.features[0].properties.id).toBe("zip:33900");
  });

  it("carries the same tiers the live map computes", () => {
    const zcta = buildMiniZcta();
    const { zips } = build();
    for (const live of zcta.features.features) {
      const frozen = zips.features.find((f) => f.properties.zcta === live.properties?.zcta)!;
      expect(frozen.properties.educationNeedTier).toBe(live.properties?.educationNeedTier);
      expect(frozen.properties.populationNeedTier).toBe(live.properties?.populationNeedTier);
      expect(frozen.properties.educationNeedScore).toBeCloseTo(live.properties?.educationNeedScore);
    }
    const tiers = new Set(zips.features.map((f) => f.properties.educationNeedTier));
    expect(tiers).toContain("high");
    expect(tiers).toContain("low");
  });

  it("flags small-population ZIPs as unreliable", () => {
    const tiny = build().zips.features.find((f) => f.properties.zcta === "33912")!;
    expect(tiny.properties.reliable).toBe(false);
    expect(tiny.properties.educationNeedTier).toBe("insufficient_data");
  });

  it("puts each anchor point inside its own ZIP and cites census + boundary sources", () => {
    for (const f of build().zips.features) {
      expect(booleanPointInPolygon(f.properties.anchor, f)).toBe(true);
      expect(f.properties.sourceIds).toEqual(["census-acs5-2022", "tiger-zcta"]);
      expect(f.properties.region).toMatch(/Miami-Dade|Broward|Palm Beach/);
    }
  });
});

describe("buildSnapshot: places", () => {
  it("assigns ZIP from coordinates, not the reported ZIP", () => {
    const { libraries } = build();
    const wrong = libraries.find((l) => l.name === "Wrong Zip Branch")!;
    expect(wrong.reportedZip).toBe("33999");
    expect(wrong.zip).toBe("33911");

    const noZip = libraries.find((l) => l.name === "No Zip Branch")!;
    expect(noZip.reportedZip).toBeNull();
    expect(noZip.zip).toBe("33913");
  });

  it("takes region from the containing ZIP", () => {
    const wrong = build().libraries.find((l) => l.name === "Wrong Zip Branch")!;
    expect(wrong.region).toBe("Broward");
    const first = build().libraries.find((l) => l.name === "Little River Branch")!;
    expect(first.region).toBe("Miami-Dade");
  });

  it("keeps edge points outside every ZIP with zip = null, drops points without geometry", () => {
    const { libraries } = build();
    expect(libraries.find((l) => l.name === "Edge Branch")!.zip).toBeNull();
    expect(libraries.find((l) => l.name === "Ghost Branch")).toBeUndefined();
    expect(libraries).toHaveLength(4);
  });

  it("drops a stray point far outside the metro", () => {
    expect(build().libraries.find((l) => l.name === "Richmond Branch")).toBeUndefined();
  });

  it("refuses a source whose points are mostly outside the metro (wrong dataset)", () => {
    const libraries = buildMiniLibraries();
    libraries.features.push(
      ...[0, 1, 2].map((i) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [-77.4 - i * 0.01, 37.5] },
        properties: { name: `Virginia Branch ${i}`, county: "Broward" },
      }))
    );
    expect(() =>
      buildSnapshot({
        metro: "miami",
        zcta: buildMiniZcta(),
        libraries,
        schools: buildMiniSchools(),
        createdAt: CREATED_AT,
      })
    ).toThrow(/broward-libraries.*4 of 6 library points lie outside the miami area.*wrong dataset/);
  });

  it("cites the per-county source", () => {
    const { libraries, schools } = build();
    expect(libraries.find((l) => l.name === "Little River Branch")!.sourceId).toBe("mdc-libraries");
    expect(libraries.find((l) => l.name === "No Zip Branch")!.sourceId).toBe("broward-libraries");
    expect(schools.find((s) => s.name === "Toussaint Elementary")!.sourceId).toBe("mdc-schools");
  });

  it("parses school attributes and keeps numeric fields numeric", () => {
    const school = build().schools.find((s) => s.name === "Toussaint Elementary")!;
    expect(school.attrs).toMatchObject({ grades: "PK-5", enrollment: 640 });
    expect(school.address).toBe("1 Main St");
    expect(school.lon).toBeCloseTo(cellCenter(2, 0)[0], 5);
  });

  it("gives co-located duplicates distinct ids, and ids are stable across runs", () => {
    const a = build();
    const b = build();
    const shared = a.schools.filter((s) => s.name === "Shared Campus").map((s) => s.id);
    expect(new Set(shared).size).toBe(2);
    expect(a.schools.map((s) => s.id)).toEqual(b.schools.map((s) => s.id));
    expect(a.libraries.map((s) => s.id)).toEqual(b.libraries.map((s) => s.id));
    expect(a.libraries[0].id).toMatch(/^lib:miami:[0-9a-f]{8}$/);
  });
});

describe("buildSnapshot: manifest", () => {
  it("counts records and records the methodology", () => {
    const { manifest } = build();
    expect(manifest).toMatchObject({
      metro: "miami",
      createdAt: CREATED_AT,
      counts: { zips: 12, reliableZips: 11, libraries: 4, schools: 3 },
    });
    expect(manifest.processing.needMethod).toMatch(/40%/);
    expect(manifest.sources.map((s) => s.id)).toContain("census-acs5-2022");
  });

  it("writes data-quality warnings", () => {
    const text = build().manifest.warnings.join("\n");
    expect(text).toMatch(/1 of 12 ZIPs/);
    expect(text).toMatch(/1 libraries dropped/);
    expect(text).toMatch(/1 libraries fall outside/);
    expect(text).toMatch(/1 libraries dropped for lying outside the metro/);
    expect(text).toMatch(/1 libraries have no ZIP/);
    expect(text).toMatch(/no performance metrics/);
  });
});

describe("placeSourceId", () => {
  it("rejects an unknown Miami county instead of guessing", () => {
    expect(() => placeSourceId("miami", "library", { county: "Monroe" })).toThrow(/Unknown Miami county/);
  });
  it("uses a single source for NYC", () => {
    expect(placeSourceId("nyc", "school", {})).toBe("nyc-schools");
  });
});
