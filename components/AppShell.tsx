"use client";

import MetroSwitcher from "@/components/MetroSwitcher";
import type { MetroConfig } from "@/lib/metroRegistry";

type AppShellProps = {
  metro: MetroConfig;
  children: React.ReactNode;
};

export default function AppShell({ metro, children }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      <header className="relative z-30 shrink-0 border-b border-zinc-800/80 bg-zinc-950/95 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="bg-gradient-to-r from-orange-400 via-amber-300 to-cyan-300 bg-clip-text text-sm font-extrabold tracking-tight text-transparent sm:text-base">
              Haitian Educational Equity Map
            </h1>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
              <span className="font-medium text-zinc-400">{metro.label}</span>
              <span className="mx-1.5 text-zinc-700">·</span>
              {metro.ui.tagline}
            </p>
          </div>
          <MetroSwitcher activeMetroId={metro.id} className="flex w-full shrink-0 sm:w-auto sm:min-w-[220px]" />
        </div>
      </header>
      <main className="relative min-h-0 flex-1">{children}</main>
    </div>
  );
}
