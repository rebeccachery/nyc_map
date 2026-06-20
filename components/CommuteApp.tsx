"use client";

import NYCMap from "@/components/NYCMap";
import Sidebar, { type SidebarFilters } from "@/components/Sidebar";
import { useCallback, useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { HaitianZctaApiResponse, LayerErrors } from "@/lib/haitianZctaTypes";

export default function CommuteApp() {
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
    let active = true;
    setLoadingDemographics(true);
    setLayerError("demographics", null);
    fetch("/api/demographics")
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
  }, [setLayerError]);

  useEffect(() => {
    let active = true;
    setLoadingHaitianZcta(true);
    setLayerError("haitianZcta", null);
    fetch("/api/haitian-zcta")
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
  }, [setLayerError]);

  useEffect(() => {
    let active = true;
    setLoadingSchools(true);
    setLayerError("schools", null);
    fetch("/api/schools")
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
  }, [setLayerError]);

  useEffect(() => {
    let active = true;
    setLoadingLibraries(true);
    setLayerError("libraries", null);
    fetch("/api/libraries")
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
  }, [setLayerError]);

  const handleSelectZcta = useCallback((zcta: string | null) => {
    setSelectedZcta(zcta);
  }, []);

  useEffect(() => {
    if (!selectedZcta || !selectedBorough || !haitianZctaData) return;
    const feature = haitianZctaData.features.find(
      (f) => String(f.properties?.zcta) === selectedZcta
    );
    if (feature && feature.properties?.borough !== selectedBorough) {
      setSelectedZcta(null);
    }
  }, [selectedBorough, selectedZcta, haitianZctaData]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
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
      />

      <Sidebar
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
  );
}
