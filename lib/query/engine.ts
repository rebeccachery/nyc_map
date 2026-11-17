import type { NeedTier } from "@/lib/haitianNeed";
import { getMetroConfig, type MetroId } from "@/lib/metroRegistry";
import {
  geometryBBox,
  localMiles,
  pointToBBoxMiles,
  pointToPolygonMiles,
  type BBox,
} from "@/lib/query/geometry";
import { listRegions } from "@/lib/query/regions";
import type { PlaceKind, PlaceRecord, Snapshot, ZipFeature, ZipProperties } from "@/lib/snapshot/types";

/** Distances beyond this are not tracked; the nearest place is then reported as "more than 10 miles". */
export const ACCESS_CAP_MILES = 10;

/**
 * Library records that are not places a family could use for study or tutoring.
 * They stay listed in find_places but do not count toward library access.
 */
const NON_ACCESS_LIBRARY = /\bkiosk\b|\blaw library\b/i;

export function countsAsLibraryAccess(place: PlaceRecord): boolean {
  return place.kind !== "library" || !NON_ACCESS_LIBRARY.test(place.name);
}

export type NeedMode = "education" | "population";
export type DistanceMeasure = "boundary" | "center";

export const ZIP_METRICS = [
  "educationNeedScore",
  "haitianPopPct",
  "haitianPop",
  "totalPop",
  "pctNoInternet",
  "pctNoHS",
  "speakers",
  "limitedEnglish",
] as const;
export type ZipMetric = (typeof ZIP_METRICS)[number];

export const SORT_KEYS = [...ZIP_METRICS, "nearestLibraryMiles", "nearestSchoolMiles"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type PlaceAccess = { id: string; boundaryMiles: number; centerMiles: number };

export type ZipAccess = Record<PlaceKind, PlaceAccess[]>;

export type AccessCondition = {
  kind: PlaceKind;
  withinMiles: number;
  /** true: at least `atLeast` such places; false: fewer than `atLeast`. */
  has: boolean;
  atLeast?: number;
  measure?: DistanceMeasure;
};

export type ZipQuery = {
  regions?: string[];
  zips?: string[];
  need?: { mode?: NeedMode; tiers: Exclude<NeedTier, "insufficient_data">[] };
  metrics?: { metric: ZipMetric; min?: number; max?: number }[];
  access?: AccessCondition[];
  includeUnreliable?: boolean;
  sortBy?: { key: SortKey; order?: "asc" | "desc" };
  limit?: number;
};

export type ZipRow = {
  id: string;
  zcta: string;
  region: string | null;
  label: string | null;
  reliable: boolean;
  educationNeedTier: NeedTier;
  populationNeedTier: NeedTier;
  educationNeedScore: number;
  haitianPop: number;
  haitianPopPct: number;
  totalPop: number;
  pctNoInternet: number;
  pctNoHS: number;
  speakers: number;
  limitedEnglish: number;
  /** Boundary distance to the nearest library; null when more than ACCESS_CAP_MILES. */
  nearestLibraryMiles: number | null;
  nearestSchoolMiles: number | null;
  /** Counts for each access condition in the query, in order. */
  accessCounts?: number[];
};

export type RegionSummary = {
  region: string;
  zipCount: number;
  reliableZipCount: number;
  totalPop: number;
  haitianPop: number;
  haitianPopPct: number;
  speakers: number;
  limitedEnglish: number;
  tierCounts: Record<NeedTier, number>;
  medianPctNoInternet: number | null;
  medianPctNoHS: number | null;
  libraries: number;
  schools: number;
  highNeedZipsWithoutLibraryWithin1Mile: string[];
};

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export class QueryEngine {
  readonly metro: MetroId;
  readonly snapshot: Snapshot;
  readonly zips: ZipFeature[];
  readonly regions: string[];
  private readonly byZcta: Map<string, ZipFeature>;
  private readonly placesByKind: Record<PlaceKind, PlaceRecord[]>;
  private readonly placeById: Map<string, PlaceRecord>;
  private accessCache: Map<string, ZipAccess> | null = null;
  private educationRank: Map<string, number> | null = null;

  constructor(snapshot: Snapshot) {
    this.snapshot = snapshot;
    this.metro = snapshot.manifest.metro;
    this.zips = snapshot.zips.features;
    this.regions = listRegions(this.metro);
    this.byZcta = new Map(this.zips.map((f) => [f.properties.zcta, f]));
    this.placesByKind = { library: snapshot.libraries, school: snapshot.schools };
    this.placeById = new Map(
      [...snapshot.libraries, ...snapshot.schools].map((p) => [p.id, p] as const)
    );
  }

  get metroLabel(): string {
    return getMetroConfig(this.metro)!.label;
  }

  getZip(zcta: string): ZipFeature | undefined {
    return this.byZcta.get(zcta);
  }

  getPlace(id: string): PlaceRecord | undefined {
    return this.placeById.get(id);
  }

  places(kind: PlaceKind): PlaceRecord[] {
    return this.placesByKind[kind];
  }

  /** Distances from every ZIP to every place within ACCESS_CAP_MILES, computed once. */
  access(): Map<string, ZipAccess> {
    if (this.accessCache) return this.accessCache;
    const cache = new Map<string, ZipAccess>();
    for (const zip of this.zips) {
      const box: BBox = geometryBBox(zip.geometry);
      const entry: ZipAccess = { library: [], school: [] };
      for (const kind of ["library", "school"] as const) {
        for (const place of this.placesByKind[kind]) {
          if (!countsAsLibraryAccess(place)) continue;
          const pt: [number, number] = [place.lon, place.lat];
          if (pointToBBoxMiles(pt, box) > ACCESS_CAP_MILES + 0.5) continue;
          const boundaryMiles = pointToPolygonMiles(pt, zip.geometry);
          if (boundaryMiles > ACCESS_CAP_MILES) continue;
          entry[kind].push({
            id: place.id,
            boundaryMiles,
            centerMiles: localMiles(zip.properties.anchor, pt),
          });
        }
        entry[kind].sort((a, b) => a.boundaryMiles - b.boundaryMiles || a.id.localeCompare(b.id));
      }
      cache.set(zip.properties.zcta, entry);
    }
    this.accessCache = cache;
    return cache;
  }

  accessFor(zcta: string): ZipAccess {
    return this.access().get(zcta) ?? { library: [], school: [] };
  }

  countWithin(zcta: string, kind: PlaceKind, miles: number, measure: DistanceMeasure = "boundary"): number {
    const field = measure === "boundary" ? "boundaryMiles" : "centerMiles";
    return this.accessFor(zcta)[kind].filter((a) => a[field] <= miles).length;
  }

  nearestMiles(zcta: string, kind: PlaceKind, measure: DistanceMeasure = "boundary"): number | null {
    const list = this.accessFor(zcta)[kind];
    if (list.length === 0) return null;
    if (measure === "boundary") return list[0].boundaryMiles;
    return Math.min(...list.map((a) => a.centerMiles));
  }

  /** 1 = highest composite need among reliable ZIPs. */
  educationNeedRank(zcta: string): { rank: number; of: number } | null {
    if (!this.educationRank) {
      const reliable = this.zips
        .filter((f) => f.properties.reliable)
        .sort(
          (a, b) =>
            b.properties.educationNeedScore - a.properties.educationNeedScore ||
            a.properties.zcta.localeCompare(b.properties.zcta)
        );
      this.educationRank = new Map(reliable.map((f, i) => [f.properties.zcta, i + 1]));
    }
    const rank = this.educationRank.get(zcta);
    return rank ? { rank, of: this.educationRank.size } : null;
  }

  toRow(p: ZipProperties): ZipRow {
    const lib = this.nearestMiles(p.zcta, "library");
    const sch = this.nearestMiles(p.zcta, "school");
    return {
      id: p.id,
      zcta: p.zcta,
      region: p.region,
      label: p.label,
      reliable: p.reliable,
      educationNeedTier: p.educationNeedTier,
      populationNeedTier: p.populationNeedTier,
      educationNeedScore: round(p.educationNeedScore, 1),
      haitianPop: p.haitianPop,
      haitianPopPct: round(p.haitianPopPct),
      totalPop: p.totalPop,
      pctNoInternet: round(p.pctNoInternet),
      pctNoHS: round(p.pctNoHS),
      speakers: p.speakers,
      limitedEnglish: p.limitedEnglish,
      nearestLibraryMiles: lib === null ? null : round(lib),
      nearestSchoolMiles: sch === null ? null : round(sch),
    };
  }

  /** Runs a structured ZIP query. Regions must already be resolved to canonical names. */
  findZips(q: ZipQuery): { matches: ZipRow[]; excludedUnreliable: number } {
    const regionSet = q.regions?.length ? new Set(q.regions) : null;
    const zipSet = q.zips?.length ? new Set(q.zips) : null;
    const mode = q.need?.mode ?? "education";
    const tierSet = q.need ? new Set<NeedTier>(q.need.tiers) : null;
    let excludedUnreliable = 0;

    const matches: ZipRow[] = [];
    for (const f of this.zips) {
      const p = f.properties;
      if (regionSet && (!p.region || !regionSet.has(p.region))) continue;
      if (zipSet && !zipSet.has(p.zcta)) continue;
      if (!p.reliable && !q.includeUnreliable) {
        excludedUnreliable++;
        continue;
      }
      if (tierSet) {
        const tier = mode === "education" ? p.educationNeedTier : p.populationNeedTier;
        if (!tierSet.has(tier)) continue;
      }
      let ok = true;
      for (const m of q.metrics ?? []) {
        const v = p[m.metric];
        if (m.min !== undefined && v < m.min) ok = false;
        if (m.max !== undefined && v > m.max) ok = false;
      }
      if (!ok) continue;

      const accessCounts: number[] = [];
      for (const c of q.access ?? []) {
        const n = this.countWithin(p.zcta, c.kind, c.withinMiles, c.measure);
        accessCounts.push(n);
        const atLeast = c.atLeast ?? 1;
        if (c.has ? n < atLeast : n >= atLeast) ok = false;
      }
      if (!ok) continue;

      const row = this.toRow(p);
      if (q.access?.length) row.accessCounts = accessCounts;
      matches.push(row);
    }

    const key: SortKey = q.sortBy?.key ?? (mode === "population" ? "haitianPopPct" : "educationNeedScore");
    const order = q.sortBy?.order ?? "desc";
    const dir = order === "asc" ? 1 : -1;
    const value = (r: ZipRow): number => {
      const v = r[key];
      // A ZIP with no place within the cap is "farther than anything measured".
      return v === null ? ACCESS_CAP_MILES + 1 : v;
    };
    matches.sort((a, b) => (value(a) - value(b)) * dir || a.zcta.localeCompare(b.zcta));
    return { matches, excludedUnreliable };
  }

  summarizeRegion(region: string | null, mode: NeedMode = "education"): RegionSummary {
    const zips = this.zips.filter((f) => region === null || f.properties.region === region);
    const reliable = zips.filter((f) => f.properties.reliable);
    const tierCounts: Record<NeedTier, number> = { high: 0, medium: 0, low: 0, insufficient_data: 0 };
    let totalPop = 0;
    let haitianPop = 0;
    let speakers = 0;
    let limitedEnglish = 0;
    for (const { properties: p } of zips) {
      tierCounts[mode === "education" ? p.educationNeedTier : p.populationNeedTier]++;
      totalPop += p.totalPop;
      haitianPop += p.haitianPop;
      speakers += p.speakers;
      limitedEnglish += p.limitedEnglish;
    }
    const inRegion = (pl: PlaceRecord) => region === null || pl.region === region;
    const highNoLib = reliable
      .filter((f) => (mode === "education" ? f.properties.educationNeedTier : f.properties.populationNeedTier) === "high")
      .filter((f) => this.countWithin(f.properties.zcta, "library", 1) === 0)
      .map((f) => f.properties.zcta)
      .sort();

    const med = (vals: number[]) => {
      const m = median(vals);
      return m === null ? null : round(m);
    };
    return {
      region: region ?? `All of ${this.metroLabel}`,
      zipCount: zips.length,
      reliableZipCount: reliable.length,
      totalPop,
      haitianPop,
      haitianPopPct: totalPop > 0 ? round((haitianPop / totalPop) * 100) : 0,
      speakers,
      limitedEnglish,
      tierCounts,
      medianPctNoInternet: med(reliable.map((f) => f.properties.pctNoInternet)),
      medianPctNoHS: med(reliable.map((f) => f.properties.pctNoHS)),
      libraries: this.placesByKind.library.filter(inRegion).length,
      schools: this.placesByKind.school.filter(inRegion).length,
      highNeedZipsWithoutLibraryWithin1Mile: highNoLib,
    };
  }
}

const engines = new WeakMap<Snapshot, QueryEngine>();

export function getEngine(snapshot: Snapshot): QueryEngine {
  let engine = engines.get(snapshot);
  if (!engine) {
    engine = new QueryEngine(snapshot);
    engines.set(snapshot, engine);
  }
  return engine;
}
