import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AskResponse } from "@/lib/agent/runAgent";
import type { MetroId } from "@/lib/metroRegistry";
import type { QueryEngine } from "@/lib/query/engine";
import { runTool } from "@/lib/query/tools";

export type ToolCall = { tool: string; input: unknown };

export type GoldenQuestion = {
  id: string;
  metro: MetroId;
  category: string;
  question: string;
  interpretation: string;
  reference: ToolCall;
  answer: {
    type: string;
    field?: string;
    n?: number;
    tolerance?: number;
    scoring?: "overlap";
    mustDisclose?: string[];
    mustMention?: string[];
    alternatives?: ToolCall[];
  };
};

export type GoldenFile = { version: number; questions: GoldenQuestion[] };
export type ExpectedFile = { generatedFrom: Record<string, string>; expected: Record<string, unknown> };

export function loadGolden(root = process.cwd()): { golden: GoldenFile; expected: ExpectedFile | null } {
  const golden = JSON.parse(readFileSync(path.join(root, "eval", "golden.json"), "utf8")) as GoldenFile;
  const expPath = path.join(root, "eval", "golden.expected.json");
  const expected = existsSync(expPath) ? (JSON.parse(readFileSync(expPath, "utf8")) as ExpectedFile) : null;
  return { golden, expected };
}

type Data = Record<string, unknown>;
type NearestExpected = { ids: string[]; names: string[]; miles: number };
const zctas = (rows: unknown) => ((rows as { zcta: string }[] | undefined) ?? []).map((r) => r.zcta);

/** The acceptable expected answers: one, or several for ambiguous questions with alternatives. */
export function expectedOptions(want: unknown): unknown[] {
  return want && typeof want === "object" && "anyOf" in (want as object)
    ? (want as { anyOf: unknown[] }).anyOf
    : [want];
}

/** Pulls the comparable answer out of a tool result, per answer type. */
export function extractAnswer(q: GoldenQuestion, data: Data): unknown {
  const a = q.answer;
  switch (a.type) {
    case "value":
      return data[a.field!];
    case "zip_set":
      return data.returned === data.matchCount ? zctas(data.zips).sort() : { incomplete: true };
    case "ranked_zips":
      return zctas(data.zips).slice(0, a.n);
    case "nearest_place": {
      const p = (data.places as { id: string; name: string; distanceMiles: number }[] | undefined)?.[0];
      if (p) return { id: p.id, name: p.name, miles: p.distanceMiles };
      // get_zip also answers "closest library/school to ZIP X" via its nearest lists.
      const kind = (q.reference.input as { kind?: string }).kind;
      const near = (data[kind === "school" ? "nearestSchools" : "nearestLibraries"] as
        | { id: string; name: string; boundaryMiles: number }[]
        | undefined)?.[0];
      return near ? { id: near.id, name: near.name, miles: near.boundaryMiles } : null;
    }
    case "count": {
      if (typeof data.matchCount === "number") return data.matchCount;
      // get_zip also answers "how many libraries/schools within 1 mile of ZIP X".
      const ref = q.reference.input as { kind?: string; withinMiles?: number };
      if (ref.withinMiles === 1) return data[ref.kind === "school" ? "schoolsWithin1Mile" : "librariesWithin1Mile"];
      return undefined;
    }
    case "argmax_region": {
      const rows = data.regions as Data[] | undefined;
      if (!rows?.length) return null;
      const values = Object.fromEntries(rows.map((r) => [r.region, r[a.field!]]));
      const winner = rows.reduce((best, r) => ((r[a.field!] as number) > (best[a.field!] as number) ? r : best));
      return { winner: winner.region, values };
    }
    case "region_values": {
      const [obj, key] = a.field!.split(".");
      const rows = ((data.regions as Data[] | undefined) ?? []).filter((r) => !String(r.region).startsWith("All of"));
      return Object.fromEntries(
        rows.map((r) => [r.region, key ? (r[obj] as Record<string, number>)[key] : (r[obj] as number)])
      );
    }
    default:
      return null;
  }
}

/** JSON with object keys sorted, so key order never affects equality. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

function matchesOne(q: GoldenQuestion, got: unknown, want: unknown): boolean {
  const a = q.answer;
  if (a.type === "value" && typeof want === "number") {
    return typeof got === "number" && Math.abs(got - want) <= (a.tolerance ?? 0) + 1e-9;
  }
  if (a.type === "nearest_place") {
    const g = got as { id: string; miles: number } | null;
    const w = want as NearestExpected;
    return !!g && w.ids.includes(g.id) && Math.abs(g.miles - w.miles) < 0.06;
  }
  if (a.type === "ranked_zips" && a.scoring === "overlap") {
    const g = new Set(got as string[]);
    return (want as string[]).filter((z) => g.has(z)).length >= Math.ceil((a.n ?? 5) * 0.6);
  }
  if (a.type === "argmax_region") {
    return (got as { winner?: string } | null)?.winner === (want as { winner: string }).winner;
  }
  return canonical(got) === canonical(want);
}

/** True when `got` matches the expected answer (or any accepted alternative). */
export function answersMatch(q: GoldenQuestion, got: unknown, want: unknown): boolean {
  return expectedOptions(want).some((w) => matchesOne(q, got, w));
}

// ---------- Answer-text checks ----------

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

/** Numbers written in the text: 19,567 / 33.8 / 34% / "seven". ZIP-like 5-digit codes are excluded. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/g)) {
    const raw = m[0].replace(/,/g, "");
    if (/^(3[34]|1[01])\d{3}$/.test(raw) && !m[0].includes(",")) continue; // a Miami/NYC ZIP, not a quantity
    out.push(Number(raw));
  }
  for (const m of text.toLowerCase().matchAll(/\b([a-z]+)\b/g)) {
    if (m[1] in WORD_NUMBERS) out.push(WORD_NUMBERS[m[1]]);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function mentions(text: string, phrase: string): boolean {
  return ` ${norm(text)} `.includes(` ${norm(phrase)} `);
}

function firstIndex(text: string, zip: string): number {
  const m = new RegExp(`\\b${zip}\\b`).exec(text);
  return m ? m.index : -1;
}

export type TextCheck = { ok: boolean; reason: string };

/** Fields the agent is told to round to whole numbers in prose. */
const ROUNDABLE_FIELDS = new Set(["pctNoInternet", "pctNoHS", "haitianPopPct", "educationNeedScore"]);

function textMatchesOne(q: GoldenQuestion, want: unknown, r: AskResponse): TextCheck {
  const a = q.answer;
  const text = r.answer;
  switch (a.type) {
    case "value": {
      if (typeof want === "string") {
        return mentions(text, want) ? { ok: true, reason: `says "${want}"` } : { ok: false, reason: `doesn't say "${want}"` };
      }
      // The prompt asks for whole-number percentages, so rounded rates and scores are correct text.
      const rounded = ROUNDABLE_FIELDS.has(a.field ?? "") ? 0.5 : 0;
      const tol = Math.max(a.tolerance ?? 0, rounded) + 1e-9;
      const hit = numbersIn(text).some((n) => Math.abs(n - (want as number)) <= tol);
      return hit ? { ok: true, reason: "states the figure" } : { ok: false, reason: `doesn't state ${want}` };
    }
    case "zip_set": {
      const zips = want as string[];
      if (zips.length === 0) {
        return /\b(no|none|zero|0)\b/i.test(text) ? { ok: true, reason: "says none" } : { ok: false, reason: "doesn't say none match" };
      }
      const missing = zips.filter((z) => firstIndex(text, z) < 0);
      return missing.length === 0 ? { ok: true, reason: "names every ZIP" } : { ok: false, reason: `missing ${missing.join(", ")}` };
    }
    case "ranked_zips": {
      const zips = want as string[];
      if (a.scoring === "overlap") {
        const hits = zips.filter((z) => firstIndex(text, z) >= 0).length;
        return hits >= Math.ceil(zips.length * 0.6)
          ? { ok: true, reason: `names ${hits}/${zips.length}` }
          : { ok: false, reason: `names only ${hits}/${zips.length}` };
      }
      const idx = zips.map((z) => firstIndex(text, z));
      if (idx.some((i) => i < 0)) return { ok: false, reason: `missing ${zips.filter((_, i) => idx[i] < 0).join(", ")}` };
      const inOrder = idx.every((v, i) => i === 0 || v > idx[i - 1]);
      return inOrder ? { ok: true, reason: "right ZIPs in order" } : { ok: false, reason: "ZIPs out of order" };
    }
    case "nearest_place": {
      const w = want as NearestExpected;
      return w.names.some((n) => mentions(text, n))
        ? { ok: true, reason: "names the place" }
        : { ok: false, reason: `doesn't name ${w.names.join(" / ")}` };
    }
    case "count":
      return numbersIn(text).includes(want as number)
        ? { ok: true, reason: "states the count" }
        : { ok: false, reason: `doesn't state ${want}` };
    case "argmax_region": {
      const w = want as { winner: string; values: Record<string, number> };
      if (!mentions(text, w.winner)) return { ok: false, reason: `doesn't name ${w.winner}` };
      // The winner should be named before any loser (e.g. "Brooklyn has more… than Queens").
      const wi = norm(text).indexOf(norm(w.winner));
      const loserFirst = Object.keys(w.values).some((r) => r !== w.winner && norm(text).indexOf(norm(r)) >= 0 && norm(text).indexOf(norm(r)) < wi);
      return loserFirst ? { ok: false, reason: "names another region first" } : { ok: true, reason: "names the winner" };
    }
    case "region_values": {
      const w = want as Record<string, number>;
      const nums = numbersIn(text);
      const missing = Object.entries(w).filter(([, v]) => !nums.includes(v));
      return missing.length === 0 ? { ok: true, reason: "states every value" } : { ok: false, reason: `missing ${missing.map(([k, v]) => `${k} ${v}`).join(", ")}` };
    }
    case "refusal": {
      const missing = (a.mustMention ?? []).filter((w) => !text.toLowerCase().includes(w.toLowerCase()));
      return missing.length === 0 ? { ok: true, reason: "explains what's missing" } : { ok: false, reason: `doesn't mention ${missing.join(", ")}` };
    }
    default:
      return { ok: false, reason: `unknown answer type ${a.type}` };
  }
}

/** Does the written answer itself state the expected result (against any accepted reading)? */
export function checkAnswerText(q: GoldenQuestion, want: unknown, r: AskResponse): TextCheck {
  const checks = expectedOptions(want).map((w) => textMatchesOne(q, w, r));
  const best = checks.find((c) => c.ok) ?? checks[0];
  if (best.ok && q.answer.mustDisclose && !r.interpretation.trim()) {
    return { ok: false, reason: "ambiguous question answered without stating the interpretation" };
  }
  return best;
}

// ---------- Scoring one run ----------

export type GoldenScore = {
  id: string;
  category: string;
  /** An agent tool call produced the expected data, with the right status. */
  toolCorrect: boolean;
  /** The written answer states the expected result. */
  textCorrect: boolean;
  /** Both: what a user would count as right. */
  correct: boolean;
  /** No guardrail warnings (dropped citations, unverified ZIPs). */
  grounded: boolean;
  reason: string;
};

/** Tool-level check: did the agent call a tool whose (deterministic) result contains the answer? */
export function scoreToolLevel(
  engine: QueryEngine,
  q: GoldenQuestion,
  want: unknown,
  r: AskResponse
): { correct: boolean; reason: string } {
  if (q.answer.type === "refusal") {
    return r.status === "out_of_scope"
      ? { correct: true, reason: "declined as out of scope" }
      : { correct: false, reason: `expected out_of_scope, got ${r.status}` };
  }
  if (r.status !== "answered") return { correct: false, reason: `status ${r.status}` };
  for (const step of r.trace) {
    if (!step.ok) continue;
    const res = runTool(engine, step.tool, step.input);
    if (res.ok && answersMatch(q, extractAnswer(q, res.data as Data), want)) {
      return { correct: true, reason: `matched via ${step.tool}` };
    }
  }
  return {
    correct: false,
    reason: r.trace.length
      ? `no tool call produced the expected answer (${r.trace.map((t) => t.tool).join(", ")})`
      : "no tool calls",
  };
}

export function scoreRun(engine: QueryEngine, q: GoldenQuestion, want: unknown, r: AskResponse): GoldenScore {
  const tool = scoreToolLevel(engine, q, want, r);
  const text = checkAnswerText(q, want, r);
  const grounded = r.warnings.length === 0;
  const reason = !tool.correct ? `data: ${tool.reason}` : !text.ok ? `text: ${text.reason}` : `ok (${tool.reason}; ${text.reason})`;
  return {
    id: q.id,
    category: q.category,
    toolCorrect: tool.correct,
    textCorrect: text.ok,
    correct: tool.correct && text.ok,
    grounded,
    reason,
  };
}
