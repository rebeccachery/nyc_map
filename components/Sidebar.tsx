"use client";

import { useEffect, useMemo, useState } from "react";

export type GeoPoint = { name: string; lat: number; lng: number };

export type SidebarFilters = {
  show311: boolean;
  showMtaSubway: boolean;
  mtaFeed: string;
  routeProfile: "walking" | "driving" | "cycling";
};

export type SidebarProps = {
  filters: SidebarFilters;
  onChangeFilters: (next: SidebarFilters) => void;
  origin: GeoPoint | null;
  destination: GeoPoint | null;
  onChangeOrigin: (p: GeoPoint | null) => void;
  onChangeDestination: (p: GeoPoint | null) => void;
  onRoute: () => void;
  routeSummary?: { distanceMeters: number; durationSeconds: number } | null;
  busy?: boolean;
  error?: string | null;
};

type Suggestion = { id: string; name: string; lat: number; lng: number };

function formatDuration(seconds: number) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function formatDistance(meters: number) {
  const miles = meters / 1609.344;
  return miles < 0.25 ? `${Math.round(meters)} m` : `${miles.toFixed(1)} mi`;
}

export default function Sidebar(props: SidebarProps) {
  const {
    filters,
    onChangeFilters,
    origin,
    destination,
    onChangeOrigin,
    onChangeDestination,
    onRoute,
    routeSummary,
    busy,
    error,
  } = props;

  const [originQuery, setOriginQuery] = useState(origin?.name ?? "");
  const [destQuery, setDestQuery] = useState(destination?.name ?? "");
  const [originSugs, setOriginSugs] = useState<Suggestion[]>([]);
  const [destSugs, setDestSugs] = useState<Suggestion[]>([]);

  useEffect(() => {
    setOriginQuery(origin?.name ?? "");
  }, [origin?.name]);
  useEffect(() => {
    setDestQuery(destination?.name ?? "");
  }, [destination?.name]);

  const canRoute = Boolean(origin && destination) && !busy;

  const feedOptions = useMemo(
    () => [
      { id: "ace", label: "Subway (ACE)" },
      { id: "bdfm", label: "Subway (BDFM)" },
      { id: "g", label: "Subway (G)" },
      { id: "jz", label: "Subway (JZ)" },
      { id: "nqrw", label: "Subway (NQRW)" },
      { id: "l", label: "Subway (L)" },
      { id: "123", label: "Subway (1/2/3 + 4/5/6/7)" },
      { id: "si", label: "Subway (SI)" },
    ],
    []
  );

  async function geocode(query: string, setter: (s: Suggestion[]) => void) {
    const q = query.trim();
    if (q.length < 3) {
      setter([]);
      return;
    }
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&limit=6`);
    if (!res.ok) {
      setter([]);
      return;
    }
    const data = (await res.json()) as { results: Suggestion[] };
    setter(data.results ?? []);
  }

  return (
    <aside className="absolute left-3 top-3 z-20 w-[340px] max-w-[calc(100%-1.5rem)] rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">
            Commute + realtime
          </h2>
          <p className="mt-0.5 text-xs text-zinc-600">
            Geocode + route (OSM/OSRM) and MTA subway vehicles (GTFS-RT).
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className="text-xs font-medium text-zinc-700">From</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400"
            value={originQuery}
            onChange={(e) => {
              const v = e.target.value;
              setOriginQuery(v);
              void geocode(v, setOriginSugs);
            }}
            placeholder="e.g. Union Square"
          />
          {originSugs.length > 0 && (
            <div className="mt-1 max-h-40 overflow-auto rounded-md border border-zinc-200 bg-white">
              {originSugs.map((s) => (
                <button
                  key={s.id}
                  className="block w-full px-2 py-1.5 text-left text-xs text-zinc-800 hover:bg-zinc-50"
                  onClick={() => {
                    onChangeOrigin({ name: s.name, lat: s.lat, lng: s.lng });
                    setOriginSugs([]);
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-700">To</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400"
            value={destQuery}
            onChange={(e) => {
              const v = e.target.value;
              setDestQuery(v);
              void geocode(v, setDestSugs);
            }}
            placeholder="e.g. JFK Airport"
          />
          {destSugs.length > 0 && (
            <div className="mt-1 max-h-40 overflow-auto rounded-md border border-zinc-200 bg-white">
              {destSugs.map((s) => (
                <button
                  key={s.id}
                  className="block w-full px-2 py-1.5 text-left text-xs text-zinc-800 hover:bg-zinc-50"
                  onClick={() => {
                    onChangeDestination({
                      name: s.name,
                      lat: s.lat,
                      lng: s.lng,
                    });
                    setDestSugs([]);
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400"
            value={filters.routeProfile}
            onChange={(e) =>
              onChangeFilters({
                ...filters,
                routeProfile: e.target.value as SidebarFilters["routeProfile"],
              })
            }
          >
            <option value="walking">Walking</option>
            <option value="cycling">Cycling</option>
            <option value="driving">Driving</option>
          </select>
          <button
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canRoute}
            onClick={onRoute}
          >
            {busy ? "Routing…" : "Route"}
          </button>
        </div>

        {routeSummary && (
          <div className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700">
            <span className="font-medium text-zinc-900">Route:</span>{" "}
            {formatDistance(routeSummary.distanceMeters)} ·{" "}
            {formatDuration(routeSummary.durationSeconds)}
          </div>
        )}

        <div className="border-t border-zinc-200 pt-3">
          <p className="text-xs font-semibold text-zinc-900">Layers</p>

          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.show311}
              onChange={(e) =>
                onChangeFilters({ ...filters, show311: e.target.checked })
              }
            />
            <span className="text-sm text-zinc-800">311 demo points</span>
          </label>

          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.showMtaSubway}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  showMtaSubway: e.target.checked,
                })
              }
            />
            <span className="text-sm text-zinc-800">MTA subway vehicles</span>
          </label>

          {filters.showMtaSubway && (
            <select
              className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400"
              value={filters.mtaFeed}
              onChange={(e) =>
                onChangeFilters({ ...filters, mtaFeed: e.target.value })
              }
            >
              {feedOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
            {error}
          </div>
        )}
      </div>
    </aside>
  );
}

