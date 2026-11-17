/**
 * Pre-deploy check that the basemap will load, without an API-key watermark.
 *
 *   npm run check:basemap
 *
 * Fetches the configured MapLibre style, its tile source metadata, and one real tile over
 * Miami and over NYC. Fails (exit 1) if anything is unreachable, returns an error, or is the
 * small placeholder image tile servers send when a key is missing.
 * Reads NEXT_PUBLIC_BASEMAP_STYLE_URL from .env.local / .env.production if set.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type Source = { type: string; url?: string; tiles?: string[] };

const PLACES = {
  Miami: { lat: 25.83, lon: -80.2 },
  NYC: { lat: 40.65, lon: -73.95 },
};
const ZOOM = 12;

function tileXY(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x, y };
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "user-agent": "haitian-equity-map basemap check" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function main() {
  const { BASEMAP_STYLE_URL } = await import("@/lib/basemap");
  const problems: string[] = [];
  console.log(`Basemap style: ${BASEMAP_STYLE_URL}`);
  if (/cartocdn|cartodb/.test(BASEMAP_STYLE_URL) && !/[?&]key=/.test(BASEMAP_STYLE_URL)) {
    problems.push("CARTO style URL has no ?key= parameter; CARTO shows an API-key watermark without one.");
  }

  const style = (await (await get(BASEMAP_STYLE_URL)).json()) as { version?: number; sources?: Record<string, Source> };
  if (style.version !== 8 || !style.sources) throw new Error("Not a MapLibre style (expected version 8 with sources).");

  for (const [name, source] of Object.entries(style.sources)) {
    if (source.type !== "vector" && source.type !== "raster") continue;
    let templates = source.tiles;
    if (!templates && source.url) {
      const tilejson = (await (await get(source.url)).json()) as { tiles?: string[]; maxzoom?: number };
      templates = tilejson.tiles;
    }
    if (!templates?.length) {
      problems.push(`Source "${name}" lists no tile URLs.`);
      continue;
    }
    for (const [place, { lat, lon }] of Object.entries(PLACES)) {
      // Raster overview layers often stop at low zooms; test those at their own range.
      const z = source.type === "raster" ? 5 : ZOOM;
      const { x, y } = tileXY(lat, lon, z);
      const url = templates[0].replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
      try {
        const res = await get(url);
        const bytes = (await res.arrayBuffer()).byteLength;
        const type = res.headers.get("content-type") ?? "";
        console.log(`  ${name} ${place} z${z}: ${res.status} ${type} ${bytes} bytes`);
        if (bytes === 0) problems.push(`Empty tile from "${name}" over ${place}.`);
        if (source.type === "vector" && /image|html|json/.test(type)) {
          problems.push(`Vector source "${name}" returned ${type} over ${place} (likely an error or key placeholder).`);
        }
      } catch (error) {
        problems.push(`Tile request failed for "${name}" over ${place}: ${(error as Error).message}`);
      }
    }
  }

  if (problems.length) {
    console.error(`\nBasemap check FAILED:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nBasemap check passed: style and tiles load without a key.");
}

main().catch((error) => {
  console.error(`Basemap check FAILED: ${(error as Error).message}`);
  process.exit(1);
});
