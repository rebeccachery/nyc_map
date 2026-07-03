import {
  formatCount,
  formatPct,
  formatScore,
  type ParsedZipLabel,
} from "@/lib/format";
import {
  getActiveNeedFromProperties,
  tierLabel,
  type NeedScoreMode,
} from "@/lib/haitianNeed";

type ZctaHoverProps = Record<string, unknown> & {
  zcta?: string;
  label?: string;
  haitianPop?: number;
  haitianPopPct?: number;
  speakers?: number;
  pctNoInternet?: number;
};

export function buildZctaHoverText(props: ZctaHoverProps, mode: NeedScoreMode): string {
  const zcta = String(props.zcta ?? "");
  const active = getActiveNeedFromProperties(props, mode);

  const lines = [
    `<b>ZIP ${zcta}</b> · ${tierLabel(active.needTier)}`,
    `<span style="color:#a1a1aa">────────────────────</span>`,
    `Haitian ancestry&nbsp;&nbsp;&nbsp;&nbsp;<b>${formatCount(Number(props.haitianPop ?? 0))}</b> (${formatPct(Number(props.haitianPopPct ?? 0))})`,
  ];

  if (mode === "education") {
    lines.push(`Need score&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>${formatScore(active.scoreValue)}</b> / 100`);
  }

  lines.push(
    `Creole speakers&nbsp;&nbsp;&nbsp;&nbsp;<b>${formatCount(Number(props.speakers ?? 0))}</b>`,
    `No internet&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>${formatPct(Number(props.pctNoInternet ?? 0))}</b>`,
    `<span style="color:#71717a;font-size:11px"><i>Click for full details</i></span>`
  );

  return lines.join("<br>");
}

export function buildSchoolHoverText(props: Record<string, unknown>): string {
  const gradRate = parseFloat(String(props.graduation_rate ?? 0)) || 0;
  const hasGradRate = props.graduation_rate !== undefined && props.graduation_rate !== null;
  const gradPercent = hasGradRate ? `${Math.round(gradRate * 100)}%` : "N/A";
  const gradColor = gradRate < 0.6 ? "#ef4444" : gradRate < 0.8 ? "#f59e0b" : "#10b981";

  const lines = [`<b>${props.school_name}</b>`];

  if (props.neighborhood) {
    lines.push(`Neighborhood&nbsp;&nbsp;<b>${props.neighborhood}</b>`);
  } else if (props.county) {
    lines.push(`County&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>${props.county}</b>`);
  }

  if (props.primary_address_line_1) {
    lines.push(`Address&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>${props.primary_address_line_1}</b>`);
  }

  if (hasGradRate) {
    lines.push(
      `Graduation rate&nbsp;<span style="color:${gradColor}"><b>${gradPercent}</b></span>`,
      `Safety&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>${props.pct_stu_safe ? `${Math.round(parseFloat(String(props.pct_stu_safe)) * 100)}%` : "N/A"}</b>`,
      `Attendance&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>${props.attendance_rate ? `${Math.round(parseFloat(String(props.attendance_rate)) * 100)}%` : "N/A"}</b>`
    );
  } else if (props.grades || props.school_type) {
    lines.push(`Grades&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>${props.grades || props.school_type}</b>`);
  }

  return lines.join("<br>");
}

export function buildLibraryHoverText(props: Record<string, unknown>): string {
  return (
    `<b>${props.name} Library</b><br>` +
    `${props.streetAddress}, ${props.city}<br>` +
    `<span style="color:#71717a;font-size:11px"><i>Free tutoring & literacy support</i></span>`
  );
}

export function buildRegionHoverText(item: {
  regionName: string;
  haitianPop: number;
  speakers: number;
  limitedEnglish: number;
  pctNoInternet: number;
  pctNoHS: number;
}): string {
  return (
    `<b>${item.regionName}</b><br>` +
    `Haitian ancestry&nbsp;&nbsp;&nbsp;&nbsp;<b>${formatCount(item.haitianPop)}</b><br>` +
    `Creole speakers&nbsp;&nbsp;&nbsp;&nbsp;<b>${formatCount(item.speakers)}</b><br>` +
    `Limited English&nbsp;&nbsp;&nbsp;&nbsp;<b>${formatCount(item.limitedEnglish)}</b><br>` +
    `No internet&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>${formatPct(item.pctNoInternet)}</b><br>` +
    `No HS diploma&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>${formatPct(item.pctNoHS)}</b>`
  );
}

/** @deprecated Use buildRegionHoverText */
export function buildBoroughHoverText(item: {
  boroughName: string;
  haitianPop: number;
  speakers: number;
  limitedEnglish: number;
  pctNoInternet: number;
  pctNoHS: number;
}): string {
  return buildRegionHoverText({ ...item, regionName: item.boroughName });
}

export type MapStatusProps = {
  selectedZcta: string | null;
  selectedLabel?: ParsedZipLabel | null;
  needScoreMode: NeedScoreMode;
  loadingHaitianZcta?: boolean;
  activeNeedTier?: string | null;
  metroLabel?: string;
  boundaryFootnote?: string;
};

export function getMapStatusLines({
  selectedZcta,
  selectedLabel,
  needScoreMode,
  loadingHaitianZcta,
  activeNeedTier,
  metroLabel = "this metro",
  boundaryFootnote = "U.S. Census ACS 2022 · ZIP code areas",
}: MapStatusProps): { title: string; body: string; footnote: string } {
  if (loadingHaitianZcta) {
    return {
      title: "Loading map data",
      body: `Fetching Census estimates for ${metroLabel} ZIP codes…`,
      footnote: "This may take up to 30 seconds on first load.",
    };
  }

  if (selectedZcta && activeNeedTier) {
    return {
      title: selectedLabel?.display ?? `ZIP ${selectedZcta}`,
      body: `${activeNeedTier} · ${needScoreMode === "education" ? "Educational need view" : "Population view"}`,
      footnote: boundaryFootnote,
    };
  }

  return {
    title: "Haitian Educational Equity Map",
    body: "Click a ZIP code on the map or search in the sidebar to explore neighborhood details.",
    footnote: boundaryFootnote,
  };
}
