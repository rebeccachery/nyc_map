"use client";

import { useMemo } from "react";
import type { FeatureCollection, Point } from "geojson";
import { getFeatureCentroid } from "@/lib/geo";
import {
  formatPct,
  formatScore,
  getActiveNeedFromProperties,
  tierLabel,
  type NeedScoreMode,
  type NeedTier,
} from "@/lib/haitianNeed";

export type ZctaProperties = {
  zcta: string;
  label?: string;
  borough?: string;
  haitianPop: number;
  totalPop: number;
  haitianPopPct: number;
  speakers: number;
  limitedEnglish: number;
  pctNoInternet: number;
  pctNoHS: number;
  educationNeedScore?: number;
  populationNeedTier?: NeedTier;
  educationNeedTier?: NeedTier;
  needTier?: NeedTier;
};

type ZctaInfoPanelProps = {
  zctaData?: FeatureCollection;
  selectedZcta: string | null;
  needScoreMode: NeedScoreMode;
  onClearSelection: () => void;
  schoolsData?: FeatureCollection;
  librariesData?: FeatureCollection;
};

function tierBadgeClass(tier: NeedTier): string {
  switch (tier) {
    case "high":
      return "bg-orange-600/90 text-orange-50";
    case "medium":
      return "bg-amber-500/90 text-amber-950";
    case "low":
      return "bg-zinc-600/90 text-zinc-100";
    case "insufficient_data":
      return "bg-zinc-700/80 text-zinc-300";
  }
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ZctaInfoPanel({
  zctaData,
  selectedZcta,
  needScoreMode,
  onClearSelection,
  schoolsData,
  librariesData,
}: ZctaInfoPanelProps) {
  const selected = useMemo(() => {
    if (!selectedZcta || !zctaData) return null;
    const feature = zctaData.features.find(
      (f) => String(f.properties?.zcta) === selectedZcta
    );
    if (!feature?.properties) return null;
    return feature.properties as ZctaProperties;
  }, [selectedZcta, zctaData]);

  const activeNeed = useMemo(() => {
    if (!selected) return null;
    return getActiveNeedFromProperties(selected as Record<string, unknown>, needScoreMode);
  }, [selected, needScoreMode]);

  const nearby = useMemo(() => {
    if (!selectedZcta || !zctaData) {
      return {
        schools: 0,
        nearestLibrary: null as string | null,
        nearestDist: null as number | null,
      };
    }

    const feature = zctaData.features.find(
      (f) => String(f.properties?.zcta) === selectedZcta
    );
    const centroid = feature ? getFeatureCentroid(feature) : null;
    if (!centroid) {
      return { schools: 0, nearestLibrary: null, nearestDist: null };
    }

    let schools = 0;
    schoolsData?.features.forEach((f) => {
      if (f.geometry.type !== "Point") return;
      const zip = String(f.properties?.zip ?? "");
      if (zip.startsWith(selectedZcta.slice(0, 5)) || zip === selectedZcta) schools += 1;
    });

    let nearestLibrary: string | null = null;
    let nearestDist = Infinity;
    librariesData?.features.forEach((f) => {
      if (f.geometry.type !== "Point") return;
      const coords = (f.geometry as Point).coordinates;
      const dist = haversineMiles(centroid.lat, centroid.lon, coords[1], coords[0]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestLibrary = String(f.properties?.name ?? "Library");
      }
    });

    return {
      schools,
      nearestLibrary,
      nearestDist: nearestLibrary ? nearestDist : null,
    };
  }, [selectedZcta, zctaData, schoolsData, librariesData]);

  if (!selectedZcta) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-3.5 text-center">
        <p className="text-xs font-medium text-zinc-400">Neighborhood Details</p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          Click a ZIP on the map or search below to see Haitian population stats and need level.
        </p>
      </div>
    );
  }

  if (!selected || !activeNeed) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/20 p-3.5">
        <p className="text-xs text-zinc-400">ZIP {selectedZcta} — no data available.</p>
        <button
          type="button"
          onClick={onClearSelection}
          className="mt-2 text-[10px] text-orange-400 hover:text-orange-300"
        >
          Clear selection
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-orange-500/25 bg-gradient-to-br from-orange-500/5 to-amber-500/5 p-3.5 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
            ZIP {selected.zcta}
          </p>
          <p className="text-xs text-zinc-400">
            {selected.label || selected.borough || "NYC"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tierBadgeClass(activeNeed.needTier)}`}
        >
          {tierLabel(activeNeed.needTier)}
        </span>
      </div>

      {needScoreMode === "education" && (
        <div className="mt-2 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-2.5 py-1.5">
          <p className="text-[10px] text-zinc-500">Educational Need Score</p>
          <p className="text-sm font-bold text-amber-400">
            {formatScore(activeNeed.scoreValue)} / 100
          </p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-zinc-500">Haitian Ancestry</p>
          <p className="text-base font-black text-zinc-100">
            {selected.haitianPop.toLocaleString()}
          </p>
          <p className="text-[10px] text-orange-400">{formatPct(selected.haitianPopPct)} of pop.</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500">Creole Speakers</p>
          <p className="text-base font-black text-zinc-100">
            {selected.speakers.toLocaleString()}
          </p>
          <p className="text-[10px] text-zinc-500">
            {selected.speakers > 0
              ? `${((selected.limitedEnglish / selected.speakers) * 100).toFixed(0)}% LEP`
              : "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2 border-t border-zinc-800/60 pt-2.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-zinc-400">No internet subscription</span>
          <span className="font-semibold text-red-400">{formatPct(selected.pctNoInternet)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">No HS diploma (25+)</span>
          <span className="font-semibold text-orange-400">{formatPct(selected.pctNoHS)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">High schools in ZIP</span>
          <span className="font-semibold text-zinc-200">{nearby.schools}</span>
        </div>
        {nearby.nearestLibrary && (
          <div className="flex justify-between">
            <span className="text-zinc-400">Nearest library</span>
            <span className="max-w-[55%] truncate text-right font-semibold text-cyan-400">
              {nearby.nearestLibrary}
              {nearby.nearestDist != null && ` (${nearby.nearestDist.toFixed(1)} mi)`}
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClearSelection}
        className="mt-3 w-full rounded-lg border border-zinc-700/80 bg-zinc-900/50 py-1.5 text-[10px] font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
      >
        Clear selection
      </button>
    </div>
  );
}
