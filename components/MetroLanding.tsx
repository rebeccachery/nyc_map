"use client";

import Link from "next/link";
import { useEffect } from "react";
import { getLastMetroId, setLastMetroId } from "@/lib/metroPreferences";
import { METROS, type MetroId } from "@/lib/metroRegistry";

function MetroCard({ metro }: { metro: (typeof METROS)[number] }) {
  const isLive = metro.status === "live";

  const inner = (
    <div
      className={`group flex h-full flex-col rounded-2xl border p-5 transition ${
        isLive
          ? "border-zinc-800 bg-zinc-900/40 hover:border-orange-500/40 hover:bg-zinc-900/70"
          : "cursor-not-allowed border-zinc-800/60 bg-zinc-900/20 opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">{metro.label}</h2>
          {metro.haitianAncestryHint && (
            <p className="mt-1 text-xs text-zinc-500">{metro.haitianAncestryHint}</p>
          )}
        </div>
        {!isLive && (
          <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Coming soon
          </span>
        )}
      </div>
      <p className="mt-3 flex-1 text-xs leading-relaxed text-zinc-400">{metro.ui.tagline}</p>
      <p className="mt-4 text-[11px] font-medium text-zinc-500">
        {metro.regions.length} {metro.ui.regionLabel}
        {metro.regions.length === 1 ? "" : "s"}
        {isLive ? (
          <span className="text-orange-400 group-hover:text-orange-300"> · Open map →</span>
        ) : null}
      </p>
    </div>
  );

  if (!isLive) return inner;

  return (
    <Link
      href={`/map/${metro.id}`}
      onClick={() => setLastMetroId(metro.id)}
      className="block h-full outline-none focus-visible:rounded-2xl focus-visible:ring-2 focus-visible:ring-orange-500/50"
    >
      {inner}
    </Link>
  );
}

export default function MetroLanding() {
  const lastMetroId = getLastMetroId();
  const lastMetro = METROS.find((m) => m.id === lastMetroId && m.status === "live");

  useEffect(() => {
    document.title = "Haitian Educational Equity Map";
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="w-full max-w-3xl">
        <div className="text-center">
          <h1 className="bg-gradient-to-r from-orange-400 via-amber-300 to-cyan-300 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-3xl">
            Haitian Educational Equity Map
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
            Explore Haitian population density and educational support gaps by ZIP code, with
            schools and libraries overlaid. Choose a metro area to begin.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {METROS.map((metro) => (
            <MetroCard key={metro.id} metro={metro} />
          ))}
        </div>

        {lastMetro && (
          <div className="mt-8 text-center">
            <Link
              href={`/map/${lastMetro.id as MetroId}`}
              className="text-xs font-semibold text-orange-400 transition hover:text-orange-300"
            >
              Continue with {lastMetro.label} →
            </Link>
          </div>
        )}

        <p className="mt-10 text-center text-[11px] leading-relaxed text-zinc-600">
          U.S. Census ACS 2022 · Public geographic and education datasets · Same scoring methodology
          across metros
        </p>
      </div>
    </div>
  );
}
