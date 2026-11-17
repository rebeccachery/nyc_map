/**
 * Basemap (background map) configuration.
 *
 * Default: OpenFreeMap's "positron" style — free, no API key, no registration, no request limits
 * (https://openfreemap.org). CARTO's raster basemaps stopped serving keyless requests on
 * 25 Sept 2026 and show an "API KEY REQUIRED" watermark, which is why this no longer uses
 * Plotly's built-in "carto-positron" style.
 *
 * To use another provider, set NEXT_PUBLIC_BASEMAP_STYLE_URL to any MapLibre style JSON URL,
 * e.g. CARTO with a free key: https://basemaps.cartocdn.com/gl/positron-gl-style/style.json?key=YOUR_KEY
 */
export const DEFAULT_BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export const BASEMAP_STYLE_URL =
  process.env.NEXT_PUBLIC_BASEMAP_STYLE_URL?.trim() || DEFAULT_BASEMAP_STYLE_URL;

/** Attribution the tile provider requires to stay visible. */
export const BASEMAP_ATTRIBUTION =
  process.env.NEXT_PUBLIC_BASEMAP_ATTRIBUTION?.trim() ||
  "Basemap © OpenFreeMap · © OpenMapTiles · Data © OpenStreetMap contributors";
