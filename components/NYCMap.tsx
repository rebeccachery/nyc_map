"use client";

import dynamic from "next/dynamic";
import type { NYCMapCoreProps } from "./NYCMapCore";

const NYCMapCore = dynamic(() => import("./NYCMapCore"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[100vh] w-full items-center justify-center bg-zinc-100 text-zinc-600">
      Loading map…
    </div>
  ),
});

export type NYCMapProps = NYCMapCoreProps;

export default function NYCMap(props: NYCMapProps) {
  return <NYCMapCore {...props} />;
}
