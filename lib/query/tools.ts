import { z } from "zod";
import { tierLabel, type NeedTier } from "@/lib/haitianNeed";
import {
  ACCESS_CAP_MILES,
  countsAsLibraryAccess,
  SORT_KEYS,
  ZIP_METRICS,
  type DistanceMeasure,
  type NeedMode,
  type RegionSummary,
  type QueryEngine,
  type ZipQuery,
} from "@/lib/query/engine";
import { resolveRegion } from "@/lib/query/regions";
import type { PlaceKind, PlaceRecord } from "@/lib/snapshot/types";

// ---------- Result envelope ----------

/** What the map should show alongside an answer. */
export type MapView = {
  highlightZips: string[];
  needMode: NeedMode;
  regions: string[] | null;
  layers: { libraries: boolean; schools: boolean };
  focusPlaceIds?: string[];
};

export type ToolSuccess<T = unknown> = {
  ok: true;
  data: T;
  /** Record ids (zip:…, lib:…, sch:…) the answer may cite. */
  citations: string[];
  /** Source ids from the snapshot manifest backing those records. */
  sources: string[];
  /** Definitions and choices the answer must disclose. */
  assumptions: string[];
  map?: MapView;
};

export type ToolFailure = { ok: false; error: string; hint?: string };
export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure;

class ToolInputError extends Error {
  constructor(
    message: string,
    readonly hint?: string
  ) {
    super(message);
  }
}

// ---------- Shared schema pieces ----------

const metricEnum = z.enum(ZIP_METRICS);
const tierEnum = z.enum(["high", "medium", "low"]);
const kindEnum = z.enum(["library", "school"]);
const measureEnum = z
  .enum(["boundary", "center"])
  .describe(
    '"boundary" (default): distance from the nearest edge of the ZIP; a place inside the ZIP is 0 miles. "center": distance from a central point inside the ZIP.'
  );
const needModeEnum = z
  .enum(["education", "population"])
  .describe(
    '"education" (default): composite educational-need score. "population": Haitian-ancestry share of residents.'
  );
const zipCode = z.string().regex(/^\d{5}$/, "ZIP codes are 5 digits");
const regionsField = z
  .array(z.string())
  .min(1)
  .optional()
  .describe("County (Miami) or borough (NYC) names. Omit for the whole metro.");

export const METRIC_DESCRIPTIONS: Record<(typeof ZIP_METRICS)[number], string> = {
  educationNeedScore:
    "Composite educational-need score, 0–100: 40% Haitian-ancestry share rank, 30% households-without-internet rank, 30% adults-without-HS-diploma rank, ranked among reliable ZIPs in the metro.",
  haitianPopPct: "Percent of residents reporting Haitian ancestry.",
  haitianPop: "Residents reporting Haitian ancestry (count).",
  totalPop: "Total residents.",
  pctNoInternet: "Percent of households with no internet subscription.",
  pctNoHS: "Percent of adults 25+ without a high school diploma.",
  speakers:
    "People 5+ who speak French, Haitian Creole, or Cajun at home (ACS groups these; it is not Haitian-only).",
  limitedEnglish: 'Of those speakers, people who speak English less than "very well" (count).',
};

// ---------- Tool input schemas ----------

export const findZipsInput = z.object({
  regions: regionsField,
  zips: z.array(zipCode).min(1).optional().describe("Restrict to these ZIP codes."),
  need: z
    .object({ mode: needModeEnum.optional(), tiers: z.array(tierEnum).min(1) })
    .optional()
    .describe('Need-tier filter, e.g. {"tiers":["high"]}. Tiers are thirds of reliable ZIPs in the metro.'),
  metrics: z
    .array(
      z
        .object({ metric: metricEnum, min: z.number().optional(), max: z.number().optional() })
        .refine((m) => m.min !== undefined || m.max !== undefined, "Give min, max, or both")
    )
    .optional()
    .describe("Numeric range filters. Percent metrics are 0–100 (20 means 20%)."),
  access: z
    .array(
      z.object({
        kind: kindEnum,
        withinMiles: z.number().positive().max(ACCESS_CAP_MILES),
        has: z
          .boolean()
          .describe("true: at least `atLeast` such places within range. false: fewer than `atLeast` (none, by default)."),
        atLeast: z.number().int().positive().optional().describe("Default 1."),
        measure: measureEnum.optional(),
      })
    )
    .optional()
    .describe('Distance conditions, e.g. no library within 1 mile: {"kind":"library","withinMiles":1,"has":false}.'),
  includeUnreliable: z
    .boolean()
    .optional()
    .describe("Include ZIPs with too few residents for reliable estimates. Default false."),
  sortBy: z
    .object({ key: z.enum(SORT_KEYS), order: z.enum(["asc", "desc"]).optional() })
    .optional()
    .describe("Default: educationNeedScore desc (or haitianPopPct desc in population mode)."),
  limit: z.number().int().min(1).max(200).optional().describe("Rows to return (default 25). matchCount is always the full count."),
});

export const getZipInput = z.object({ zcta: zipCode });

export const findPlacesInput = z.object({
  kind: kindEnum,
  regions: regionsField,
  inZips: z.array(zipCode).min(1).optional().describe("Only places located inside these ZIPs."),
  nameContains: z.string().min(2).optional().describe("Case-insensitive name match."),
  nearZip: zipCode.optional().describe("Sort by distance from this ZIP and report distances."),
  withinMiles: z
    .number()
    .positive()
    .max(ACCESS_CAP_MILES)
    .optional()
    .describe("With nearZip: only places within this distance."),
  measure: measureEnum.optional(),
  limit: z.number().int().min(1).max(100).optional().describe("Default 10."),
});

export const summarizeRegionsInput = z.object({
  regions: regionsField.describe(
    "Regions to summarize. Omit for every region plus a metro total. Use this to compare regions."
  ),
  needMode: needModeEnum.optional(),
});

export const describeDataInput = z.object({});

// ---------- Helpers ----------

function resolveRegions(engine: QueryEngine, names: string[] | undefined): string[] | undefined {
  if (!names) return undefined;
  return names.map((name) => {
    const r = resolveRegion(engine.metro, name);
    if (!r.ok) throw new ToolInputError(r.error, r.hint);
    return r.region;
  });
}

function requireZip(engine: QueryEngine, zcta: string) {
  const zip = engine.getZip(zcta);
  if (!zip) {
    throw new ToolInputError(
      `ZIP ${zcta} is not on the ${engine.metroLabel} map.`,
      "It may be outside the mapped area, a PO-box-only ZIP, or have no residents. Check the ZIP or try the other metro."
    );
  }
  return zip;
}

function tierAssumption(engine: QueryEngine, mode: NeedMode): string {
  const b = engine.snapshot.manifest.tierBreaks[mode];
  if (mode === "education") {
    return `"High need" means the top third of reliable ZIPs in ${engine.metroLabel} by composite educational-need score (40% Haitian-ancestry share, 30% households without internet, 30% adults without a high school diploma): score ≥ ${b.mediumMax.toFixed(1)} is high, ${b.lowMax.toFixed(1)}–${b.mediumMax.toFixed(1)} medium, below ${b.lowMax.toFixed(1)} low.`;
  }
  return `"High need" (population mode) means the top third of reliable ZIPs in ${engine.metroLabel} by Haitian-ancestry share: ≥ ${b.mediumMax.toFixed(2)}% high, ${b.lowMax.toFixed(2)}–${b.mediumMax.toFixed(2)}% medium.`;
}

function measureAssumption(measure: DistanceMeasure, kind: PlaceKind): string {
  const noun = kind === "library" ? "Library" : "School";
  return measure === "boundary"
    ? `${noun} distances are straight-line miles from the nearest edge of each ZIP (a ${kind} inside the ZIP counts as 0 miles), not travel distance.`
    : `${noun} distances are straight-line miles from a central point inside each ZIP, not travel distance.`;
}

function placeScopeAssumption(engine: QueryEngine, kind: PlaceKind): string {
  if (kind === "library") {
    const excluded = engine.places("library").filter((p) => !countsAsLibraryAccess(p));
    const note = excluded.length
      ? ` ${excluded.map((p) => p.name).join(" and ")} ${excluded.length === 1 ? "is" : "are"} not counted as library access.`
      : "";
    return `Libraries are public library locations from county and city GIS data${engine.metro === "nyc" ? " (NYC Open Data)" : ""}; tutoring centers and school libraries are not included.${note}`;
  }
  return engine.metro === "miami"
    ? "Schools are public schools from county GIS data; private schools are not included and Miami data has no performance metrics."
    : "Schools are from the NYC 2018–19 School Report Card dataset (mostly high schools), with graduation and attendance rates.";
}

function sourcesFor(engine: QueryEngine, ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    if (id.startsWith("zip:")) {
      const z = engine.getZip(id.slice(4));
      z?.properties.sourceIds.forEach((s) => out.add(s));
    } else {
      const p = engine.getPlace(id);
      if (p) out.add(p.sourceId);
    }
  }
  return [...out].sort();
}

function placeSummary(p: PlaceRecord) {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    city: p.city,
    zip: p.zip,
    region: p.region,
    lat: p.lat,
    lon: p.lon,
    ...(Object.keys(p.attrs).length ? { attrs: p.attrs } : {}),
  };
}

function regionSources(engine: QueryEngine, regions: string[] | undefined): string[] {
  const out = new Set<string>(engine.zips[0]?.properties.sourceIds ?? []);
  for (const p of [...engine.places("library"), ...engine.places("school")]) {
    if (!regions || (p.region !== null && regions.includes(p.region))) out.add(p.sourceId);
  }
  return [...out].sort();
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Tool implementations ----------

function findZips(engine: QueryEngine, input: z.infer<typeof findZipsInput>): ToolSuccess {
  const regions = resolveRegions(engine, input.regions);
  const mode: NeedMode = input.need?.mode ?? "education";
  const query: ZipQuery = { ...input, regions };
  const { matches, excludedUnreliable } = engine.findZips(query);
  const limit = input.limit ?? 25;
  const rows = matches.slice(0, limit);

  const assumptions = [tierAssumption(engine, mode)];
  for (const kind of new Set((input.access ?? []).map((a) => a.kind))) {
    const measure = input.access!.find((a) => a.kind === kind)!.measure ?? "boundary";
    assumptions.push(measureAssumption(measure, kind));
    assumptions.push(placeScopeAssumption(engine, kind));
  }
  if (excludedUnreliable > 0 && !input.includeUnreliable) {
    assumptions.push(
      `${excludedUnreliable} ZIPs in scope were excluded because they have too few residents for reliable estimates.`
    );
  }
  assumptions.push("Figures are ACS 2022 5-year estimates, which carry margins of error.");

  const citations = rows.map((r) => r.id);
  const placeKinds = new Set((input.access ?? []).map((a) => a.kind));
  const placeSources = [...engine.places("library"), ...engine.places("school")]
    .filter((p) => placeKinds.has(p.kind) && (!regions || (p.region !== null && regions.includes(p.region))))
    .map((p) => p.sourceId);
  return {
    ok: true,
    data: {
      matchCount: matches.length,
      returned: rows.length,
      ...(matches.length > rows.length ? { note: `Showing ${rows.length} of ${matches.length}; raise limit to see more.` } : {}),
      zips: rows,
    },
    citations,
    sources: [...new Set([...sourcesFor(engine, citations), ...placeSources])].sort(),
    assumptions,
    map: {
      highlightZips: matches.map((m) => m.zcta),
      needMode: mode,
      regions: regions ?? null,
      layers: {
        libraries: (input.access ?? []).some((a) => a.kind === "library"),
        schools: (input.access ?? []).some((a) => a.kind === "school"),
      },
    },
  };
}

function getZip(engine: QueryEngine, input: z.infer<typeof getZipInput>): ToolSuccess {
  const zip = requireZip(engine, input.zcta);
  const p = zip.properties;
  const access = engine.accessFor(p.zcta);
  const nearby = (kind: PlaceKind) =>
    access[kind].slice(0, 3).map((a) => ({
      ...placeSummary(engine.getPlace(a.id)!),
      boundaryMiles: r2(a.boundaryMiles),
      centerMiles: r2(a.centerMiles),
    }));
  const inside = (kind: PlaceKind) => engine.places(kind).filter((pl) => pl.zip === p.zcta);
  const libs = nearby("library");
  const schools = nearby("school");
  const rank = engine.educationNeedRank(p.zcta);

  const assumptions = [tierAssumption(engine, "education"), measureAssumption("boundary", "library")];
  if (!p.reliable) {
    assumptions.unshift(
      `ZIP ${p.zcta} has too few residents (${p.totalPop} total, ${p.haitianPop} Haitian ancestry) for reliable estimates; treat its percentages with caution. It has no need tier.`
    );
  }
  if (libs.length === 0) assumptions.push(`No library is within ${ACCESS_CAP_MILES} miles of this ZIP.`);
  assumptions.push("Figures are ACS 2022 5-year estimates, which carry margins of error.");

  const citations = [p.id, ...libs.map((l) => l.id), ...schools.map((s) => s.id)];
  return {
    ok: true,
    data: {
      ...engine.toRow(p),
      educationNeedTierLabel: tierLabel(p.educationNeedTier),
      educationNeedRank: rank ? `${rank.rank} of ${rank.of} reliable ZIPs (1 = highest need)` : null,
      librariesWithin1Mile: engine.countWithin(p.zcta, "library", 1),
      schoolsWithin1Mile: engine.countWithin(p.zcta, "school", 1),
      librariesInside: inside("library").length,
      schoolsInside: inside("school").length,
      nearestLibraries: libs,
      nearestSchools: schools,
    },
    citations,
    sources: sourcesFor(engine, citations),
    assumptions,
    map: {
      highlightZips: [p.zcta],
      needMode: "education",
      regions: null,
      layers: { libraries: true, schools: true },
      focusPlaceIds: [...libs, ...schools].map((x) => x.id),
    },
  };
}

function findPlaces(engine: QueryEngine, input: z.infer<typeof findPlacesInput>): ToolSuccess {
  const regions = resolveRegions(engine, input.regions);
  if (input.nearZip) requireZip(engine, input.nearZip);
  for (const z of input.inZips ?? []) requireZip(engine, z);
  if (input.withinMiles !== undefined && !input.nearZip) {
    throw new ToolInputError("withinMiles needs nearZip.", "Add nearZip, or drop withinMiles.");
  }
  const measure = input.measure ?? "boundary";
  const field = measure === "boundary" ? "boundaryMiles" : "centerMiles";

  let places = engine.places(input.kind);
  if (regions) places = places.filter((p) => p.region !== null && regions.includes(p.region));
  if (input.inZips) places = places.filter((p) => p.zip !== null && input.inZips!.includes(p.zip));
  if (input.nameContains) {
    const needle = input.nameContains.toLowerCase();
    places = places.filter((p) => p.name.toLowerCase().includes(needle));
  }

  type Row = ReturnType<typeof placeSummary> & { distanceMiles?: number };
  let rows: Row[];
  if (input.nearZip) {
    const dist = new Map(engine.accessFor(input.nearZip)[input.kind].map((a) => [a.id, a[field]]));
    rows = places
      .filter((p) => dist.has(p.id))
      .map((p) => ({ ...placeSummary(p), distanceMiles: r2(dist.get(p.id)!) }))
      .filter((p) => input.withinMiles === undefined || p.distanceMiles! <= input.withinMiles)
      .sort((a, b) => a.distanceMiles! - b.distanceMiles! || a.id.localeCompare(b.id));
  } else {
    rows = places.map(placeSummary).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  const limit = input.limit ?? 10;
  const shown = rows.slice(0, limit);
  const assumptions = [placeScopeAssumption(engine, input.kind)];
  if (input.nearZip) assumptions.unshift(measureAssumption(measure, input.kind));
  if (input.nearZip && input.withinMiles === undefined) {
    assumptions.push(`Only places within ${ACCESS_CAP_MILES} miles are considered.`);
  }

  const citations = shown.map((r) => r.id);
  const highlight = input.nearZip ? [input.nearZip] : (input.inZips ?? []);
  return {
    ok: true,
    data: {
      matchCount: rows.length,
      returned: shown.length,
      ...(rows.length > shown.length ? { note: `Showing ${shown.length} of ${rows.length}; raise limit to see more.` } : {}),
      places: shown,
    },
    citations,
    sources: sourcesFor(engine, citations),
    assumptions,
    map: {
      highlightZips: highlight,
      needMode: "education",
      regions: regions ?? null,
      layers: { libraries: input.kind === "library", schools: input.kind === "school" },
      focusPlaceIds: citations,
    },
  };
}

/**
 * Regions ordered highest to lowest on each comparable figure, so the model reads the order
 * instead of comparing numbers itself (it has called 114,958 "larger" than 128,878).
 * Ties keep the same rank order as the input. The metro-wide row is left out.
 */
export function regionRankings(rows: RegionSummary[]): Record<string, string[]> | undefined {
  const parts = rows.filter((r) => !r.region.startsWith("All of"));
  if (parts.length < 2) return undefined;
  const by = (value: (r: RegionSummary) => number | null) =>
    [...parts]
      .filter((r) => value(r) !== null)
      .sort((a, b) => (value(b) as number) - (value(a) as number))
      .map((r) => `${r.region} (${(value(r) as number).toLocaleString("en-US")})`);
  return {
    residentsOfHaitianAncestry: by((r) => r.haitianPop),
    haitianAncestrySharePct: by((r) => r.haitianPopPct),
    totalResidents: by((r) => r.totalPop),
    highNeedZips: by((r) => r.tierCounts.high),
    medianPctHouseholdsWithoutInternet: by((r) => r.medianPctNoInternet),
    medianPctAdultsWithoutDiploma: by((r) => r.medianPctNoHS),
    libraries: by((r) => r.libraries),
    schools: by((r) => r.schools),
    highNeedZipsWithNoLibraryWithin1Mile: by((r) => r.highNeedZipsWithoutLibraryWithin1Mile.length),
  };
}

function summarizeRegions(engine: QueryEngine, input: z.infer<typeof summarizeRegionsInput>): ToolSuccess {
  const regions = resolveRegions(engine, input.regions);
  const mode = input.needMode ?? "education";
  const rows = regions
    ? regions.map((r) => engine.summarizeRegion(r, mode))
    : [...engine.regions.map((r) => engine.summarizeRegion(r, mode)), engine.summarizeRegion(null, mode)];

  const label = engine.snapshot.manifest.metro === "nyc" ? "borough" : "county";
  return {
    ok: true,
    data: { needMode: mode, regions: rows, rankings: regionRankings(rows) },
    citations: [],
    sources: regionSources(engine, regions),
    assumptions: [
      tierAssumption(engine, mode),
      `Totals add up the ZIPs assigned to each ${label}; a ZIP crossing a ${label} line counts fully toward the one holding most of its land, so totals differ slightly from official ${label} figures.`,
      "Median internet and diploma rates are medians across reliable ZIPs, not population-weighted averages.",
      "highNeedZipsWithoutLibraryWithin1Mile measures from each ZIP's nearest edge, in straight-line miles.",
      placeScopeAssumption(engine, "library"),
      "Figures are ACS 2022 5-year estimates, which carry margins of error.",
    ],
    map: {
      highlightZips: [],
      needMode: mode,
      regions: regions ?? null,
      layers: { libraries: false, schools: false },
    },
  };
}

function describeData(engine: QueryEngine): ToolSuccess {
  const m = engine.snapshot.manifest;
  return {
    ok: true,
    data: {
      metro: engine.metroLabel,
      regions: engine.regions,
      snapshotCreatedAt: m.createdAt,
      counts: m.counts,
      metrics: METRIC_DESCRIPTIONS,
      needTiers: {
        education: m.tierBreaks.education,
        population: m.tierBreaks.population,
        method: m.processing.tierMethod,
      },
      sources: m.sources,
      notInThisData: [
        "Tutoring programs, after-school programs, and community organizations",
        "Private or charter school lists beyond what county GIS layers include",
        engine.metro === "miami" ? "Any school performance data (graduation, test scores) for Miami" : "School performance after 2018–19",
        "Travel times or transit access (distances are straight-line)",
        "Data below ZIP level (census tracts, blocks) or for years other than ACS 2018–2022",
        "Individual-level or student-level records",
        "Crime, health, housing, jobs, transit, or other topics beyond Census education and language measures, libraries, and schools",
      ],
      warnings: m.warnings,
    },
    citations: [],
    sources: m.sources.map((s) => s.id),
    assumptions: [],
  };
}

// ---------- Registry ----------

export type ToolDefinition = {
  name: string;
  description: string;
  input: z.ZodType;
  run: (engine: QueryEngine, input: never) => ToolSuccess;
};

export const TOOLS = [
  {
    name: "find_zips",
    description:
      "Filter and rank ZIP codes in the current metro by need tier, Census metrics, region, and distance to libraries or schools. Use for any 'which ZIPs…' or 'top N ZIPs…' question. Returns matching ZIPs with their figures; matchCount is the full number of matches.",
    input: findZipsInput,
    run: findZips,
  },
  {
    name: "get_zip",
    description:
      "Full profile of one ZIP: Census figures, need tier and rank, nearest libraries and schools with distances, and counts within 1 mile. Use for questions about a specific ZIP.",
    input: getZipInput,
    run: getZip,
  },
  {
    name: "find_places",
    description:
      "List libraries or schools by region, by ZIP they are located in, by name, or by distance from a ZIP. Use for 'which libraries are near…' or 'how many schools are in…' questions.",
    input: findPlacesInput,
    run: findPlaces,
  },
  {
    name: "summarize_regions",
    description:
      "County- or borough-level totals: population, Haitian ancestry, speakers, need-tier counts, median internet and diploma rates, library and school counts, and high-need ZIPs with no library within a mile. Use to compare regions or give an overview. `rankings` lists the regions from highest to lowest on each figure.",
    input: summarizeRegionsInput,
    run: summarizeRegions,
  },
  {
    name: "describe_data",
    description:
      "What the data covers: metric definitions, need-tier cut-offs and method, sources, what is NOT in the data, and data-quality warnings. Use for definition questions and before saying something is out of scope.",
    input: describeDataInput,
    run: (engine: QueryEngine) => describeData(engine),
  },
] as const satisfies readonly ToolDefinition[];

export type ToolName = (typeof TOOLS)[number]["name"];

/** Validates input and runs a tool. Never throws: errors come back as ToolFailure for the model to read. */
export function runTool(engine: QueryEngine, name: string, rawInput: unknown): ToolResult {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return { ok: false, error: `Unknown tool "${name}".`, hint: `Available: ${TOOLS.map((t) => t.name).join(", ")}.` };
  }
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input for ${name}: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
      hint: "Fix the listed fields and call the tool again.",
    };
  }
  try {
    return (tool.run as (e: QueryEngine, i: unknown) => ToolSuccess)(engine, parsed.data);
  } catch (error) {
    if (error instanceof ToolInputError) return { ok: false, error: error.message, hint: error.hint };
    throw error;
  }
}

function withoutSchemaKey(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = schema;
  void _ignored;
  return rest;
}

/** JSON Schemas for each tool's input, for LLM tool definitions. */
export function toolJsonSchemas(): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: withoutSchemaKey(z.toJSONSchema(t.input, { target: "draft-7" }) as Record<string, unknown>),
  }));
}

export type { NeedTier };
