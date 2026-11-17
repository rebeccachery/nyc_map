"use client";

import AppShell from "@/components/AppShell";
import AskPanel from "@/components/AskPanel";
import { askMap, type AskResponse } from "@/lib/askClient";
import NYCMap from "@/components/NYCMap";
import Sidebar, { type SidebarFilters } from "@/components/Sidebar";
import type { HaitianZctaApiResponse, LayerErrors } from "@/lib/haitianZctaTypes";
import { metroApiQuery } from "@/lib/metroApi";
import { setLastMetroId } from "@/lib/metroPreferences";
import { getMetroConfig, type MetroId } from "@/lib/metroRegistry";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";

type CommuteAppProps = {
  metroId: MetroId;
};

export default function CommuteApp({ metroId }: CommuteAppProps) {
  const metro = useMemo(() => getMetroConfig(metroId)!, [metroId]);

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

  // Ask-the-map state is tagged with its metro, so switching metros hides a stale answer
  // without an effect.
  const [ask, setAsk] = useState<{
    metro: MetroId;
    result: AskResponse | null;
    loading: boolean;
    error: string | null;
    mapActive: boolean;
  } | null>(null);
  const askAbort = useRef<AbortController | null>(null);
  const askState = ask?.metro === metroId ? ask : null;

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
  }, [metroId, setLayerError]);

  useEffect(() => {
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
  }, [metroId, setLayerError]);

  useEffect(() => {
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
  }, [metroId, setLayerError]);

  useEffect(() => {
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
  }, [metroId, setLayerError]);

  const handleSelectZcta = useCallback((zcta: string | null) => {
    setSelectedZcta(zcta);
  }, []);

  const regionPropertyKey = metro.ui.regionPropertyKey;

  const handleAsk = useCallback(
    async (question: string) => {
      askAbort.current?.abort();
      const controller = new AbortController();
      askAbort.current = controller;
      setAsk((prev) => ({
        metro: metroId,
        result: prev?.metro === metroId ? prev.result : null,
        loading: true,
        error: null,
        mapActive: false,
      }));

      const outcome = await askMap(question, metroId, controller.signal);
      if (controller.signal.aborted) return;

      if (!outcome.ok) {
        setAsk({ metro: metroId, result: null, loading: false, error: outcome.error, mapActive: false });
        return;
      }
      const view = outcome.data.map;
      setAsk({ metro: metroId, result: outcome.data, loading: false, error: null, mapActive: !!view });
      if (view) {
        // Show the answer the way it was computed: same need mode, the layers it depends on,
        // and one county/borough only when the answer is about one.
        setFilters((f) => ({
          ...f,
          showHaitianHeat: true,
          needScoreMode: view.needMode,
          showLibraries: f.showLibraries || view.layers.libraries,
          showSchools: f.showSchools || view.layers.schools,
        }));
        setSelectedBorough(view.regions?.length === 1 ? view.regions[0] : null);
        setSelectedZcta(null);
      }
    },
    [metroId]
  );

  const handleAskCancel = useCallback(() => {
    askAbort.current?.abort();
    setAsk((prev) => (prev ? { ...prev, loading: false } : prev));
  }, []);

  const handleAskClearMap = useCallback(() => {
    setAsk((prev) => (prev ? { ...prev, mapActive: false } : prev));
  }, []);

  const handleAskReset = useCallback(() => {
    askAbort.current?.abort();
    setAsk(null);
  }, []);

  const askHighlight = useMemo(() => {
    const r = askState?.result;
    if (!askState?.mapActive || !r?.map) return null;
    return { zips: r.map.highlightZips, places: r.focusPlaces };
  }, [askState]);

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
        <NYCMap
          metro={metro}
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
          askHighlight={askHighlight}
        />

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
          askPanel={
            <AskPanel
              metro={metro}
              result={askState?.result ?? null}
              loading={askState?.loading ?? false}
              error={askState?.error ?? null}
              mapActive={!!askHighlight}
              onAsk={handleAsk}
              onCancel={handleAskCancel}
              onClearMap={handleAskClearMap}
              onReset={handleAskReset}
              onSelectZip={handleSelectZcta}
            />
          }
        />
      </div>
    </AppShell>
  );
}
