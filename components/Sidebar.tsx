"use client";

import { useMemo } from "react";

export type SidebarFilters = {
  showHaitianBubbles: boolean;
  showSchools: boolean;
  showLibraries: boolean;
};

export type SidebarProps = {
  filters: SidebarFilters;
  onChangeFilters: (next: SidebarFilters) => void;
  haitianPopData: any[];
  selectedBorough: string | null;
  onChangeSelectedBorough: (boro: string | null) => void;
  loadingDemographics?: boolean;
  loadingSchools?: boolean;
  loadingLibraries?: boolean;
  error?: string | null;
};

export default function Sidebar({
  filters,
  onChangeFilters,
  haitianPopData,
  selectedBorough,
  onChangeSelectedBorough,
  loadingDemographics = false,
  loadingSchools = false,
  loadingLibraries = false,
  error = null,
}: SidebarProps) {
  
  // Find currently selected borough data
  const selectedData = useMemo(() => {
    if (!selectedBorough || !haitianPopData) return null;
    return haitianPopData.find((d) => d.boroughName === selectedBorough) || null;
  }, [selectedBorough, haitianPopData]);

  // Calculate NYC Totals for a global citywide perspective
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

  return (
    <aside className="absolute left-4 top-4 z-20 flex w-[360px] max-w-[calc(100%-2rem)] flex-col max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 text-zinc-100 shadow-2xl backdrop-blur-xl scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
      
      {/* Header */}
      <div className="border-b border-zinc-800/80 pb-3">
        <h2 className="bg-gradient-to-r from-orange-400 via-amber-300 to-cyan-300 bg-clip-text text-base font-extrabold tracking-tight text-transparent">
          Haitian Demographics & Educational Need
        </h2>
        <p className="mt-1 text-xs leading-normal text-zinc-400">
          Uncovering critical corridors where high Haitian population densities overlap with limited internet, tutoring deserts, and low educational resources.
        </p>
      </div>

      {/* Layer Toggles */}
      <div className="mt-4 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Map Layers</p>
        
        <label className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5 transition-all hover:bg-zinc-900/80 cursor-pointer">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-200">Haitian Pop Density</span>
              <p className="text-[10px] text-zinc-500">County population bubbles (ACS)</p>
            </div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-zinc-900 accent-orange-500"
            checked={filters.showHaitianBubbles}
            onChange={(e) =>
              onChangeFilters({ ...filters, showHaitianBubbles: e.target.checked })
            }
          />
        </label>

        <label className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5 transition-all hover:bg-zinc-900/80 cursor-pointer">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-200">Public High Schools</span>
              <p className="text-[10px] text-zinc-500">Graduation rate, ESL, safety metrics</p>
            </div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-zinc-900 accent-amber-500"
            checked={filters.showSchools}
            onChange={(e) =>
              onChangeFilters({ ...filters, showSchools: e.target.checked })
            }
          />
        </label>

        <label className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5 transition-all hover:bg-zinc-900/80 cursor-pointer">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
            <div className="text-left">
              <span className="text-xs font-semibold text-zinc-200">Tutoring & Literacy Hubs</span>
              <p className="text-[10px] text-zinc-500">Public library networks offering support</p>
            </div>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-zinc-900 accent-cyan-500"
            checked={filters.showLibraries}
            onChange={(e) =>
              onChangeFilters({ ...filters, showLibraries: e.target.checked })
            }
          />
        </label>
      </div>

      {/* Borough Selector & Statistics */}
      <div className="mt-4 border-t border-zinc-800/80 pt-4 flex-1">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Borough Demographics</p>
          {(loadingDemographics || loadingSchools || loadingLibraries) && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
          )}
        </div>

        <select
          className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 outline-none transition-all focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 cursor-pointer"
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
          <div className="mt-4 space-y-3 animate-pulse">
            <div className="h-20 w-full rounded-xl bg-zinc-900/60" />
            <div className="h-16 w-full rounded-xl bg-zinc-900/60" />
            <div className="h-16 w-full rounded-xl bg-zinc-900/60" />
          </div>
        ) : error ? (
          <div className="mt-4 rounded-xl border border-red-950 bg-red-950/20 p-3 text-xs text-red-400">
            <span className="font-semibold">Failed to fetch demographics:</span> {error}
          </div>
        ) : displayData ? (
          <div className="mt-4 space-y-3">
            
            {/* Haitian Population Demographics Card */}
            <div className="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-amber-500/5 p-3.5 shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Haitian Speakers & Ancestry</span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-zinc-500">Haitian Ancestry</p>
                  <p className="text-lg font-black text-zinc-100">{displayData.haitianPop.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">Haitian Creole Speakers</p>
                  <p className="text-lg font-black text-zinc-100">{displayData.speakers.toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-3 border-t border-zinc-800/60 pt-2.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-zinc-400">Limited English Proficiency</span>
                  <span className="font-bold text-zinc-200">
                    {displayData.speakers > 0 
                      ? `${((displayData.limitedEnglish / displayData.speakers) * 100).toFixed(1)}%`
                      : "0%"
                    }
                  </span>
                </div>
                <div className="mt-1 flex justify-between items-center text-[10px] text-zinc-500">
                  <span>(High Need for ESL Support)</span>
                  <span>{displayData.limitedEnglish.toLocaleString()} speakers</span>
                </div>
              </div>
            </div>

            {/* Educational Needs Metric Card */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-3.5 space-y-3">
              
              {/* Internet subscription deficit */}
              <div>
                <div className="flex justify-between items-center text-xs font-semibold text-zinc-200">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                    Internet Deficit
                  </span>
                  <span className="text-red-400 font-extrabold">{displayData.pctNoInternet.toFixed(1)}%</span>
                </div>
                <p className="text-[10px] text-zinc-500 mt-0.5">Households without any internet subscription.</p>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-red-500 transition-all duration-500" 
                    style={{ width: `${displayData.pctNoInternet}%` }}
                  />
                </div>
              </div>

              {/* Adult literacy proxy */}
              <div className="border-t border-zinc-800/40 pt-2.5">
                <div className="flex justify-between items-center text-xs font-semibold text-zinc-200">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                    Low Educational Attainment
                  </span>
                  <span className="text-orange-400 font-extrabold">{displayData.pctNoHS.toFixed(1)}%</span>
                </div>
                <p className="text-[10px] text-zinc-500 mt-0.5">Adults (25+) without a High School diploma.</p>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
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

      {/* Graduation Rate Map Legend */}
      {filters.showSchools && (
        <div className="mt-4 border-t border-zinc-800/80 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">School Graduation Key</p>
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
      
      {/* Footer Info */}
      <div className="mt-4 border-t border-zinc-900/90 pt-3 text-[10px] text-zinc-600 flex justify-between">
        <span>Census ACS 2022 (5-Yr)</span>
        <span>NYC Open Data SODA</span>
      </div>
    </aside>
  );
}
