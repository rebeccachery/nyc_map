/**
 * Freezes the live public data the map uses into data/snapshots/<metro>/ so the
 * ask-the-map agent and its golden-set eval run against fixed, citable numbers.
 *
 *   npm run snapshot            # both metros
 *   npm run snapshot -- miami   # one metro
 *
 * Reads CENSUS_API_KEY from .env.local (optional; works keyless at low rate limits).
 */
import { loadEnvConfig } from "@next/env";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

async function main() {
  // Imported after env is loaded so modules see CENSUS_API_KEY.
  const { buildHaitianZcta } = await import("@/lib/haitianZctaBuild");
  const { fetchMiamiLibraries, fetchMiamiSchools } = await import("@/lib/miamiOverlays");
  const { fetchNycLibraries, fetchNycSchools } = await import("@/lib/nycOverlays");
  const { buildSnapshot } = await import("@/lib/snapshot/build");
  const { defaultSnapshotRoot, snapshotDir, SNAPSHOT_FILES, loadSnapshot } = await import(
    "@/lib/snapshot/load"
  );
  const { isValidMetroId } = await import("@/lib/metroRegistry");
  type MetroId = import("@/lib/metroRegistry").MetroId;

  const args = process.argv.slice(2);
  const metros: MetroId[] = args.length > 0 ? [] : ["miami", "nyc"];
  for (const arg of args) {
    if (!isValidMetroId(arg)) {
      console.error(`Unknown metro "${arg}". Use one of: miami, nyc.`);
      process.exit(2);
    }
    metros.push(arg);
  }

  if (!process.env.CENSUS_API_KEY) {
    console.warn("CENSUS_API_KEY is not set; calling the Census API without a key.");
  }

  const root = defaultSnapshotRoot();
  const failures: string[] = [];

  for (const metro of metros) {
    const started = Date.now();
    console.log(`\n[${metro}] fetching ZIP data, libraries, schools…`);
    try {
      const [zcta, libraries, schools] = await Promise.all([
        buildHaitianZcta(metro),
        metro === "miami" ? fetchMiamiLibraries() : fetchNycLibraries(),
        metro === "miami" ? fetchMiamiSchools() : fetchNycSchools(),
      ]);

      const snapshot = buildSnapshot({
        metro,
        zcta,
        libraries,
        schools,
        createdAt: new Date().toISOString(),
      });

      // Write to a temp dir, then swap, so a failed run never leaves a half-written snapshot.
      const finalDir = snapshotDir(metro, root);
      const tmpDir = `${finalDir}.tmp`;
      rmSync(tmpDir, { recursive: true, force: true });
      mkdirSync(tmpDir, { recursive: true });
      const write = (file: string, data: unknown) =>
        writeFileSync(path.join(tmpDir, file), JSON.stringify(data) + "\n");
      writeFileSync(
        path.join(tmpDir, SNAPSHOT_FILES.manifest),
        JSON.stringify(snapshot.manifest, null, 2) + "\n"
      );
      write(SNAPSHOT_FILES.zips, snapshot.zips);
      write(SNAPSHOT_FILES.libraries, snapshot.libraries);
      write(SNAPSHOT_FILES.schools, snapshot.schools);
      rmSync(finalDir, { recursive: true, force: true });
      renameSync(tmpDir, finalDir);

      loadSnapshot(metro, root); // re-read and validate what was written

      const { counts, warnings } = snapshot.manifest;
      console.log(
        `[${metro}] wrote ${finalDir} in ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
          `${counts.zips} ZIPs (${counts.reliableZips} reliable), ${counts.libraries} libraries, ${counts.schools} schools`
      );
      for (const w of warnings) console.log(`[${metro}]   note: ${w}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${metro}] FAILED: ${message}`);
      failures.push(metro);
    }
  }

  if (failures.length > 0) {
    console.error(`\nSnapshot failed for: ${failures.join(", ")}. Existing snapshots were left untouched.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
