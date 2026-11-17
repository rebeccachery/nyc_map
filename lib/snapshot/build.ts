import { createHash } from "node:crypto";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { bbox, booleanPointInPolygon, pointOnFeature, simplify, truncate } from "@turf/turf";
import { hasReliableData, type NeedTier } from "@/lib/haitianNeed";
import type { HaitianZctaApiResponse } from "@/lib/haitianZctaTypes";
import type { MetroId } from "@/lib/metroRegistry";
import { placeSourceId, SOURCES_BY_METRO, zipBoundarySourceId } from "@/lib/snapshot/sources";
import {
  SNAPSHOT_SCHEMA_VERSION,
  type PlaceKind,
  type PlaceRecord,
  type Snapshot,
  type ZipCollection,
  type ZipFeature,
} from "@/lib/snapshot/types";

export const COORDINATE_PRECISION = 5; // ~1 m
export const SIMPLIFY_TOLERANCE_DEGREES = 0.00005; // ~5 m, negligible against mile-scale questions

export type SnapshotInput = {
  metro: MetroId;
  zcta: HaitianZctaApiResponse;
  libraries: FeatureCollection;
  schools: FeatureCollection;
  createdAt: string;
};

const SCHOOL_ATTR_KEYS = [
  "dbn",
  "grades",
  "school_type",
  "enrollment",
  "graduation_rate",
  "attendance_rate",
  "college_career_rate",
  "pct_stu_safe",
  "ell_programs",
  "neighborhood",
] as const;

const NUMERIC_ATTR_KEYS = new Set([
  "enrollment",
  "graduation_rate",
  "attendance_rate",
  "college_career_rate",
  "pct_stu_safe",
]);

function str(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isPolygonal(feature: Feature): feature is Feature<Polygon | MultiPolygon> {
  return feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon";
}

export function buildZipCollection(metro: MetroId, zcta: HaitianZctaApiResponse): ZipCollection {
  const boundarySource = zipBoundarySourceId(metro);
  const features: ZipFeature[] = [];

  for (const raw of zcta.features.features) {
    if (!isPolygonal(raw)) continue;
    const p = raw.properties ?? {};
    const zip = String(p.zcta).padStart(5, "0");

    const geometry = truncate(
      simplify(raw, { tolerance: SIMPLIFY_TOLERANCE_DEGREES, highQuality: true }),
      { precision: COORDINATE_PRECISION, coordinates: 2 }
    ).geometry;
    const anchor = pointOnFeature({ type: "Feature", geometry, properties: {} }).geometry
      .coordinates as [number, number];

    const haitianPop = num(p.haitianPop);
    const totalPop = num(p.totalPop);

    features.push({
      type: "Feature",
      id: zip,
      geometry,
      properties: {
        id: `zip:${zip}`,
        zcta: zip,
        metro,
        region: str(p.county ?? p.borough),
        label: str(p.label),
        totalPop,
        haitianPop,
        haitianPopPct: num(p.haitianPopPct),
        speakers: num(p.speakers),
        limitedEnglish: num(p.limitedEnglish),
        pctNoInternet: num(p.pctNoInternet),
        pctNoHS: num(p.pctNoHS),
        educationNeedScore: num(p.educationNeedScore),
        populationNeedTier: (p.populationNeedTier as NeedTier) ?? "insufficient_data",
        educationNeedTier: (p.educationNeedTier as NeedTier) ?? "insufficient_data",
        reliable: hasReliableData(haitianPop, totalPop),
        anchor: [
          Number(anchor[0].toFixed(COORDINATE_PRECISION)),
          Number(anchor[1].toFixed(COORDINATE_PRECISION)),
        ],
        sourceIds: ["census-acs5-2022", boundarySource],
      },
    });
  }

  features.sort((a, b) => a.properties.zcta.localeCompare(b.properties.zcta));
  return { type: "FeatureCollection", features };
}

type ZipIndexEntry = { feature: ZipFeature; box: [number, number, number, number] };

export function buildZipIndex(zips: ZipCollection): ZipIndexEntry[] {
  return zips.features.map((feature) => ({
    feature,
    box: bbox(feature) as [number, number, number, number],
  }));
}

/** Margin around the union of ZIP bounding boxes inside which a point still counts as "in the metro". */
export const METRO_MARGIN_DEGREES = 0.1; // ~11 km

export function metroBounds(index: ZipIndexEntry[]): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { box } of index) {
    b[0] = Math.min(b[0], box[0]);
    b[1] = Math.min(b[1], box[1]);
    b[2] = Math.max(b[2], box[2]);
    b[3] = Math.max(b[3], box[3]);
  }
  return [
    b[0] - METRO_MARGIN_DEGREES,
    b[1] - METRO_MARGIN_DEGREES,
    b[2] + METRO_MARGIN_DEGREES,
    b[3] + METRO_MARGIN_DEGREES,
  ];
}

export function findContainingZip(index: ZipIndexEntry[], lon: number, lat: number): ZipFeature | null {
  for (const { feature, box } of index) {
    if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue;
    if (booleanPointInPolygon([lon, lat], feature)) return feature;
  }
  return null;
}

function placeId(kind: PlaceKind, metro: MetroId, name: string, lon: number, lat: number): string {
  const prefix = kind === "library" ? "lib" : "sch";
  const hash = createHash("sha1")
    .update(`${kind}|${name.toLowerCase()}|${lon.toFixed(4)}|${lat.toFixed(4)}`)
    .digest("hex")
    .slice(0, 8);
  return `${prefix}:${metro}:${hash}`;
}

export function buildPlaceRecords(
  metro: MetroId,
  kind: PlaceKind,
  collection: FeatureCollection,
  zipIndex: ZipIndexEntry[]
): { records: PlaceRecord[]; dropped: number; outsideZips: number; outsideMetro: number } {
  const records: PlaceRecord[] = [];
  const seen = new Map<string, number>();
  const bounds = metroBounds(zipIndex);
  const perSource = new Map<string, { total: number; outside: number; example?: string }>();
  let dropped = 0;
  let outsideZips = 0;
  let outsideMetro = 0;

  for (const feature of collection.features) {
    const geom = feature.geometry as Point | null;
    const p = feature.properties ?? {};
    if (!geom || geom.type !== "Point") {
      dropped++;
      continue;
    }
    const [rawLon, rawLat] = geom.coordinates;
    if (!Number.isFinite(rawLon) || !Number.isFinite(rawLat) || (rawLon === 0 && rawLat === 0)) {
      dropped++;
      continue;
    }
    const lon = Number(rawLon.toFixed(COORDINATE_PRECISION));
    const lat = Number(rawLat.toFixed(COORDINATE_PRECISION));

    const name =
      str(kind === "library" ? p.name : p.school_name) ??
      (kind === "library" ? "Unnamed library" : "Unnamed school");

    const sourceId = placeSourceId(metro, kind, p);
    const tally = perSource.get(sourceId) ?? { total: 0, outside: 0 };
    tally.total++;
    perSource.set(sourceId, tally);
    if (lon < bounds[0] || lon > bounds[2] || lat < bounds[1] || lat > bounds[3]) {
      // Not in this metro at all: a wrong or mis-projected source, not a data gap.
      tally.outside++;
      tally.example ??= `"${name}" at ${lat}, ${lon}`;
      outsideMetro++;
      continue;
    }

    const container = findContainingZip(zipIndex, lon, lat);
    if (!container) outsideZips++;

    const attrs: Record<string, string | number | null> = {};
    if (kind === "school") {
      for (const key of SCHOOL_ATTR_KEYS) {
        if (p[key] === undefined || p[key] === null || p[key] === "") continue;
        attrs[key] = NUMERIC_ATTR_KEYS.has(key) && Number.isFinite(Number(p[key]))
          ? Number(p[key])
          : String(p[key]);
      }
    }
    if (kind === "library" && str(p.system)) attrs.system = String(p.system);
    if (kind === "library" && str(p.branchType)) attrs.branch_type = String(p.branchType);
    if (str(p.url)) attrs.url = String(p.url);

    let id = placeId(kind, metro, name, lon, lat);
    const dupes = seen.get(id) ?? 0;
    seen.set(id, dupes + 1);
    if (dupes > 0) id = `${id}-${dupes + 1}`;

    const reportedZip = str(p.zip);
    records.push({
      id,
      kind,
      metro,
      name,
      address: str(kind === "library" ? p.streetAddress : p.primary_address_line_1),
      city: str(p.city),
      reportedZip: reportedZip && /^\d{5}$/.test(reportedZip) ? reportedZip : null,
      zip: container?.properties.zcta ?? null,
      region: container?.properties.region ?? str(p.county ?? p.boro),
      lon,
      lat,
      sourceId,
      attrs,
    });
  }

  for (const [sourceId, { total, outside, example }] of perSource) {
    if (outside > 0 && outside / total >= 0.5) {
      throw new Error(
        `Source "${sourceId}": ${outside} of ${total} ${kind} points lie outside the ${metro} area ` +
          `(e.g. ${example}). The source URL probably points at the wrong dataset.`
      );
    }
  }

  records.sort((a, b) => a.id.localeCompare(b.id));
  return { records, dropped, outsideZips, outsideMetro };
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const { metro } = input;
  const zips = buildZipCollection(metro, input.zcta);
  const index = buildZipIndex(zips);
  const libraries = buildPlaceRecords(metro, "library", input.libraries, index);
  const schools = buildPlaceRecords(metro, "school", input.schools, index);

  const reliableZips = zips.features.filter((f) => f.properties.reliable).length;
  const warnings: string[] = [];
  const unreliable = zips.features.length - reliableZips;
  if (unreliable > 0) {
    warnings.push(
      `${unreliable} of ${zips.features.length} ZIPs have too few residents (under 500 total or under 10 Haitian ancestry) for reliable estimates and are tiered "insufficient_data".`
    );
  }
  for (const [label, result] of [
    ["libraries", libraries],
    ["schools", schools],
  ] as const) {
    if (result.dropped > 0) warnings.push(`${result.dropped} ${label} dropped for missing coordinates.`);
    if (result.outsideMetro > 0) {
      warnings.push(`${result.outsideMetro} ${label} dropped for lying outside the metro area.`);
    }
    if (result.outsideZips > 0) {
      warnings.push(`${result.outsideZips} ${label} fall outside every mapped ZIP (zip = null).`);
    }
  }
  const missingReported = libraries.records.filter((r) => !r.reportedZip).length;
  if (missingReported > 0) {
    warnings.push(
      `${missingReported} libraries have no ZIP in the source data; their ZIP is assigned from coordinates.`
    );
  }
  if (metro === "miami") {
    warnings.push("Miami school datasets carry no performance metrics (graduation, attendance).");
  }
  warnings.push("ACS figures are 5-year survey estimates with margins of error not shown here.");

  return {
    manifest: {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      metro,
      createdAt: input.createdAt,
      sources: SOURCES_BY_METRO[metro],
      counts: {
        zips: zips.features.length,
        reliableZips,
        libraries: libraries.records.length,
        schools: schools.records.length,
      },
      tierBreaks: {
        population: input.zcta.stats.populationTierBreaks,
        education: input.zcta.stats.educationTierBreaks,
      },
      processing: {
        coordinatePrecision: COORDINATE_PRECISION,
        simplifyToleranceDegrees: SIMPLIFY_TOLERANCE_DEGREES,
        needMethod:
          "Composite education need = 40% Haitian-ancestry share rank + 30% households-without-internet rank + 30% adults-without-HS-diploma rank, ranked among reliable ZIPs in the metro.",
        tierMethod:
          "High / medium / low = top / middle / bottom third (33rd and 67th percentiles) among reliable ZIPs in the metro, computed separately for population share and composite score.",
      },
      warnings,
    },
    zips,
    libraries: libraries.records,
    schools: schools.records,
  };
}
