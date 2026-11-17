"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Feature, FeatureCollection, Point, Position } from "geojson";
import { HAITIAN_COLORSCALE, getActiveNeedFromProperties, tierLabel, type NeedScoreMode } from "@/lib/haitianNeed";
import { parseModzctaLabel } from "@/lib/format";
import {
  buildLibraryHoverText,
  buildRegionHoverText,
  buildSchoolHoverText,
  buildZctaHoverText,
  getMapStatusLines,
} from "@/lib/mapHoverText";
import { getRegionCenter, type MetroConfig } from "@/lib/metroRegistry";
import { boundsOf, fitView } from "@/lib/mapFit";
import { BASEMAP_ATTRIBUTION, BASEMAP_STYLE_URL } from "@/lib/basemap";

/** ZIPs and places an ask-the-map answer wants shown. */
export type AskHighlight = {
  zips: string[];
  places: { id: string; name: string; kind: "library" | "school"; lat: number; lon: number }[];
};

/** Width of the floating sidebar that covers the map's left edge (w-[360px] + left-4 + gap). */
const SIDEBAR_OVERLAP_PX = 392;

export type NYCMapCoreProps = {
  metro: MetroConfig;
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
  askHighlight?: AskHighlight | null;
  className?: string;
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
  metro,
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
  askHighlight = null,
  className,
}: NYCMapCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const unbindClickRef = useRef<(() => void) | null>(null);
  const handlePlotlyClickRef = useRef<(data: PlotlyClickData) => void>(() => {});

  const regionPropertyKey = metro.ui.regionPropertyKey;
  const regionCenters = useMemo(
    () =>
      Object.fromEntries(
        metro.regions.map((region) => [region.name, region.center])
      ) as Record<string, { lat: number; lon: number; zoom: number }>,
    [metro.regions]
  );

  const filteredZctaFeatures = useMemo(() => {
    if (!haitianZctaData?.features.length) return [];
    if (!selectedBorough) return haitianZctaData.features;
    return haitianZctaData.features.filter(
      (f) => f.properties?.[regionPropertyKey] === selectedBorough
    );
  }, [haitianZctaData, regionPropertyKey, selectedBorough]);

  const heatGeoJson = useMemo((): FeatureCollection | undefined => {
    if (!filteredZctaFeatures.length) return undefined;
    return { type: "FeatureCollection", features: filteredZctaFeatures };
  }, [filteredZctaFeatures]);

  const highlightSet = useMemo(
    () => (askHighlight?.zips.length ? new Set(askHighlight.zips) : null),
    [askHighlight]
  );

  const mapData = useMemo(() => {
    const traces: any[] = [
      {
        type: "scattermap",
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
        type: "choroplethmap",
        geojson: heatGeoJson,
        featureidkey: "properties.zcta",
        locations,
        z: zValues,
        zmin: 0,
        zmax: 1,
        colorscale: applyOpacityToColorscale(HAITIAN_COLORSCALE, haitianHeatOpacity),
        marker: {
          line: { width: 0.6, color: "rgba(39, 39, 42, 0.7)" },
          opacity: highlightSet ? 0.22 : 1,
        },
        showscale: false,
        hoverinfo: "text",
        text: hoverText,
        name: needScoreMode === "education" ? "Educational Need (ZIP)" : "Haitian Pop Heat (ZIP)",
        showlegend: true,
      });

      if (highlightSet) {
        const answerFeatures = heatGeoJson.features.filter((f) =>
          highlightSet.has(String(f.properties?.zcta))
        );
        if (answerFeatures.length) {
          traces.push({
            type: "choroplethmap",
            geojson: { type: "FeatureCollection", features: answerFeatures },
            featureidkey: "properties.zcta",
            locations: answerFeatures.map((f) => String(f.properties?.zcta)),
            z: answerFeatures.map((f) => getActiveNeedFromProperties(f.properties ?? {}, needScoreMode).colorValue),
            zmin: 0,
            zmax: 1,
            colorscale: applyOpacityToColorscale(HAITIAN_COLORSCALE, Math.max(haitianHeatOpacity, 0.9)),
            marker: { line: { width: 2.2, color: "rgba(103, 232, 249, 0.95)" } },
            showscale: false,
            hoverinfo: "text",
            text: answerFeatures.map((f) => buildZctaHoverText(f.properties ?? {}, needScoreMode)),
            name: "ZIPs in answer",
            showlegend: true,
          });
        }
      }

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
            type: "choroplethmap",
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

      const bubbleCenters = regionCenters;

      haitianPopData.forEach((item) => {
        const regionName = String(item.boroughName ?? item.countyName ?? "");
        const center = bubbleCenters[regionName];
        if (center) {
          bubbleLat.push(center.lat);
          bubbleLon.push(center.lon);
          const size = 15 + Math.sqrt(item.haitianPop) * 0.18;
          bubbleSizes.push(size);
          bubbleText.push(
            buildRegionHoverText({
              regionName,
              haitianPop: item.haitianPop,
              speakers: item.speakers,
              limitedEnglish: item.limitedEnglish,
              pctNoInternet: item.pctNoInternet,
              pctNoHS: item.pctNoHS,
            })
          );
        }
      });

      if (bubbleLat.length > 0) {
        traces.push({
          type: "scattermap",
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
          name: metro.ui.regionBubblesLabel,
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
          type: "scattermap",
          mode: "markers",
          lat: schoolLat,
          lon: schoolLon,
          text: schoolText,
          hoverinfo: "text",
          marker: { size: 8, color: schoolColors, opacity: 0.95 },
          name: metro.overlays.schools.hasPerformanceMetrics ? "High Schools" : "Public Schools",
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
          type: "scattermap",
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
          name: "Libraries",
          showlegend: true,
        });
      }
    }

    if (askHighlight?.places.length) {
      const lat = askHighlight.places.map((p) => p.lat);
      const lon = askHighlight.places.map((p) => p.lon);
      const text = askHighlight.places.map((p) => `<b>${p.name}</b><br>${p.kind === "library" ? "Library" : "School"} in answer`);
      traces.push({
        type: "scattermap",
        mode: "markers",
        lat,
        lon,
        hoverinfo: "skip",
        marker: { size: 26, color: "rgba(255, 255, 255, 0.35)" },
        showlegend: false,
      });
      traces.push({
        type: "scattermap",
        mode: "markers",
        lat,
        lon,
        text,
        hoverinfo: "text",
        marker: { size: 13, color: "rgba(250, 204, 21, 0.95)" },
        name: "Places in answer",
        showlegend: true,
      });
    }

    return traces;
  }, [
    metro,
    regionCenters,
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
    highlightSet,
    askHighlight,
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

        const mapView = getRegionCenter(metro, selectedBorough);
        const targetCenter = { lat: mapView.lat, lon: mapView.lon };
        const targetZoom = mapView.zoom;

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
          map: {
            style: BASEMAP_STYLE_URL,
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
  }, [mapData, metro.id, selectedBorough, onSelectZcta]);

  /** Moves the map so `features` and `points` fit the area not covered by the sidebar. */
  const fitTo = useCallback(
    (features: Feature[], points: Position[] = [], maxZoom = 13) => {
      const container = containerRef.current;
      const bounds = boundsOf(features, points);
      if (!container || !bounds) return;
      const width = container.clientWidth;
      const overlap = width > 900 ? SIDEBAR_OVERLAP_PX : 0;
      const view = fitView(bounds, width - overlap, container.clientHeight, 0.25, 8, maxZoom);
      // Shift the centre west by half the covered strip so the target sits in the visible area.
      const degPerPx = 360 / (512 * 2 ** view.zoom);
      const center = { lat: view.lat, lon: view.lon - (overlap / 2) * degPerPx };
      import("plotly.js-dist-min").then((PlotlyModule) => {
        const Plotly = PlotlyModule.default || PlotlyModule;
        Plotly.relayout(container, {
          "map.center": center,
          "map.zoom": view.zoom,
        } as Record<string, unknown>).catch((e: unknown) => console.error("Plotly fit error:", e));
      });
    },
    []
  );

  // Selecting a ZIP fits its outline (a fixed zoom on its centre filled the screen for large ZIPs).
  useEffect(() => {
    if (!selectedZcta || !haitianZctaData) return;
    const feature = haitianZctaData.features.find((f) => String(f.properties?.zcta) === selectedZcta);
    if (feature) fitTo([feature], [], 13.5);
  }, [selectedZcta, haitianZctaData, fitTo]);

  // Fit the view to an answer's ZIPs and places.
  useEffect(() => {
    if (!askHighlight || !haitianZctaData) return;
    const zipSet = new Set(askHighlight.zips);
    const features = haitianZctaData.features.filter((f) => zipSet.has(String(f.properties?.zcta)));
    fitTo(features, askHighlight.places.map((p) => [p.lon, p.lat]));
  }, [askHighlight, haitianZctaData, fitTo]);

  const mapStatus = useMemo(() => {
    const feature = selectedZcta
      ? haitianZctaData?.features.find((f) => String(f.properties?.zcta) === selectedZcta)
      : null;
    const props = feature?.properties;
    const activeTier = props
      ? tierLabel(getActiveNeedFromProperties(props, needScoreMode).needTier)
      : null;
    const regionName = String(props?.[regionPropertyKey] ?? props?.borough ?? "");
    const label = props
      ? parseModzctaLabel(String(props.label ?? ""), regionName)
      : null;

    if (askHighlight && (askHighlight.zips.length || askHighlight.places.length)) {
      const n = askHighlight.zips.length;
      const m = askHighlight.places.length;
      return {
        title: "Showing your answer",
        body: [
          n ? `${n} ${n === 1 ? "ZIP" : "ZIPs"} outlined in cyan` : "",
          m ? `${m} ${m === 1 ? "place" : "places"} marked in yellow` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        footnote: "Clear the map from the Ask tab. Other ZIPs are dimmed.",
      };
    }

    return getMapStatusLines({
      selectedZcta,
      selectedLabel: label,
      needScoreMode,
      loadingHaitianZcta,
      activeNeedTier: activeTier,
      metroLabel: metro.label,
      boundaryFootnote: metro.ui.boundaryFootnote,
    });
  }, [
    selectedZcta,
    haitianZctaData,
    needScoreMode,
    loadingHaitianZcta,
    metro,
    regionPropertyKey,
    askHighlight,
  ]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={containerRef} className="absolute inset-0 h-full w-full bg-zinc-950" />

      <div className="pointer-events-none absolute right-3 bottom-3 z-10 max-w-[min(100%-1.5rem,320px)] rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2.5 shadow-xl backdrop-blur-md">
        <p className="text-sm font-semibold text-zinc-100">{mapStatus.title}</p>
        <p className="mt-0.5 text-caption leading-snug text-zinc-400">{mapStatus.body}</p>
        <p className="mt-1.5 text-caption text-zinc-500">{mapStatus.footnote}</p>
      </div>

      <p className="pointer-events-none absolute bottom-0 left-1/2 z-10 -translate-x-1/2 rounded-t bg-white/80 px-1.5 py-0.5 text-[10px] text-zinc-600">
        {BASEMAP_ATTRIBUTION}
      </p>
    </div>
  );
}
