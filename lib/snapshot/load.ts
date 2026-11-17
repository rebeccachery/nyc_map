import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { MetroId } from "@/lib/metroRegistry";
import {
  SNAPSHOT_SCHEMA_VERSION,
  type PlaceRecord,
  type Snapshot,
  type SnapshotManifest,
  type ZipCollection,
} from "@/lib/snapshot/types";

export const SNAPSHOT_FILES = {
  manifest: "manifest.json",
  zips: "zips.geojson",
  libraries: "libraries.json",
  schools: "schools.json",
} as const;

export function defaultSnapshotRoot(): string {
  return path.join(process.cwd(), "data", "snapshots");
}

/**
 * Path to one snapshot file. The default branch is written so the bundler can see it only
 * touches data/snapshots/; a custom root (tests) is opaque to it.
 */
function snapshotFile(metro: MetroId, file: string, root?: string): string {
  return root
    ? path.join(/*turbopackIgnore: true*/ root, metro, file)
    : path.join(process.cwd(), "data", "snapshots", metro, file);
}

export function snapshotDir(metro: MetroId, root?: string): string {
  return root ? path.join(/*turbopackIgnore: true*/ root, metro) : path.join(process.cwd(), "data", "snapshots", metro);
}

export function snapshotExists(metro: MetroId, root?: string): boolean {
  return existsSync(snapshotFile(metro, SNAPSHOT_FILES.manifest, root));
}

const cache = new Map<string, Snapshot>();

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

/** Loads a frozen snapshot from disk and checks it is internally consistent. Cached per process. */
export function loadSnapshot(metro: MetroId, root?: string): Snapshot {
  const dir = snapshotDir(metro, root);
  const cached = cache.get(dir);
  if (cached) return cached;

  if (!snapshotExists(metro, root)) {
    throw new Error(
      `No data snapshot for "${metro}" at ${dir}. Run \`npm run snapshot -- ${metro}\` first.`
    );
  }

  const manifest = readJson<SnapshotManifest>(snapshotFile(metro, SNAPSHOT_FILES.manifest, root));
  if (manifest.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(
      `Snapshot for "${metro}" has schema v${manifest.schemaVersion}; expected v${SNAPSHOT_SCHEMA_VERSION}. Re-run \`npm run snapshot -- ${metro}\`.`
    );
  }
  if (manifest.metro !== metro) {
    throw new Error(`Snapshot at ${dir} is for "${manifest.metro}", not "${metro}".`);
  }

  const snapshot: Snapshot = {
    manifest,
    zips: readJson<ZipCollection>(snapshotFile(metro, SNAPSHOT_FILES.zips, root)),
    libraries: readJson<PlaceRecord[]>(snapshotFile(metro, SNAPSHOT_FILES.libraries, root)),
    schools: readJson<PlaceRecord[]>(snapshotFile(metro, SNAPSHOT_FILES.schools, root)),
  };

  const problems = validateSnapshot(snapshot);
  if (problems.length > 0) {
    throw new Error(`Snapshot for "${metro}" is inconsistent:\n- ${problems.join("\n- ")}`);
  }

  cache.set(dir, snapshot);
  return snapshot;
}

/** Returns a list of problems; empty means the snapshot is usable. */
export function validateSnapshot(snapshot: Snapshot): string[] {
  const problems: string[] = [];
  const { manifest, zips, libraries, schools } = snapshot;

  if (zips.features.length !== manifest.counts.zips) {
    problems.push(`manifest says ${manifest.counts.zips} ZIPs, file has ${zips.features.length}`);
  }
  if (libraries.length !== manifest.counts.libraries) {
    problems.push(`manifest says ${manifest.counts.libraries} libraries, file has ${libraries.length}`);
  }
  if (schools.length !== manifest.counts.schools) {
    problems.push(`manifest says ${manifest.counts.schools} schools, file has ${schools.length}`);
  }

  const sourceIds = new Set(manifest.sources.map((s) => s.id));
  const ids = new Set<string>();
  const zipCodes = new Set<string>();

  for (const f of zips.features) {
    const p = f.properties;
    if (ids.has(p.id)) problems.push(`duplicate id ${p.id}`);
    ids.add(p.id);
    zipCodes.add(p.zcta);
    for (const s of p.sourceIds) if (!sourceIds.has(s)) problems.push(`${p.id} cites unknown source ${s}`);
  }
  for (const r of [...libraries, ...schools]) {
    if (ids.has(r.id)) problems.push(`duplicate id ${r.id}`);
    ids.add(r.id);
    if (!sourceIds.has(r.sourceId)) problems.push(`${r.id} cites unknown source ${r.sourceId}`);
    if (r.zip !== null && !zipCodes.has(r.zip)) problems.push(`${r.id} points at unknown ZIP ${r.zip}`);
  }

  return problems.slice(0, 20);
}

/** Test helper: forget cached snapshots. */
export function clearSnapshotCache(): void {
  cache.clear();
}
