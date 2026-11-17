import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { NeedTier, TierBreaks } from "@/lib/haitianNeed";
import type { MetroId } from "@/lib/metroRegistry";

export const SNAPSHOT_SCHEMA_VERSION = 1;

/** A public dataset that snapshot records can cite. */
export type SourceRef = {
  id: string;
  name: string;
  /** Human-facing landing page, used in citations. */
  url: string;
  usedFor: string;
};

export type ZipProperties = {
  /** Stable citation id, e.g. "zip:33127". */
  id: string;
  zcta: string;
  metro: MetroId;
  region: string | null;
  /** NYC MODZCTA neighborhood label when available. */
  label: string | null;
  totalPop: number;
  haitianPop: number;
  haitianPopPct: number;
  /** People 5+ who speak French, Haitian Creole, or Cajun at home (ACS C16001_006; not Haitian-only). */
  speakers: number;
  /** Of those speakers, people who speak English less than "very well" (C16001_008). */
  limitedEnglish: number;
  pctNoInternet: number;
  pctNoHS: number;
  /** Composite 0–100 score (40% Haitian pop rank, 30% no-internet rank, 30% no-HS rank). */
  educationNeedScore: number;
  populationNeedTier: NeedTier;
  educationNeedTier: NeedTier;
  /** False when population is too small for ACS estimates to be meaningful. */
  reliable: boolean;
  /** [lon, lat] of a point guaranteed to sit inside the ZIP polygon. */
  anchor: [number, number];
  sourceIds: string[];
};

export type ZipFeature = Feature<Polygon | MultiPolygon, ZipProperties>;
export type ZipCollection = FeatureCollection<Polygon | MultiPolygon, ZipProperties>;

export type PlaceKind = "library" | "school";

export type PlaceRecord = {
  /** Stable citation id, e.g. "lib:miami:3f2a9c1d". */
  id: string;
  kind: PlaceKind;
  metro: MetroId;
  name: string;
  address: string | null;
  city: string | null;
  /** ZIP as reported by the source dataset (may be blank or wrong). */
  reportedZip: string | null;
  /** ZIP polygon the point actually falls in; null if outside every mapped ZIP. */
  zip: string | null;
  region: string | null;
  lon: number;
  lat: number;
  sourceId: string;
  /** Kind-specific fields, e.g. graduation_rate or grades for schools. */
  attrs: Record<string, string | number | null>;
};

export type SnapshotManifest = {
  schemaVersion: number;
  metro: MetroId;
  createdAt: string;
  sources: SourceRef[];
  counts: {
    zips: number;
    reliableZips: number;
    libraries: number;
    schools: number;
  };
  tierBreaks: {
    population: TierBreaks;
    education: TierBreaks;
  };
  processing: {
    coordinatePrecision: number;
    simplifyToleranceDegrees: number;
    needMethod: string;
    tierMethod: string;
  };
  /** Data-quality notes surfaced to the agent and the write-up. */
  warnings: string[];
};

export type Snapshot = {
  manifest: SnapshotManifest;
  zips: ZipCollection;
  libraries: PlaceRecord[];
  schools: PlaceRecord[];
};
