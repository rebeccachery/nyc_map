"use client";

import { emptyFeatureCollection } from "@/lib/geo";
import NYCMap from "@/components/NYCMap";
import Sidebar, { type GeoPoint, type SidebarFilters } from "@/components/Sidebar";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection } from "geojson";

type RouteApiResponse = {
  route: FeatureCollection;
};

export default function CommuteApp() {
  const [filters, setFilters] = useState<SidebarFilters>({
    show311: true,
    showMtaSubway: false,
    mtaFeed: "ace",
    routeProfile: "walking",
  });

  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [route, setRoute] = useState<FeatureCollection | null>(null);
  const [routeSummary, setRouteSummary] = useState<{
    distanceMeters: number;
    durationSeconds: number;
  } | null>(null);

  const [vehicles, setVehicles] = useState<FeatureCollection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const map311Enabled = filters.show311;

  const onRoute = useCallback(async () => {
    if (!origin || !destination) return;
    setBusy(true);
    setError(null);
    try {
      const from = `${origin.lng},${origin.lat}`;
      const to = `${destination.lng},${destination.lat}`;
      const res = await fetch(
        `/api/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(
          to
        )}&profile=${encodeURIComponent(filters.routeProfile)}`
      );
      if (!res.ok) throw new Error(`Route request failed (${res.status})`);
      const data = (await res.json()) as RouteApiResponse;
      setRoute(data.route);
      const f = data.route.features[0];
      const props = (f?.properties ?? {}) as Record<string, unknown>;
      const distanceMeters = Number(props.distanceMeters ?? NaN);
      const durationSeconds = Number(props.durationSeconds ?? NaN);
      if (Number.isFinite(distanceMeters) && Number.isFinite(durationSeconds)) {
        setRouteSummary({ distanceMeters, durationSeconds });
      } else {
        setRouteSummary(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Routing failed.");
      setRoute(null);
      setRouteSummary(null);
    } finally {
      setBusy(false);
    }
  }, [destination, filters.routeProfile, origin]);

  useEffect(() => {
    if (!filters.showMtaSubway) {
      setVehicles(null);
      return;
    }

    let cancelled = false;
    let t: number | null = null;

    async function tick() {
      try {
        const res = await fetch(
          `/api/mta/subway-vehicles?feed=${encodeURIComponent(filters.mtaFeed)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`MTA request failed (${res.status})`);
        const fc = (await res.json()) as FeatureCollection;
        if (!cancelled) setVehicles(fc);
      } catch (e: unknown) {
        if (!cancelled) {
          setVehicles(emptyFeatureCollection());
          setError(
            e instanceof Error
              ? e.message
              : "MTA realtime request failed."
          );
        }
      } finally {
        if (!cancelled) {
          t = window.setTimeout(tick, 15_000);
        }
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
    };
  }, [filters.mtaFeed, filters.showMtaSubway]);

  const mapData = useMemo(() => {
    // NYCMapCore expects a FeatureCollection even when hiding.
    return map311Enabled ? undefined : emptyFeatureCollection();
  }, [map311Enabled]);

  return (
    <div className="relative h-screen w-full">
      <NYCMap
        loadDemo311={map311Enabled}
        data={mapData}
        vehicles={vehicles ?? undefined}
        route={route ?? undefined}
      />

      <Sidebar
        filters={filters}
        onChangeFilters={(next) => {
          setError(null);
          setFilters(next);
        }}
        origin={origin}
        destination={destination}
        onChangeOrigin={(p) => {
          setOrigin(p);
          setError(null);
        }}
        onChangeDestination={(p) => {
          setDestination(p);
          setError(null);
        }}
        onRoute={onRoute}
        routeSummary={routeSummary}
        busy={busy}
        error={error}
      />
    </div>
  );
}

