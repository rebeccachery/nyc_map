import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSnapshot } from "@/lib/snapshot/build";
import { clearSnapshotCache, loadSnapshot, SNAPSHOT_FILES } from "@/lib/snapshot/load";
import type { Snapshot } from "@/lib/snapshot/types";
import { buildMiniLibraries, buildMiniSchools, buildMiniZcta } from "../fixtures/miniMetro";

let root: string;

function writeSnapshot(snapshot: Snapshot) {
  const dir = path.join(root, snapshot.manifest.metro);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, SNAPSHOT_FILES.manifest), JSON.stringify(snapshot.manifest));
  writeFileSync(path.join(dir, SNAPSHOT_FILES.zips), JSON.stringify(snapshot.zips));
  writeFileSync(path.join(dir, SNAPSHOT_FILES.libraries), JSON.stringify(snapshot.libraries));
  writeFileSync(path.join(dir, SNAPSHOT_FILES.schools), JSON.stringify(snapshot.schools));
  return dir;
}

function mini(): Snapshot {
  return buildSnapshot({
    metro: "miami",
    zcta: buildMiniZcta(),
    libraries: buildMiniLibraries(),
    schools: buildMiniSchools(),
    createdAt: "2026-11-13T00:00:00.000Z",
  });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "snapshot-test-"));
  clearSnapshotCache();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("loadSnapshot", () => {
  it("round-trips a written snapshot", () => {
    const original = mini();
    writeSnapshot(original);
    const loaded = loadSnapshot("miami", root);
    expect(loaded.manifest.counts).toEqual(original.manifest.counts);
    expect(loaded.zips.features.map((f) => f.properties.id)).toEqual(
      original.zips.features.map((f) => f.properties.id)
    );
    expect(loaded.libraries).toEqual(original.libraries);
  });

  it("tells you how to create a missing snapshot", () => {
    expect(() => loadSnapshot("nyc", root)).toThrow(/npm run snapshot -- nyc/);
  });

  it("rejects a snapshot whose records cite unknown sources", () => {
    const snap = mini();
    snap.libraries[0].sourceId = "made-up-source";
    writeSnapshot(snap);
    expect(() => loadSnapshot("miami", root)).toThrow(/unknown source made-up-source/);
  });

  it("rejects a snapshot whose counts disagree with the manifest", () => {
    const snap = mini();
    snap.schools.pop();
    writeSnapshot(snap);
    expect(() => loadSnapshot("miami", root)).toThrow(/manifest says 3 schools, file has 2/);
  });

  it("rejects an old schema version", () => {
    const snap = mini();
    const dir = writeSnapshot(snap);
    const manifestPath = path.join(dir, SNAPSHOT_FILES.manifest);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, schemaVersion: 0 }));
    expect(() => loadSnapshot("miami", root)).toThrow(/schema v0/);
  });
});
