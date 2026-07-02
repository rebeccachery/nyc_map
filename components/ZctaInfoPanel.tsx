"use client";

import { useMemo, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import { getFeatureCentroid } from "@/lib/geo";
import {
  formatCount,
  formatDistance,
  formatLepPct,
  formatPct,
  formatScore,
  parseModzctaLabel,
} from "@/lib/format";
import {
  getActiveNeedFromProperties,
  type NeedScoreMode,
  type NeedTier,
} from "@/lib/haitianNeed";
import MetricBar from "@/components/ui/MetricBar";
import NeedBadge from "@/components/ui/NeedBadge";
import SectionHeader from "@/components/ui/SectionHeader";
import StatBlock from "@/components/ui/StatBlock";
import StatRow from "@/components/ui/StatRow";

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
};

type ZctaInfoPanelProps = {
  zctaData?: FeatureCollection;
  selectedZcta: string | null;
  needScoreMode: NeedScoreMode;
  onClearSelection: () => void;
  schoolsData?: FeatureCollection;
  librariesData?: FeatureCollection;
};

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

  const zipLabel = useMemo(() => {
    if (!selected) return null;
    return parseModzctaLabel(selected.label ?? selected.zcta, selected.borough);
  }, [selected]);

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
      <div
        className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-4 text-center"
        aria-live="polite"
      >
        <SectionHeader
          title="Neighborhood details"
          caption="Click a ZIP code on the map or use the search box to view population stats, need level, and nearby resources."
        />
      </div>
    );
  }

  if (!selected || !activeNeed || !zipLabel) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 p-4">
        <p className="text-label">ZIP {selectedZcta}</p>
        <p className="mt-1 text-caption">No Census data available for this ZIP code.</p>
        <button
          type="button"
          onClick={onClearSelection}
          className="mt-3 text-xs font-medium text-orange-400 hover:text-orange-300"
        >
          Clear selection
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-orange-500/25 bg-gradient-to-br from-orange-500/5 to-amber-500/5 p-4 shadow-lg"
      aria-live="polite"
      aria-label={`Details for ZIP ${selected.zcta}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-section-title text-orange-400">{zipLabel.display}</p>
          {zipLabel.subtitle && (
            <p className="mt-0.5 text-caption text-zinc-400">{zipLabel.subtitle}</p>
          )}
          <p className="mt-1 text-xs font-medium text-orange-300/90">
            {formatPct(selected.haitianPopPct)} Haitian ancestry
          </p>
        </div>
        <NeedBadge tier={activeNeed.needTier} />
      </div>

      {needScoreMode === "education" && (
        <div className="mt-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
          <p className="text-label">Educational need score</p>
          <p className="text-value text-amber-400">
            {formatScore(activeNeed.scoreValue)}
            <span className="text-sm font-normal text-zinc-500"> / 100</span>
          </p>
          <p className="text-caption">
            Weighted: population, internet access, and education level
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4">
        <StatBlock
          label="Haitian ancestry"
          value={formatCount(selected.haitianPop)}
          subtext={`${formatPct(selected.haitianPopPct)} of residents`}
          subtextClassName="text-caption text-orange-400/90"
        />
        <StatBlock
          label="Creole speakers"
          value={formatCount(selected.speakers)}
          subtext={formatLepPct(selected.limitedEnglish, selected.speakers)}
        />
      </div>

      <div className="mt-4 space-y-3 border-t border-zinc-800/60 pt-3">
        <MetricBar
          label="Households without internet"
          value={selected.pctNoInternet}
          barClassName="bg-red-500"
          valueClassName="font-bold text-red-400"
        />
        <MetricBar
          label="Adults without HS diploma"
          value={selected.pctNoHS}
          barClassName="bg-orange-500"
          valueClassName="font-bold text-orange-400"
        />
      </div>

      <div className="mt-4 border-t border-zinc-800/60 pt-3">
        <p className="text-section-title">Nearby resources</p>
        <div className="mt-2 space-y-2">
          <StatRow
            label="High schools in ZIP"
            value={String(nearby.schools)}
          />
          {nearby.nearestLibrary && (
            <StatRow
              label="Nearest library"
              value={`${nearby.nearestLibrary}${nearby.nearestDist != null ? ` · ${formatDistance(nearby.nearestDist)}` : ""}`}
              valueClassName="max-w-[58%] truncate text-right font-semibold text-cyan-400"
            />
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onClearSelection}
        className="mt-4 w-full rounded-lg border border-zinc-700/80 bg-zinc-900/50 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
      >
        Clear selection
      </button>
    </div>
  );
}
