"use client";

import Link from "next/link";
import { METROS, type MetroConfig, type MetroId } from "@/lib/metroRegistry";

type MetroSwitcherProps = {
  activeMetroId: MetroId;
  className?: string;
};

function segmentClass(isActive: boolean, isDisabled: boolean): string {
  if (isDisabled) {
    return "cursor-not-allowed bg-zinc-900/40 text-zinc-600";
  }
  if (isActive) {
    return "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30";
  }
  return "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200";
}

function MetroSegment({ metro, isActive }: { metro: MetroConfig; isActive: boolean }) {
  return (
    <Link
      href={`/map/${metro.id}`}
      role="tab"
      aria-selected={isActive}
      className={`flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition ${segmentClass(isActive, false)}`}
    >
      {metro.shortLabel}
    </Link>
  );
}

export default function MetroSwitcher({ activeMetroId, className }: MetroSwitcherProps) {
  return (
    <div
      className={className ?? "flex rounded-xl border border-zinc-800 bg-zinc-900/50 p-1"}
      role="tablist"
      aria-label="Select metro area"
    >
      {METROS.map((metro) => (
        <MetroSegment key={metro.id} metro={metro} isActive={metro.id === activeMetroId} />
      ))}
    </div>
  );
}
