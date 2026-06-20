"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeatureCollection } from "geojson";
import HeatLegend from "@/components/HeatLegend";
import ZctaInfoPanel from "@/components/ZctaInfoPanel";
import type { HaitianZctaApiResponse, LayerErrors } from "@/lib/haitianZctaTypes";
import type { NeedScoreMode } from "@/lib/haitianNeed";

export type SidebarFilters = {
  showHaitianHeat: boolean;
  showHaitianBubbles: boolean;
  showSchools: boolean;
  showLibraries: boolean;
  haitianHeatOpacity: number;
  needScoreMode: NeedScoreMode;
};

export type SidebarProps = {
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

export default function Sidebar({
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
  const [zipSearch, setZipSearch] = useState("");

  useEffect(() => {
    if (selectedZcta) setZipSearch(selectedZcta);
  }, [selectedZcta]);

  const selectedData = useMemo(() => {
    if (!selectedBorough || !haitianPopData) return null;
    return haitianPopData.find((d) => d.boroughName === selectedBorough) || null;
  }, [selectedBorough, haitianPopData]);

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
  const isLoading =
    loadingDemographics || loadingHaitianZcta || loadingSchools || loadingLibraries;

  const handleZipSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = zipSearch.trim().padStart(5, "0");
    if (normalized.length !== 5) return;
    const exists = haitianZctaData?.features.some(
      (f) => String(f.properties?.zcta) === normalized
    );
    if (exists) onSelectZcta(normalized);
  };

  return (
    <aside className="absolute left-4 top-4 z-20 flex max-h-[calc(100vh-2rem)] w-[360px] max-w-[calc(100%-2rem)] flex-col overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 text-zinc-100 shadow-2xl backdrop-blur-xl scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
      <div className="border-b border-zinc-800/80 pb-3">
        <h2 className="bg-gradient-to-r from-orange-400 via-amber-300 to-cyan-300 bg-clip-text text-base font-extrabold tracking-tight text-transparent">
          Haitian Demographics & Educational Need
        </h2>
        <p className="mt-1 text-xs leading-normal text-zinc-400">
          ZIP-level choropleth of Haitian population density overlaid with schools and tutoring
          resources.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Map Layers</p>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-orange-500/20 bg-orange-500/5 p-2.5 transition-all hover:bg-orange-500/10">
          <div className="flex items-center gap-2.5">
            <span
              className="h-3 w-3 rounded-sm bg-gradient-to-r from-amber-200 via-orange-400 to-orange-600 shadow-[0_0_8px_rgba(249,115,22,0.6)]"
              aria-hidden
            />
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-200">Haitian Pop Heat (ZIP)</span>
              <p className="text-[10px] text-zinc-500">Choropleth by ZCTA — ACS 2022</p>
            </div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-orange-500 accent-orange-500 focus:ring-orange-500 focus:ring-offset-zinc-900"
            checked={filters.showHaitianHeat}
            onChange={(e) =>
              onChangeFilters({ ...filters, showHaitianHeat: e.target.checked })
            }
          />
        </label>

        {filters.showHaitianHeat && (
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Need Scoring Mode
            </p>
            <div className="mt-1.5 flex gap-1">
              {(["population", "education"] as NeedScoreMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChangeFilters({ ...filters, needScoreMode: mode })}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition ${
                    filters.needScoreMode === mode
                      ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40"
                      : "bg-zinc-900/60 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {mode === "population" ? "Population %" : "Educational Need"}
                </button>
              ))}
            </div>
          </div>
        )}

        {filters.showHaitianHeat && (
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-3 py-2">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
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
              aria-label="Haitian heat layer opacity"
            />
          </div>
        )}

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5 transition-all hover:bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 rounded-full bg-orange-500/60 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-200">Borough Pop Bubbles</span>
              <p className="text-[10px] text-zinc-500">County-level aggregate (ACS)</p>
            </div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-orange-500 accent-orange-500 focus:ring-orange-500 focus:ring-offset-zinc-900"
            checked={filters.showHaitianBubbles}
            onChange={(e) =>
              onChangeFilters({ ...filters, showHaitianBubbles: e.target.checked })
            }
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5 transition-all hover:bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-200">Public High Schools</span>
              <p className="text-[10px] text-zinc-500">Graduation rate, ESL, safety metrics</p>
            </div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-amber-500 accent-amber-500 focus:ring-amber-500 focus:ring-offset-zinc-900"
            checked={filters.showSchools}
            onChange={(e) => onChangeFilters({ ...filters, showSchools: e.target.checked })}
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5 transition-all hover:bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-200">Tutoring & Literacy Hubs</span>
              <p className="text-[10px] text-zinc-500">Public library networks offering support</p>
            </div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-cyan-500 accent-cyan-500 focus:ring-cyan-500 focus:ring-offset-zinc-900"
            checked={filters.showLibraries}
            onChange={(e) => onChangeFilters({ ...filters, showLibraries: e.target.checked })}
          />
        </label>
      </div>

      {filters.showHaitianHeat && loadingHaitianZcta && (
        <div className="mt-3 animate-pulse space-y-2 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-3">
          <div className="h-3 w-2/3 rounded bg-zinc-800" />
          <div className="h-2.5 w-full rounded-full bg-zinc-800" />
          <p className="text-[10px] text-zinc-500">Loading ZIP choropleth (Census ACS)…</p>
        </div>
      )}

      {filters.showHaitianHeat && haitianZctaStats && !loadingHaitianZcta && (
        <HeatLegend
          mode={filters.needScoreMode}
          populationTierBreaks={haitianZctaStats.populationTierBreaks}
          educationTierBreaks={haitianZctaStats.educationTierBreaks}
        />
      )}

      {filters.showHaitianHeat && (
        <form onSubmit={handleZipSearch} className="mt-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Search ZIP Code
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              placeholder="e.g. 11203"
              value={zipSearch}
              onChange={(e) => setZipSearch(e.target.value.replace(/\D/g, ""))}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
            />
            <button
              type="submit"
              className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-[10px] font-semibold text-orange-400 transition hover:bg-orange-500/20"
            >
              Go
            </button>
          </div>
        </form>
      )}

      <ZctaInfoPanel
        zctaData={haitianZctaData}
        selectedZcta={selectedZcta}
        needScoreMode={filters.needScoreMode}
        onClearSelection={() => onSelectZcta(null)}
        schoolsData={schoolsData}
        librariesData={librariesData}
      />

      {Object.keys(errors).length > 0 && (
        <div className="mt-3 space-y-1.5">
          {Object.entries(errors).map(([layer, message]) => (
            <div
              key={layer}
              className="rounded-lg border border-red-950/60 bg-red-950/20 px-2.5 py-2 text-[10px] text-red-400"
            >
              <span className="font-semibold capitalize">{layer}:</span> {message}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex-1 border-t border-zinc-800/80 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            Borough Demographics
          </p>
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
        >
          <option value="">Citywide Overview</option>
          <option value="Brooklyn">Brooklyn (Kings County)</option>
          <option value="Queens">Queens (Queens County)</option>
          <option value="Bronx">Bronx (Bronx County)</option>
          <option value="Manhattan">Manhattan (New York County)</option>
          <option value="Staten Island">Staten Island (Richmond County)</option>
        </select>

        {loadingDemographics ? (
          <div className="mt-4 animate-pulse space-y-3">
            <div className="h-20 w-full rounded-xl bg-zinc-900/60" />
            <div className="h-16 w-full rounded-xl bg-zinc-900/60" />
          </div>
        ) : errors.demographics ? (
          <div className="mt-4 rounded-xl border border-red-950 bg-red-950/20 p-3 text-xs text-red-400">
            Borough demographics unavailable.
          </div>
        ) : displayData ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-amber-500/5 p-3.5 shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                Haitian Speakers & Ancestry
              </span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-zinc-500">Haitian Ancestry</p>
                  <p className="text-lg font-black text-zinc-100">
                    {displayData.haitianPop.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">Haitian Creole Speakers</p>
                  <p className="text-lg font-black text-zinc-100">
                    {displayData.speakers.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-3 border-t border-zinc-800/60 pt-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Limited English Proficiency</span>
                  <span className="font-bold text-zinc-200">
                    {displayData.speakers > 0
                      ? `${((displayData.limitedEnglish / displayData.speakers) * 100).toFixed(1)}%`
                      : "0%"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-3.5">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                    Internet Deficit
                  </span>
                  <span className="font-extrabold text-red-400">
                    {displayData.pctNoInternet.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all duration-500"
                    style={{ width: `${displayData.pctNoInternet}%` }}
                  />
                </div>
              </div>
              <div className="border-t border-zinc-800/40 pt-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
                    Low Educational Attainment
                  </span>
                  <span className="font-extrabold text-orange-400">
                    {displayData.pctNoHS.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all duration-500"
                    style={{ width: `${displayData.pctNoHS}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {filters.showSchools && (
        <div className="mt-4 border-t border-zinc-800/80 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            School Graduation Key
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 opacity-90" />
              <span>&lt;60% (High Need)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 opacity-90" />
              <span>60%–80%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 opacity-90" />
              <span>&gt;80% (Stable)</span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-between border-t border-zinc-900/90 pt-3 text-[10px] text-zinc-600">
        <span>Census ACS 2022 · MODZCTA</span>
        <span>NYC Open Data</span>
      </div>
      <p className="mt-1 text-[9px] leading-relaxed text-zinc-700">
        ZCTA boundaries approximate USPS ZIP codes. ACS estimates have margins of error; small
        populations may show insufficient data.
      </p>
    </aside>
  );
}
