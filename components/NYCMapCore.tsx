"use client";

import { useEffect, useMemo, useRef } from "react";
import type { FeatureCollection, Point } from "geojson";

export type NYCMapCoreProps = {
  haitianPopData?: any[];
  schoolsData?: FeatureCollection;
  librariesData?: FeatureCollection;
  showHaitianBubbles?: boolean;
  showSchools?: boolean;
  showLibraries?: boolean;
  selectedBorough?: string | null;
  className?: string;
};

const boroughCenters: Record<string, { lat: number; lon: number; zoom: number }> = {
  "Brooklyn": { lat: 40.6501, lon: -73.9496, zoom: 11.2 },
  "Queens": { lat: 40.7282, lon: -73.7949, zoom: 11.2 },
  "Manhattan": { lat: 40.7831, lon: -73.9712, zoom: 11.8 },
  "Bronx": { lat: 40.8448, lon: -73.8648, zoom: 11.8 },
  "Staten Island": { lat: 40.5795, lon: -74.1502, zoom: 11.2 }
};

export default function NYCMapCore({
  haitianPopData = [],
  schoolsData,
  librariesData,
  showHaitianBubbles = true,
  showSchools = true,
  showLibraries = true,
  selectedBorough = null,
  className,
}: NYCMapCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mapData = useMemo(() => {
    // Standard dummy trace to ensure Plotly initializes even with zero data
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

    // 1. Haitian population bubbles at borough centroids
    if (showHaitianBubbles && haitianPopData && haitianPopData.length > 0) {
      const bubbleLat: number[] = [];
      const bubbleLon: number[] = [];
      const bubbleSizes: number[] = [];
      const bubbleText: string[] = [];

      const boroCenters: Record<string, { lat: number; lon: number }> = {
        "Brooklyn": { lat: 40.6501, lon: -73.9496 },
        "Queens": { lat: 40.7282, lon: -73.7949 },
        "Manhattan": { lat: 40.7831, lon: -73.9712 },
        "Bronx": { lat: 40.8448, lon: -73.8648 },
        "Staten Island": { lat: 40.5795, lon: -74.1502 }
      };

      haitianPopData.forEach((item) => {
        const center = boroCenters[item.boroughName];
        if (center) {
          bubbleLat.push(center.lat);
          bubbleLon.push(center.lon);
          
          // Bubble size scales visually based on population
          const size = 15 + Math.sqrt(item.haitianPop) * 0.18;
          bubbleSizes.push(size);
          
          bubbleText.push(
            `<b>${item.boroughName} Demographics</b><br>` +
            `• Haitian Ancestry: <b>${item.haitianPop.toLocaleString()}</b><br>` +
            `• French/Haitian Speakers: <b>${item.speakers.toLocaleString()}</b><br>` +
            `• Limited English Speakers: <b>${item.limitedEnglish.toLocaleString()}</b><br>` +
            `• Internet Deficit: <b>${item.pctNoInternet.toFixed(1)}%</b> households<br>` +
            `• Low Literacy (No HS Diploma): <b>${item.pctNoHS.toFixed(1)}%</b> adults`
          );
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
            color: "rgba(249, 115, 22, 0.45)", // Warm transparent Amber
            line: {
              color: "rgba(234, 88, 12, 0.9)", // Deep orange stroke
              width: 2.5
            }
          },
          name: "Haitian Population Density",
          showlegend: true
        });
      }
    }

    // 2. NYC High Schools color-coded by graduation rate
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
          const attendance = parseFloat(props.attendance_rate) || 0;
          const safety = parseFloat(props.pct_stu_safe) || 0;
          
          let color = "rgba(156, 163, 175, 0.8)"; // Neutral grey for missing rates
          if (props.graduation_rate !== undefined && props.graduation_rate !== null) {
            if (gradRate < 0.60) {
              color = "rgba(239, 68, 68, 0.9)"; // Red: high support need
            } else if (gradRate >= 0.60 && gradRate < 0.80) {
              color = "rgba(245, 158, 11, 0.9)"; // Amber: medium need
            } else {
              color = "rgba(16, 185, 129, 0.9)"; // Emerald Green: stable / high support
            }
          }
          schoolColors.push(color);

          const gradPercent = props.graduation_rate ? `${Math.round(gradRate * 100)}%` : "N/A";
          const safetyPercent = props.pct_stu_safe ? `${Math.round(safety * 100)}%` : "N/A";
          const attendancePercent = props.attendance_rate ? `${Math.round(attendance * 100)}%` : "N/A";
          const ellDesc = props.ell_programs || "None reported";

          schoolText.push(
            `<b>${props.school_name}</b> (${props.dbn})<br>` +
            `• Neighborhood: <b>${props.neighborhood || "N/A"}</b><br>` +
            `• Graduation Rate: <span style="color:${gradRate < 0.60 ? '#ef4444' : gradRate < 0.80 ? '#f59e0b' : '#10b981'}"><b>${gradPercent}</b></span><br>` +
            `• Student Safety: <b>${safetyPercent}</b><br>` +
            `• Attendance Rate: <b>${attendancePercent}</b><br>` +
            `• ESL / ELL Programs: <b>${ellDesc}</b>`
          );
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
          marker: {
            size: 8,
            color: schoolColors,
            opacity: 0.95
          },
          name: "High Schools",
          showlegend: true
        });
      }
    }

    // 3. Public libraries (tutoring hubs)
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
          
          libText.push(
            `<b>${props.name} Library</b> (${props.system} System)<br>` +
            `• Address: <b>${props.streetAddress}, ${props.city}</b><br>` +
            `<i>Provides free after-school academic support and literacy tutoring.</i>`
          );
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
            color: "rgba(6, 182, 212, 0.95)", // Cyan representing free resources
            opacity: 0.95,
            symbol: "circle"
          },
          name: "Libraries (Tutoring Centers)",
          showlegend: true
        });
      }
    }

    return traces;
  }, [haitianPopData, schoolsData, librariesData, showHaitianBubbles, showSchools, showLibraries]);

  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;

    // Dynamically load Plotly to prevent SSR issues
    import("plotly.js-dist-min").then((PlotlyModule) => {
      if (!isMounted) return;
      const Plotly = PlotlyModule.default || PlotlyModule;

      const targetCenter = selectedBorough && boroughCenters[selectedBorough]
        ? { lat: boroughCenters[selectedBorough].lat, lon: boroughCenters[selectedBorough].lon }
        : { lat: 40.7128, lon: -74.006 };
      
      const targetZoom = selectedBorough && boroughCenters[selectedBorough]
        ? boroughCenters[selectedBorough].zoom
        : 10;

      const layout = {
        autosize: true,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        showlegend: true,
        legend: {
          x: 0.98,
          y: 0.98,
          xanchor: 'right',
          yanchor: 'top',
          bgcolor: 'rgba(39, 39, 42, 0.95)', // Premium dark grey background for overlay
          bordercolor: '#3f3f46',
          borderwidth: 1,
          font: { size: 10, color: '#f4f4f5' }
        },
        mapbox: {
          style: "carto-positron",
          center: targetCenter,
          zoom: targetZoom,
        },
        hovermode: "closest",
      };

      const config = { displayModeBar: false, responsive: true };

      Plotly.react(containerRef.current!, mapData, layout as any, config).catch((e: unknown) =>
        console.error("Plotly render error:", e)
      );
    }).catch((err) => console.error("Failed to load plotly.js", err));

    return () => {
      isMounted = false;
    };
  }, [mapData, selectedBorough]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={containerRef} className="absolute inset-0 h-full w-full bg-zinc-950" />
      
      {/* Dynamic Map Status Card */}
      <div className="pointer-events-none absolute right-3 bottom-3 z-10 max-w-[min(100%-1.5rem,320px)] rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs text-zinc-300 shadow-xl backdrop-blur-md">
        <p className="font-semibold text-zinc-100">Haitian Educational Equity Map</p>
        <p className="mt-0.5 leading-snug text-zinc-400">
          Visualizing resource overlap to uncover tutoring deserts and high-need school corridors.
        </p>
      </div>
    </div>
  );
}
