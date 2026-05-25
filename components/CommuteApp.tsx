"use client";

import NYCMap from "@/components/NYCMap";
import Sidebar, { type SidebarFilters } from "@/components/Sidebar";
import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";

export default function CommuteApp() {
  const [filters, setFilters] = useState<SidebarFilters>({
    showHaitianBubbles: true,
    showSchools: true,
    showLibraries: true,
  });

  const [selectedBorough, setSelectedBorough] = useState<string | null>(null);
  
  const [haitianPopData, setHaitianPopData] = useState<any[]>([]);
  const [schoolsData, setSchoolsData] = useState<FeatureCollection | undefined>(undefined);
  const [librariesData, setLibrariesData] = useState<FeatureCollection | undefined>(undefined);
  
  const [loadingDemographics, setLoadingDemographics] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingLibraries, setLoadingLibraries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch Census Demographics
  useEffect(() => {
    let active = true;
    setLoadingDemographics(true);
    setError(null);
    fetch("/api/demographics")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.success) {
          setHaitianPopData(data.data);
        } else {
          setError(data.error || "Failed to load demographics");
        }
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || "Failed to load demographics");
      })
      .finally(() => {
        if (active) setLoadingDemographics(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // 2. Fetch NYC High Schools (Graduation, safety, ESL data)
  useEffect(() => {
    let active = true;
    setLoadingSchools(true);
    fetch("/api/schools")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.success) {
          setSchoolsData(data.data);
        } else {
          setError(data.error || "Failed to load high schools");
        }
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || "Failed to load high schools");
      })
      .finally(() => {
        if (active) setLoadingSchools(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // 3. Fetch Library Locations (Tutoring centers)
  useEffect(() => {
    let active = true;
    setLoadingLibraries(true);
    fetch("/api/libraries")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.success) {
          setLibrariesData(data.data);
        } else {
          setError(data.error || "Failed to load library locations");
        }
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || "Failed to load library locations");
      })
      .finally(() => {
        if (active) setLoadingLibraries(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <NYCMap
        haitianPopData={haitianPopData}
        schoolsData={schoolsData}
        librariesData={librariesData}
        showHaitianBubbles={filters.showHaitianBubbles}
        showSchools={filters.showSchools}
        showLibraries={filters.showLibraries}
        selectedBorough={selectedBorough}
      />

      <Sidebar
        filters={filters}
        onChangeFilters={setFilters}
        haitianPopData={haitianPopData}
        selectedBorough={selectedBorough}
        onChangeSelectedBorough={setSelectedBorough}
        loadingDemographics={loadingDemographics}
        loadingSchools={loadingSchools}
        loadingLibraries={loadingLibraries}
        error={error}
      />
    </div>
  );
}
