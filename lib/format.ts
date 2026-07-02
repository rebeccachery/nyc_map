import type { LayerErrors } from "@/lib/haitianZctaTypes";

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatScore(value: number, digits = 1): string {
  return value.toFixed(digits);
}

export function formatDistance(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

export type ParsedZipLabel = {
  primary: string;
  aliases: string[];
  display: string;
  subtitle: string | null;
};

export function parseModzctaLabel(raw: string | undefined, borough?: string): ParsedZipLabel {
  const parts = String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const primary = parts[0]?.padStart(5, "0") ?? "";
  const aliases = parts.slice(1);

  const subtitleParts: string[] = [];
  if (borough) subtitleParts.push(borough);
  if (aliases.length > 0) {
    subtitleParts.push(`also covers ${aliases.join(", ")}`);
  }

  return {
    primary,
    aliases,
    display: primary ? `ZIP ${primary}` : "NYC",
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(" · ") : null,
  };
}

const LAYER_LABELS: Record<keyof LayerErrors, string> = {
  demographics: "Borough demographics",
  haitianZcta: "ZIP population layer",
  schools: "High schools",
  libraries: "Libraries",
};

export function formatLayerErrorLabel(layer: keyof LayerErrors): string {
  return LAYER_LABELS[layer] ?? layer;
}

export function formatLepPct(limitedEnglish: number, speakers: number): string {
  if (speakers <= 0) return "—";
  return `${formatPct((limitedEnglish / speakers) * 100, 0)} limited English`;
}
