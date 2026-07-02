"use client";

import AppShell from "@/components/AppShell";
import NYCMap from "@/components/NYCMap";
import Sidebar, { type SidebarFilters } from "@/components/Sidebar";
import { setLastMetroId } from "@/lib/metroPreferences";
import {
  getMetroConfig,
  isMetroLive,
  type MetroId,
} from "@/lib/metroRegistry";
import type { HaitianZctaApiResponse, LayerErrors } from "@/lib/haitianZctaTypes";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection } from "geojson";

type CommuteAppProps = {
  metroId: MetroId;
};

function metroApiQuery(metroId: MetroId): string {
  return `?metro=${metroId}`;
}

export default function CommuteApp({ metroId }: CommuteAppProps) {
  const metro = useMemo(() => getMetroConfig(metroId)!, [metroId]);
  const isLive = isMetroLive(metro);

  const [filters, setFilters] = useState<SidebarFilters>({
    showHaitianHeat: true,
    showHaitianBubbles: false,
    showSchools: true,
    showLibraries: true,
    haitianHeatOpacity: 0.75,
    needScoreMode: "population",
  });

  const [selectedBorough, setSelectedBorough] = useState<string | null>(null);
  const [selectedZcta, setSelectedZcta] = useState<string | null>(null);

  const [haitianPopData, setHaitianPopData] = useState<any[]>([]);
  const [haitianZctaData, setHaitianZctaData] = useState<FeatureCollection | undefined>(
    undefined
  );
  const [haitianZctaStats, setHaitianZctaStats] = useState<
    HaitianZctaApiResponse["stats"] | undefined
  >(undefined);
  const [schoolsData, setSchoolsData] = useState<FeatureCollection | undefined>(undefined);
  const [librariesData, setLibrariesData] = useState<FeatureCollection | undefined>(undefined);

  const [loadingDemographics, setLoadingDemographics] = useState(false);
  const [loadingHaitianZcta, setLoadingHaitianZcta] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingLibraries, setLoadingLibraries] = useState(false);
  const [errors, setErrors] = useState<LayerErrors>({});

  const setLayerError = useCallback((layer: keyof LayerErrors, message: string | null) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[layer] = message;
      else delete next[layer];
      return next;
    });
  }, []);

  useEffect(() => {
    setLastMetroId(metroId);
    setSelectedBorough(null);
    setSelectedZcta(null);
    setHaitianPopData([]);
    setHaitianZctaData(undefined);
    setHaitianZctaStats(undefined);
    setSchoolsData(undefined);
    setLibrariesData(undefined);
    setErrors({});
  }, [metroId]);

  useEffect(() => {
    if (!isLive) return;

    let active = true;
    setLoadingDemographics(true);
    setLayerError("demographics", null);
    fetch(`/api/demographics${metroApiQuery(metroId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.success) setHaitianPopData(data.data);
        else setLayerError("demographics", data.error || "Failed to load demographics");
      })
      .catch((err: Error) => {
        if (!active) return;
        setLayerError("demographics", err.message || "Failed to load demographics");
      })
      .finally(() => {
        if (active) setLoadingDemographics(false);
      });
    return () => {
      active = false;
    };
  }, [isLive, metroId, setLayerError]);

  useEffect(() => {
    if (!isLive) return;

    let active = true;
    setLoadingHaitianZcta(true);
    setLayerError("haitianZcta", null);
    fetch(`/api/haitian-zcta${metroApiQuery(metroId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.success) {
          const payload = data.data as HaitianZctaApiResponse;
          setHaitianZctaData(payload.features);
          setHaitianZctaStats(payload.stats);
        } else {
          setLayerError("haitianZcta", data.error || "Failed to load Haitian ZCTA layer");
        }
      })
      .catch((err: Error) => {
        if (!active) return;
        setLayerError("haitianZcta", err.message || "Failed to load Haitian ZCTA layer");
      })
      .finally(() => {
        if (active) setLoadingHaitianZcta(false);
      });
    return () => {
      active = false;
    };
  }, [isLive, metroId, setLayerError]);

  useEffect(() => {
    if (!isLive) return;

    let active = true;
    setLoadingSchools(true);
    setLayerError("schools", null);
    fetch(`/api/schools${metroApiQuery(metroId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.success) setSchoolsData(data.data);
        else setLayerError("schools", data.error || "Failed to load high schools");
      })
      .catch((err: Error) => {
        if (!active) return;
        setLayerError("schools", err.message || "Failed to load high schools");
      })
      .finally(() => {
        if (active) setLoadingSchools(false);
      });
    return () => {
      active = false;
    };
  }, [isLive, metroId, setLayerError]);

  useEffect(() => {
    if (!isLive) return;

    let active = true;
    setLoadingLibraries(true);
    setLayerError("libraries", null);
    fetch(`/api/libraries${metroApiQuery(metroId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.success) setLibrariesData(data.data);
        else setLayerError("libraries", data.error || "Failed to load library locations");
      })
      .catch((err: Error) => {
        if (!active) return;
        setLayerError("libraries", err.message || "Failed to load library locations");
      })
      .finally(() => {
        if (active) setLoadingLibraries(false);
      });
    return () => {
      active = false;
    };
  }, [isLive, metroId, setLayerError]);

  const handleSelectZcta = useCallback((zcta: string | null) => {
    setSelectedZcta(zcta);
  }, []);

  const regionPropertyKey = metro.ui.regionPropertyKey;

  useEffect(() => {
    if (!selectedZcta || !selectedBorough || !haitianZctaData) return;
    const feature = haitianZctaData.features.find(
      (f) => String(f.properties?.zcta) === selectedZcta
    );
    if (feature && feature.properties?.[regionPropertyKey] !== selectedBorough) {
      setSelectedZcta(null);
    }
  }, [haitianZctaData, regionPropertyKey, selectedBorough, selectedZcta]);

  return (
    <AppShell metro={metro}>
      <div className="relative h-full w-full overflow-hidden bg-zinc-950">
        {isLive ? (
          <NYCMap
            haitianPopData={haitianPopData}
            haitianZctaData={haitianZctaData}
            schoolsData={schoolsData}
            librariesData={librariesData}
            showHaitianHeat={filters.showHaitianHeat}
            showHaitianBubbles={filters.showHaitianBubbles}
            showSchools={filters.showSchools}
            showLibraries={filters.showLibraries}
            haitianHeatOpacity={filters.haitianHeatOpacity}
            needScoreMode={filters.needScoreMode}
            selectedBorough={selectedBorough}
            selectedZcta={selectedZcta}
            onSelectZcta={handleSelectZcta}
            loadingHaitianZcta={loadingHaitianZcta}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-zinc-950 px-6">
            <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-orange-400">
                Coming soon
              </p>
              <h2 className="mt-2 text-xl font-bold text-zinc-100">{metro.label}</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Map layers for this metro are being built. Switch to New York City to explore the
                live map, or check back soon for Miami-Dade and Broward County data.
              </p>
              <Link
                href="/map/nyc"
                className="mt-6 inline-flex rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/20"
              >
                Open New York City map
              </Link>
            </div>
          </div>
        )}

        <Sidebar
          metro={metro}
          filters={filters}
          onChangeFilters={setFilters}
          haitianPopData={haitianPopData}
          haitianZctaData={haitianZctaData}
          haitianZctaStats={haitianZctaStats}
          schoolsData={schoolsData}
          librariesData={librariesData}
          selectedBorough={selectedBorough}
          onChangeSelectedBorough={setSelectedBorough}
          selectedZcta={selectedZcta}
          onSelectZcta={handleSelectZcta}
          loadingDemographics={loadingDemographics}
          loadingHaitianZcta={loadingHaitianZcta}
          loadingSchools={loadingSchools}
          loadingLibraries={loadingLibraries}
          errors={errors}
        />
      </div>
    </AppShell>
  );
}
