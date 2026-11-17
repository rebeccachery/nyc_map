import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_BASEMAP_STYLE_URL } from "@/lib/basemap";

const mapSource = readFileSync(path.resolve(import.meta.dirname, "../components/NYCMapCore.tsx"), "utf8");

describe("basemap", () => {
  it("defaults to a keyless provider", () => {
    expect(DEFAULT_BASEMAP_STYLE_URL).toBe("https://tiles.openfreemap.org/styles/positron");
  });

  it("does not use Plotly's built-in CARTO styles, which now need a key", () => {
    expect(mapSource).not.toMatch(/["']carto-(positron|darkmatter|voyager)/);
  });

  it("uses MapLibre traces, not the deprecated Mapbox ones (removed in Plotly v4)", () => {
    expect(mapSource).not.toMatch(/scattermapbox|choroplethmapbox|densitymapbox|["']mapbox\./);
    expect(mapSource).toMatch(/style: BASEMAP_STYLE_URL/);
  });

  it("shows the provider attribution", () => {
    expect(mapSource).toMatch(/\{BASEMAP_ATTRIBUTION\}/);
  });
});
