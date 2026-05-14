"use client";

import { fetch311PointSample } from "@/lib/nycApi";
import { emptyFeatureCollection } from "@/lib/geo";
import { useEffect, useMemo, useState, useRef } from "react";
import type { FeatureCollection, Point, LineString } from "geojson";

export type NYCMapCoreProps = {
  /** Your own GeoJSON (points work out of the box with the circle layer). */
  data?: FeatureCollection;
  /** Fetches a small live 311 sample from NYC Open Data on mount. */
  loadDemo311?: boolean;
  /** Optional additional point features (e.g. MTA vehicles). */
  vehicles?: FeatureCollection;
  /** Optional route line feature collection. */
  route?: FeatureCollection;
  className?: string;
};

function formatHoverText(properties: Record<string, unknown> | null) {
  if (!properties) return "";
  const priority = [
    "complaint_type",
    "status",
    "borough",
    "created_date",
    "unique_key",
  ] as const;
  const entries: string[] = [];

  for (const key of priority) {
    const v = properties[key];
    if (v !== undefined && v !== null && String(v).length > 0) {
      entries.push(`<b>${key}</b>: ${v}`);
    }
  }

  const rest = Object.entries(properties)
    .filter(([k]) => !priority.includes(k as (typeof priority)[number]))
    .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    .slice(0, 6)
    .map(([k, v]) => `<b>${k}</b>: ${v}`);

  return [...entries, ...rest].join("<br>");
}

function extractPoints(fc: FeatureCollection) {
  const lat: number[] = [];
  const lon: number[] = [];
  const text: string[] = [];

  for (const f of fc.features) {
    if (f.geometry.type === "Point") {
      const geom = f.geometry as Point;
      lon.push(geom.coordinates[0]);
      lat.push(geom.coordinates[1]);
      text.push(formatHoverText(f.properties as Record<string, unknown>));
    }
  }
  return { lat, lon, text };
}

function extractLines(fc: FeatureCollection) {
  const lat: (number | null)[] = [];
  const lon: (number | null)[] = [];

  for (const f of fc.features) {
    if (f.geometry.type === "LineString") {
      const geom = f.geometry as LineString;
      for (const coord of geom.coordinates) {
        lon.push(coord[0]);
        lat.push(coord[1]);
      }
      lon.push(null);
      lat.push(null);
    }
  }
  return { lat, lon };
}

export default function NYCMapCore({
  data: dataProp,
  loadDemo311 = true,
  vehicles,
  route,
  className,
}: NYCMapCoreProps) {
  const [fc, setFc] = useState<FeatureCollection>(() =>
    dataProp ?? emptyFeatureCollection()
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (dataProp) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFc(dataProp);
      return;
    }
    if (!loadDemo311) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFc(emptyFeatureCollection());
      return;
    }

    let cancelled = false;
    setLoadError(null);

    fetch311PointSample()
      .then((collection) => {
        if (!cancelled) setFc(collection);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load demo data."
          );
          setFc(emptyFeatureCollection());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataProp, loadDemo311]);

  const mapData = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // Main points (311 data or user data)
    if (fc && fc.features.length > 0) {
      const pts = extractPoints(fc);
      traces.push({
        type: "scattermapbox",
        mode: "markers",
        lat: pts.lat,
        lon: pts.lon,
        text: pts.text,
        hoverinfo: "text",
        marker: {
          color: "#1d4ed8",
          size: 8,
          opacity: 0.88,
        },
        name: "Data Points",
      });
    }

    // Vehicle points
    if (vehicles && vehicles.features.length > 0) {
      const vpts = extractPoints(vehicles);
      traces.push({
        type: "scattermapbox",
        mode: "markers",
        lat: vpts.lat,
        lon: vpts.lon,
        text: vpts.text,
        hoverinfo: "text",
        marker: {
          color: "#dc2626",
          size: 10,
          opacity: 0.92,
        },
        name: "Vehicles",
      });
    }

    // Route lines
    if (route && route.features.length > 0) {
      const lines = extractLines(route);
      traces.push({
        type: "scattermapbox",
        mode: "lines",
        lat: lines.lat,
        lon: lines.lon,
        line: {
          color: "#16a34a",
          width: 4,
        },
        name: "Route",
        hoverinfo: "none",
      });
    }

    return traces;
  }, [fc, vehicles, route]);

  const featureCount = fc.features.length;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;

    // Dynamically load Plotly
    import("plotly.js-dist-min").then((PlotlyModule) => {
      if (!isMounted) return;
      const Plotly = PlotlyModule.default || PlotlyModule;

      const layout = {
        autosize: true,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        showlegend: false,
        mapbox: {
          style: "carto-positron",
          center: { lat: 40.7128, lon: -74.006 },
          zoom: 10,
        },
        hovermode: "closest",
      };

      const config = { displayModeBar: false, responsive: true };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Plotly.newPlot(containerRef.current!, mapData, layout as any, config).catch((e: unknown) => console.error("Plotly render error:", e));
    }).catch(err => console.error("Failed to load plotly.js", err));

    return () => {
      isMounted = false;
      if (containerRef.current) {
        import("plotly.js-dist-min").then((PlotlyModule) => {
          const Plotly = PlotlyModule.default || PlotlyModule;
          Plotly.purge(containerRef.current!);
        });
      }
    };
  }, [mapData]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute right-3 top-3 z-10 max-w-[min(100%-1.5rem,320px)] rounded-lg border border-zinc-200/80 bg-white/95 px-3 py-2 text-xs text-zinc-700 shadow-sm backdrop-blur-sm">
        <p className="font-semibold text-zinc-900">NYC Map (Plotly)</p>
        <p className="mt-0.5 leading-snug">
          {featureCount === 0
            ? "No features loaded — pass GeoJSON via the map component or enable the 311 demo."
            : `${featureCount.toLocaleString()} point${featureCount === 1 ? "" : "s"} on the map.`}
        </p>
        {loadError && (
          <p className="mt-1 font-medium text-red-700">Demo load: {loadError}</p>
        )}
      </div>
    </div>
  );
}
