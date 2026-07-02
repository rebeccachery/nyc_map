"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FeatureCollection, Point } from "geojson";
import { HAITIAN_COLORSCALE, getActiveNeedFromProperties, tierLabel, type NeedScoreMode } from "@/lib/haitianNeed";
import { getFeatureCentroid } from "@/lib/geo";
import { parseModzctaLabel } from "@/lib/format";
import {
  buildBoroughHoverText,
  buildLibraryHoverText,
  buildSchoolHoverText,
  buildZctaHoverText,
  getMapStatusLines,
} from "@/lib/mapHoverText";

export type NYCMapCoreProps = {
  haitianPopData?: any[];
  haitianZctaData?: FeatureCollection;
  schoolsData?: FeatureCollection;
  librariesData?: FeatureCollection;
  showHaitianHeat?: boolean;
  showHaitianBubbles?: boolean;
  showSchools?: boolean;
  showLibraries?: boolean;
  haitianHeatOpacity?: number;
  needScoreMode?: NeedScoreMode;
  selectedBorough?: string | null;
  selectedZcta?: string | null;
  onSelectZcta?: (zcta: string | null) => void;
  loadingHaitianZcta?: boolean;
  className?: string;
};

const boroughCenters: Record<string, { lat: number; lon: number; zoom: number }> = {
  Brooklyn: { lat: 40.6501, lon: -73.9496, zoom: 11.2 },
  Queens: { lat: 40.7282, lon: -73.7949, zoom: 11.2 },
  Manhattan: { lat: 40.7831, lon: -73.9712, zoom: 11.8 },
  Bronx: { lat: 40.8448, lon: -73.8648, zoom: 11.8 },
  "Staten Island": { lat: 40.5795, lon: -74.1502, zoom: 11.2 },
};

function applyOpacityToColorscale(
  scale: [number, string][],
  opacity: number
): [number, string][] {
  return scale.map(([stop, color]) => {
    const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (match) {
      const alpha = parseFloat(match[4]) * opacity;
      return [stop, `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`];
    }
    return [stop, color];
  });
}

type PlotlyClickData = { points?: Array<{ location?: string }> };

type PlotlyGraphDiv = HTMLDivElement & {
  on?: (event: string, handler: (data: PlotlyClickData) => void) => void;
  removeAllListeners?: (event: string) => void;
};

function bindPlotlyClick(
  container: HTMLDivElement,
  handler: (data: PlotlyClickData) => void
): () => void {
  const gd = container as PlotlyGraphDiv;

  if (typeof gd.on === "function") {
    gd.removeAllListeners?.("plotly_click");
    gd.on("plotly_click", handler);
    return () => gd.removeAllListeners?.("plotly_click");
  }

  const domHandler = (event: Event) => {
    const detail = (event as CustomEvent<PlotlyClickData>).detail;
    handler(detail ?? {});
  };
  container.addEventListener("plotly_click", domHandler);
  return () => container.removeEventListener("plotly_click", domHandler);
}

export default function NYCMapCore({
  haitianPopData = [],
  haitianZctaData,
  schoolsData,
  librariesData,
  showHaitianHeat = true,
  showHaitianBubbles = false,
  showSchools = true,
  showLibraries = true,
  haitianHeatOpacity = 0.75,
  needScoreMode = "population",
  selectedBorough = null,
  selectedZcta = null,
  onSelectZcta,
  loadingHaitianZcta = false,
  className,
}: NYCMapCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const unbindClickRef = useRef<(() => void) | null>(null);
  const handlePlotlyClickRef = useRef<(data: PlotlyClickData) => void>(() => {});

  const filteredZctaFeatures = useMemo(() => {
    if (!haitianZctaData?.features.length) return [];
    if (!selectedBorough) return haitianZctaData.features;
    return haitianZctaData.features.filter(
      (f) => f.properties?.borough === selectedBorough
    );
  }, [haitianZctaData, selectedBorough]);

  const heatGeoJson = useMemo((): FeatureCollection | undefined => {
    if (!filteredZctaFeatures.length) return undefined;
    return { type: "FeatureCollection", features: filteredZctaFeatures };
  }, [filteredZctaFeatures]);

  const mapData = useMemo(() => {
    const traces: any[] = [
      {
        type: "scattermapbox",
        lat: [],
        lon: [],
        mode: "markers",
        showlegend: false,
        hoverinfo: "none",
      },
    ];

    if (showHaitianHeat && heatGeoJson?.features.length) {
      const locations: string[] = [];
      const zValues: number[] = [];
      const hoverText: string[] = [];

      heatGeoJson.features.forEach((f) => {
        const p = f.properties ?? {};
        const zcta = String(p.zcta);
        const active = getActiveNeedFromProperties(p, needScoreMode);
        locations.push(zcta);
        zValues.push(active.colorValue);
        hoverText.push(buildZctaHoverText(p, needScoreMode));
      });

      traces.push({
        type: "choroplethmapbox",
        geojson: heatGeoJson,
        featureidkey: "properties.zcta",
        locations,
        z: zValues,
        zmin: 0,
        zmax: 1,
        colorscale: applyOpacityToColorscale(HAITIAN_COLORSCALE, haitianHeatOpacity),
        marker: {
          line: { width: 0.6, color: "rgba(39, 39, 42, 0.7)" },
        },
        showscale: false,
        hoverinfo: "text",
        text: hoverText,
        name: needScoreMode === "education" ? "Educational Need (ZIP)" : "Haitian Pop Heat (ZIP)",
        showlegend: true,
      });

      if (selectedZcta) {
        const selectedFeature = heatGeoJson.features.find(
          (f) => String(f.properties?.zcta) === selectedZcta
        );
        if (selectedFeature) {
          const highlightCollection: FeatureCollection = {
            type: "FeatureCollection",
            features: [selectedFeature],
          };
          traces.push({
            type: "choroplethmapbox",
            geojson: highlightCollection,
            featureidkey: "properties.zcta",
            locations: [selectedZcta],
            z: [1],
            zmin: 0,
            zmax: 1,
            colorscale: [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0)"]],
            marker: {
              line: { width: 3, color: "rgba(255, 255, 255, 0.95)" },
            },
            showscale: false,
            hoverinfo: "skip",
            showlegend: false,
          });
        }
      }
    }

    if (showHaitianBubbles && haitianPopData && haitianPopData.length > 0) {
      const bubbleLat: number[] = [];
      const bubbleLon: number[] = [];
      const bubbleSizes: number[] = [];
      const bubbleText: string[] = [];

      const boroCenters: Record<string, { lat: number; lon: number }> = {
        Brooklyn: { lat: 40.6501, lon: -73.9496 },
        Queens: { lat: 40.7282, lon: -73.7949 },
        Manhattan: { lat: 40.7831, lon: -73.9712 },
        Bronx: { lat: 40.8448, lon: -73.8648 },
        "Staten Island": { lat: 40.5795, lon: -74.1502 },
      };

      haitianPopData.forEach((item) => {
        const center = boroCenters[item.boroughName];
        if (center) {
          bubbleLat.push(center.lat);
          bubbleLon.push(center.lon);
          const size = 15 + Math.sqrt(item.haitianPop) * 0.18;
          bubbleSizes.push(size);
          bubbleText.push(buildBoroughHoverText(item));
        }
      });

      if (bubbleLat.length > 0) {
        traces.push({
          type: "scattermapbox",
          mode: "markers",
          lat: bubbleLat,
          lon: bubbleLon,
          text: bubbleText,
          hoverinfo: "text",
          marker: {
            size: bubbleSizes,
            color: "rgba(249, 115, 22, 0.45)",
            line: { color: "rgba(234, 88, 12, 0.9)", width: 2.5 },
          },
          name: "Haitian Pop Density (Borough)",
          showlegend: true,
        });
      }
    }

    if (showSchools && schoolsData && schoolsData.features.length > 0) {
      const schoolLat: number[] = [];
      const schoolLon: number[] = [];
      const schoolColors: string[] = [];
      const schoolText: string[] = [];

      schoolsData.features.forEach((f) => {
        if (f.geometry.type === "Point") {
          const coords = (f.geometry as Point).coordinates;
          const props = f.properties || {};

          schoolLat.push(coords[1]);
          schoolLon.push(coords[0]);

          const gradRate = parseFloat(props.graduation_rate) || 0;

          let color = "rgba(156, 163, 175, 0.8)";
          if (props.graduation_rate !== undefined && props.graduation_rate !== null) {
            if (gradRate < 0.6) color = "rgba(239, 68, 68, 0.9)";
            else if (gradRate < 0.8) color = "rgba(245, 158, 11, 0.9)";
            else color = "rgba(16, 185, 129, 0.9)";
          }
          schoolColors.push(color);
          schoolText.push(buildSchoolHoverText(props));
        }
      });

      if (schoolLat.length > 0) {
        traces.push({
          type: "scattermapbox",
          mode: "markers",
          lat: schoolLat,
          lon: schoolLon,
          text: schoolText,
          hoverinfo: "text",
          marker: { size: 8, color: schoolColors, opacity: 0.95 },
          name: "High Schools",
          showlegend: true,
        });
      }
    }

    if (showLibraries && librariesData && librariesData.features.length > 0) {
      const libLat: number[] = [];
      const libLon: number[] = [];
      const libText: string[] = [];

      librariesData.features.forEach((f) => {
        if (f.geometry.type === "Point") {
          const coords = (f.geometry as Point).coordinates;
          const props = f.properties || {};
          libLat.push(coords[1]);
          libLon.push(coords[0]);
          libText.push(buildLibraryHoverText(props));
        }
      });

      if (libLat.length > 0) {
        traces.push({
          type: "scattermapbox",
          mode: "markers",
          lat: libLat,
          lon: libLon,
          text: libText,
          hoverinfo: "text",
          marker: {
            size: 9,
            color: "rgba(6, 182, 212, 0.95)",
            opacity: 0.95,
            symbol: "circle",
          },
          name: "Libraries (Tutoring Centers)",
          showlegend: true,
        });
      }
    }

    return traces;
  }, [
    haitianPopData,
    heatGeoJson,
    schoolsData,
    librariesData,
    showHaitianHeat,
    showHaitianBubbles,
    showSchools,
    showLibraries,
    haitianHeatOpacity,
    needScoreMode,
    selectedZcta,
  ]);

  const handlePlotlyClick = useCallback(
    (event: PlotlyClickData) => {
      if (!onSelectZcta || !event.points?.length) return;
      const zcta = event.points[0].location;
      if (zcta) onSelectZcta(String(zcta));
    },
    [onSelectZcta]
  );

  handlePlotlyClickRef.current = handlePlotlyClick;

  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;
    const container = containerRef.current;

    import("plotly.js-dist-min")
      .then((PlotlyModule) => {
        if (!isMounted) return;
        const Plotly = PlotlyModule.default || PlotlyModule;

        const targetCenter =
          selectedBorough && boroughCenters[selectedBorough]
            ? {
                lat: boroughCenters[selectedBorough].lat,
                lon: boroughCenters[selectedBorough].lon,
              }
            : { lat: 40.7128, lon: -74.006 };

        const targetZoom =
          selectedBorough && boroughCenters[selectedBorough]
            ? boroughCenters[selectedBorough].zoom
            : 10;

        const layout = {
          autosize: true,
          margin: { l: 0, r: 0, t: 0, b: 0 },
          showlegend: true,
          legend: {
            x: 0.98,
            y: 0.98,
            xanchor: "right",
            yanchor: "top",
            bgcolor: "rgba(39, 39, 42, 0.95)",
            bordercolor: "#3f3f46",
            borderwidth: 1,
            font: { size: 10, color: "#f4f4f5" },
          },
          mapbox: {
            style: "carto-positron",
            center: targetCenter,
            zoom: targetZoom,
          },
          hovermode: "closest",
        };

        Plotly.react(container, mapData, layout as any, {
          displayModeBar: false,
          responsive: true,
        })
          .then(() => {
            if (!isMounted || !onSelectZcta) return;
            unbindClickRef.current?.();
            unbindClickRef.current = bindPlotlyClick(container, (data) => {
              handlePlotlyClickRef.current(data);
            });
          })
          .catch((e: unknown) => console.error("Plotly render error:", e));
      })
      .catch((err) => console.error("Failed to load plotly.js", err));

    return () => {
      isMounted = false;
      unbindClickRef.current?.();
      unbindClickRef.current = null;
    };
  }, [mapData, selectedBorough, onSelectZcta]);

  useEffect(() => {
    if (!containerRef.current || !selectedZcta || !haitianZctaData) return;

    const feature = haitianZctaData.features.find(
      (f) => String(f.properties?.zcta) === selectedZcta
    );
    const centroid = feature ? getFeatureCentroid(feature) : null;
    if (!centroid) return;

    import("plotly.js-dist-min").then((PlotlyModule) => {
      const Plotly = PlotlyModule.default || PlotlyModule;
      Plotly.relayout(containerRef.current!, {
        "mapbox.center": { lat: centroid.lat, lon: centroid.lon },
        "mapbox.zoom": 12.8,
      } as Record<string, unknown>).catch((e: unknown) =>
        console.error("Plotly fly-to error:", e)
      );
    });
  }, [selectedZcta, haitianZctaData]);

  const mapStatus = useMemo(() => {
    const feature = selectedZcta
      ? haitianZctaData?.features.find((f) => String(f.properties?.zcta) === selectedZcta)
      : null;
    const props = feature?.properties;
    const activeTier = props
      ? tierLabel(getActiveNeedFromProperties(props, needScoreMode).needTier)
      : null;
    const label = props
      ? parseModzctaLabel(String(props.label ?? ""), String(props.borough ?? ""))
      : null;

    return getMapStatusLines({
      selectedZcta,
      selectedLabel: label,
      needScoreMode,
      loadingHaitianZcta,
      activeNeedTier: activeTier,
    });
  }, [selectedZcta, haitianZctaData, needScoreMode, loadingHaitianZcta]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={containerRef} className="absolute inset-0 h-full w-full bg-zinc-950" />

      <div className="pointer-events-none absolute right-3 bottom-3 z-10 max-w-[min(100%-1.5rem,320px)] rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2.5 shadow-xl backdrop-blur-md">
        <p className="text-sm font-semibold text-zinc-100">{mapStatus.title}</p>
        <p className="mt-0.5 text-caption leading-snug text-zinc-400">{mapStatus.body}</p>
        <p className="mt-1.5 text-caption text-zinc-500">{mapStatus.footnote}</p>
      </div>
    </div>
  );
}
