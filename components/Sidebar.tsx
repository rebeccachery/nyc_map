"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeatureCollection } from "geojson";
import BoroughStatsCard, { CitywideSummary } from "@/components/BoroughStatsCard";
import HeatLegend from "@/components/HeatLegend";
import ZctaInfoPanel from "@/components/ZctaInfoPanel";
import SectionHeader from "@/components/ui/SectionHeader";
import { formatLayerErrorLabel } from "@/lib/format";
import type { HaitianZctaApiResponse, LayerErrors } from "@/lib/haitianZctaTypes";
import type { NeedScoreMode } from "@/lib/haitianNeed";
import type { MetroConfig } from "@/lib/metroRegistry";

export type SidebarFilters = {
  showHaitianHeat: boolean;
  showHaitianBubbles: boolean;
  showSchools: boolean;
  showLibraries: boolean;
  haitianHeatOpacity: number;
  needScoreMode: NeedScoreMode;
};

export type SidebarProps = {
  metro: MetroConfig;
  filters: SidebarFilters;
  onChangeFilters: (next: SidebarFilters) => void;
  haitianPopData: any[];
  haitianZctaData?: FeatureCollection;
  haitianZctaStats?: HaitianZctaApiResponse["stats"];
  schoolsData?: FeatureCollection;
  librariesData?: FeatureCollection;
  selectedBorough: string | null;
  onChangeSelectedBorough: (boro: string | null) => void;
  selectedZcta: string | null;
  onSelectZcta: (zcta: string | null) => void;
  loadingDemographics?: boolean;
  loadingHaitianZcta?: boolean;
  loadingSchools?: boolean;
  loadingLibraries?: boolean;
  errors?: LayerErrors;
};

type SidebarTab = "explore" | "layers";

export default function Sidebar({
  metro,
  filters,
  onChangeFilters,
  haitianPopData,
  haitianZctaData,
  haitianZctaStats,
  schoolsData,
  librariesData,
  selectedBorough,
  onChangeSelectedBorough,
  selectedZcta,
  onSelectZcta,
  loadingDemographics = false,
  loadingHaitianZcta = false,
  loadingSchools = false,
  loadingLibraries = false,
  errors = {},
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>("explore");
  const [zipSearch, setZipSearch] = useState("");
  const [zipSearchError, setZipSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedZcta) setZipSearch(selectedZcta);
  }, [selectedZcta]);

  const demographicsNameKey = metro.ui.demographicsNameKey;

  const selectedData = useMemo(() => {
    if (!selectedBorough || !haitianPopData) return null;
    return (
      haitianPopData.find((d) => d[demographicsNameKey] === selectedBorough) || null
    );
  }, [demographicsNameKey, haitianPopData, selectedBorough]);

  const citywideTotals = useMemo(() => {
    if (!haitianPopData || haitianPopData.length === 0) return null;
    let pop = 0;
    let speakers = 0;
    let limited = 0;
    let netDeficitSum = 0;
    let litProxySum = 0;

    haitianPopData.forEach((d) => {
      pop += d.haitianPop;
      speakers += d.speakers;
      limited += d.limitedEnglish;
      netDeficitSum += d.pctNoInternet;
      litProxySum += d.pctNoHS;
    });

    return {
      haitianPop: pop,
      speakers,
      limitedEnglish: limited,
      pctNoInternet: netDeficitSum / haitianPopData.length,
      pctNoHS: litProxySum / haitianPopData.length,
    };
  }, [haitianPopData]);

  const displayData = selectedData || citywideTotals;
  const boroughScopeLabel = selectedBorough
    ? `${selectedBorough} overview`
    : metro.ui.scopeOverviewLabel;

  const isLoading =
    loadingDemographics || loadingHaitianZcta || loadingSchools || loadingLibraries;

  const handleZipSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setZipSearchError(null);
    const normalized = zipSearch.trim().padStart(5, "0");
    if (normalized.length !== 5) {
      setZipSearchError(metro.ui.zipSearchErrorInvalid);
      return;
    }
    const exists = haitianZctaData?.features.some(
      (f) => String(f.properties?.zcta) === normalized
    );
    if (exists) {
      onSelectZcta(normalized);
      setTab("explore");
    } else {
      setZipSearchError(metro.ui.zipSearchErrorNotFound);
    }
  };

  return (
    <aside className="absolute left-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-[360px] max-w-[calc(100%-2rem)] flex-col overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 text-zinc-100 shadow-2xl backdrop-blur-xl scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
      {metro.status === "coming_soon" && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {metro.label} map data is coming soon. Layer controls will activate when data is available.
        </div>
      )}

      {Object.keys(errors).length > 0 && (
        <div className="mt-3 space-y-1.5" role="alert">
          {Object.entries(errors).map(([layer, message]) => (
            <div
              key={layer}
              className="rounded-lg border border-red-950/60 bg-red-950/20 px-3 py-2 text-xs text-red-400"
            >
              <span className="font-semibold">
                {formatLayerErrorLabel(layer as keyof LayerErrors)} unavailable.
              </span>{" "}
              {message}
            </div>
          ))}
        </div>
      )}

      <div
        className="mt-4 flex rounded-xl border border-zinc-800 bg-zinc-900/50 p-1"
        role="tablist"
        aria-label="Sidebar sections"
      >
        {(
          [
            ["explore", "Explore"],
            ["layers", "Layers"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
              tab === id
                ? "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "explore" && (
        <div className="mt-4 space-y-4" role="tabpanel">
          <form onSubmit={handleZipSearch}>
            <label htmlFor="zip-search" className="text-section-title">
              Search ZIP code
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="zip-search"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{5}"
                maxLength={5}
                placeholder={metro.ui.zipPlaceholder}
                value={zipSearch}
                onChange={(e) => {
                  setZipSearch(e.target.value.replace(/\D/g, ""));
                  setZipSearchError(null);
                }}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
              />
              <button
                type="submit"
                className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-400 transition hover:bg-orange-500/20"
              >
                Go
              </button>
            </div>
            {zipSearchError && (
              <p className="mt-1.5 text-caption text-red-400" role="status">
                {zipSearchError}
              </p>
            )}
          </form>

          <ZctaInfoPanel
            zctaData={haitianZctaData}
            selectedZcta={selectedZcta}
            needScoreMode={filters.needScoreMode}
            onClearSelection={() => onSelectZcta(null)}
            schoolsData={schoolsData}
            librariesData={librariesData}
          />

          {filters.showHaitianHeat && loadingHaitianZcta && (
            <div className="animate-pulse space-y-2 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-3">
              <div className="h-3 w-2/3 rounded bg-zinc-800" />
              <div className="h-2.5 w-full rounded-full bg-zinc-800" />
              <p className="text-caption">Loading ZIP population data…</p>
            </div>
          )}

          {filters.showHaitianHeat && haitianZctaStats && !loadingHaitianZcta && (
            <HeatLegend
              mode={filters.needScoreMode}
              populationTierBreaks={haitianZctaStats.populationTierBreaks}
              educationTierBreaks={haitianZctaStats.educationTierBreaks}
            />
          )}

          {!selectedZcta && haitianZctaStats && (
            <CitywideSummary
              totalHaitian={haitianZctaStats.citywide.totalHaitian}
              avgPct={haitianZctaStats.citywide.avgPct}
              zctaCount={haitianZctaStats.citywide.zctaCount}
            />
          )}

          {!selectedZcta && (
            <div className="border-t border-zinc-800/80 pt-4">
              <div className="flex items-center justify-between">
                <SectionHeader
                  title={metro.ui.regionComparisonTitle}
                  caption={metro.ui.regionComparisonCaption}
                />
                {isLoading && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                  </span>
                )}
              </div>

              <select
                className="mt-2 w-full cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 outline-none transition-all focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                value={selectedBorough || ""}
                onChange={(e) => onChangeSelectedBorough(e.target.value || null)}
                aria-label={`Select ${metro.ui.regionLabel}`}
              >
                <option value="">{metro.ui.regionAllLabel}</option>
                {metro.regions.map((region) => (
                  <option key={region.id} value={region.name}>
                    {region.name}
                  </option>
                ))}
              </select>

              {loadingDemographics ? (
                <div className="mt-4 animate-pulse space-y-3">
                  <div className="h-20 w-full rounded-xl bg-zinc-900/60" />
                  <div className="h-16 w-full rounded-xl bg-zinc-900/60" />
                </div>
              ) : errors.demographics ? null : displayData ? (
                <div className="mt-4">
                  <BoroughStatsCard
                    scopeLabel={boroughScopeLabel}
                    haitianPop={displayData.haitianPop}
                    speakers={displayData.speakers}
                    limitedEnglish={displayData.limitedEnglish}
                    pctNoInternet={displayData.pctNoInternet}
                    pctNoHS={displayData.pctNoHS}
                  />
                </div>
              ) : null}
            </div>
          )}

          {selectedZcta && displayData && !errors.demographics && (
            <details className="rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-300">
                Compare to {selectedBorough || metro.ui.scopeOverviewLabel.toLowerCase()} averages
              </summary>
              <div className="mt-3">
                <BoroughStatsCard
                  scopeLabel={boroughScopeLabel}
                  haitianPop={displayData.haitianPop}
                  speakers={displayData.speakers}
                  limitedEnglish={displayData.limitedEnglish}
                  pctNoInternet={displayData.pctNoInternet}
                  pctNoHS={displayData.pctNoHS}
                />
              </div>
            </details>
          )}
        </div>
      )}

      {tab === "layers" && (
        <div className="mt-4 space-y-3" role="tabpanel">
          <SectionHeader
            title="Map layers"
            caption="Toggle data overlays and adjust how need is calculated."
          />

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 transition-all hover:bg-orange-500/10">
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-200">
                Haitian population by ZIP
              </span>
              <p className="text-caption">U.S. Census estimates, 2018–2022</p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 accent-orange-500"
              checked={filters.showHaitianHeat}
              onChange={(e) =>
                onChangeFilters({ ...filters, showHaitianHeat: e.target.checked })
              }
            />
          </label>

          {filters.showHaitianHeat && (
            <div className="space-y-3 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-3">
              <div>
                <p className="text-section-title">Need scoring</p>
                <p className="mt-1 text-caption">
                  Population shows where Haitian communities live. Educational need also weighs
                  internet access and schooling.
                </p>
                <div className="mt-2 flex gap-1">
                  {(["population", "education"] as NeedScoreMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onChangeFilters({ ...filters, needScoreMode: mode })}
                      className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                        filters.needScoreMode === mode
                          ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40"
                          : "bg-zinc-900/60 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {mode === "population" ? "Population" : "Education"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Layer opacity</span>
                  <span>{Math.round(filters.haitianHeatOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.05}
                  value={filters.haitianHeatOpacity}
                  onChange={(e) =>
                    onChangeFilters({
                      ...filters,
                      haitianHeatOpacity: parseFloat(e.target.value),
                    })
                  }
                  className="mt-1 w-full accent-orange-500"
                  aria-label="Heat layer opacity"
                />
              </div>
            </div>
          )}

          {metro.overlays.regionBubbles.enabled && (
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="text-left">
                <span className="text-xs font-semibold text-zinc-200">
                  {metro.ui.regionBubblesLabel}
                </span>
                <p className="text-caption">County-level summary markers</p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 accent-orange-500"
                checked={filters.showHaitianBubbles}
                onChange={(e) =>
                  onChangeFilters({ ...filters, showHaitianBubbles: e.target.checked })
                }
              />
            </label>
          )}

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-200">Public high schools</span>
              <p className="text-caption">Graduation rate, safety, and ESL programs</p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-500"
              checked={filters.showSchools}
              onChange={(e) => onChangeFilters({ ...filters, showSchools: e.target.checked })}
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-200">Libraries</span>
              <p className="text-caption">Free tutoring and literacy support locations</p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 accent-cyan-500"
              checked={filters.showLibraries}
              onChange={(e) => onChangeFilters({ ...filters, showLibraries: e.target.checked })}
            />
          </label>

          {filters.showSchools && metro.overlays.schools.hasPerformanceMetrics && (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
              <p className="text-section-title">School graduation key</p>
              <ul className="mt-2 space-y-2">
                {[
                  { color: "bg-red-500", label: "Below 60%", note: "High need" },
                  { color: "bg-amber-500", label: "60% – 80%", note: "Moderate" },
                  { color: "bg-emerald-500", label: "Above 80%", note: "Stable" },
                ].map((row) => (
                  <li key={row.label} className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className={`h-2.5 w-2.5 rounded-full ${row.color}`} aria-hidden />
                    <span className="font-medium text-zinc-300">{row.label}</span>
                    <span className="text-caption">· {row.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <footer className="mt-4 border-t border-zinc-900/90 pt-3">
        <p className="text-caption text-zinc-500">{metro.ui.boundaryFootnote}</p>
        <p className="mt-1 text-caption text-zinc-500">
          ZIP boundaries approximate USPS mail routes. Census estimates have margins of error;
          small populations may show as insufficient data.
        </p>
      </footer>
    </aside>
  );
}
