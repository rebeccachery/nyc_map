import type { AskResponse } from "@/lib/agent/runAgent";
import { checkAnswerText, expectedOptions, numbersIn, type GoldenQuestion } from "@/lib/eval/golden";

/**
 * Scorer self-test: corrupts real answers the way an LLM plausibly goes wrong and counts how
 * many corruptions the answer-text check catches. A perfect eval score means little if the
 * scorer can't tell a wrong answer from a right one.
 */
type Mutation = { name: string; apply: (text: string, q: GoldenQuestion, want: unknown) => string | null };

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

function replaceAll(text: string, from: string, to: string): string {
  return text.split(from).join(to);
}

function bumpNumber(text: string, value: number): string | null {
  const hit = numbersIn(text).find((n) => Math.abs(n - value) <= 0.6);
  if (hit === undefined) return null;
  const bumped = Math.round(hit) + 7;
  let out = replaceAll(text, hit.toLocaleString("en-US"), bumped.toLocaleString("en-US"));
  out = replaceAll(out, String(hit), String(bumped));
  out = out.replace(new RegExp(`\\b${Math.round(hit)}%`, "g"), `${bumped}%`);
  const word = NUMBER_WORDS[Math.round(hit)];
  if (word) out = out.replace(new RegExp(`\\b${word}\\b`, "gi"), String(bumped));
  return out;
}

export const MUTATIONS: Mutation[] = [
  {
    name: "Changed a key number",
    apply: (t, q, w) => {
      if (!["value", "count", "region_values"].includes(q.answer.type) || typeof w !== "number" && q.answer.type !== "region_values") return null;
      const target = q.answer.type === "region_values" ? Object.values(w as Record<string, number>)[0] : (w as number);
      return bumpNumber(t, target);
    },
  },
  {
    name: "Dropped a ZIP from a list",
    apply: (t, q, w) => {
      const list = Array.isArray(w) ? (w as string[]) : [];
      if (!list.length || !(q.answer.type === "zip_set" || (q.answer.type === "ranked_zips" && !q.answer.scoring))) return null;
      return replaceAll(t, list[list.length - 1], "[removed]");
    },
  },
  {
    name: "Swapped two ranked ZIPs",
    apply: (t, q, w) => {
      if (q.answer.type !== "ranked_zips" || q.answer.scoring) return null;
      const [a, b] = w as string[];
      return replaceAll(replaceAll(replaceAll(t, a, "\u0000"), b, a), "\u0000", b);
    },
  },
  {
    name: "Named the wrong place",
    apply: (t, q, w) => {
      if (q.answer.type !== "nearest_place") return null;
      let out = t;
      for (const n of (w as { names: string[] }).names) out = replaceAll(out, n, "Riverside Branch");
      return out;
    },
  },
  {
    name: "Picked the wrong region",
    apply: (t, q, w) => {
      if (q.answer.type !== "argmax_region") return null;
      const { winner, values } = w as { winner: string; values: Record<string, number> };
      const loser = Object.keys(values).find((r) => r !== winner)!;
      return replaceAll(replaceAll(replaceAll(t, winner, "\u0000"), loser, winner), "\u0000", loser);
    },
  },
  {
    name: "Flipped a need tier",
    apply: (t, _q, w) => (typeof w === "string" ? t.replace(/\bhigh\b/gi, "medium") : null),
  },
];

export type MutationResult = { name: string; tried: number; caught: number };

export function runMutations(rows: { question: GoldenQuestion; response: AskResponse; want: unknown }[]): MutationResult[] {
  return MUTATIONS.map((m) => {
    let tried = 0;
    let caught = 0;
    for (const { question, response, want } of rows) {
      if (expectedOptions(want).length !== 1 || want === null) continue; // skip multi-reading questions
      if (!checkAnswerText(question, want, response).ok) continue; // only corrupt answers that passed
      const corrupted = m.apply(response.answer, question, want);
      if (!corrupted || corrupted === response.answer) continue;
      tried++;
      if (!checkAnswerText(question, want, { ...response, answer: corrupted }).ok) caught++;
    }
    return { name: m.name, tried, caught };
  });
}

/** Directional or neighbourhood claims no tool returns; the data has no such descriptions. */
const GEOGRAPHY = /\b(north(?:ern|east|west)?|south(?:ern|east|west)?|east(?:ern)?|west(?:ern)?|central|coastal|inland|downtown|suburb(?:an|s)?)\b/; // lowercase only: capitalised words are place names ("Central Park Library")

export function unsupportedGeography(answer: string): string | null {
  const m = answer.match(GEOGRAPHY);
  return m ? m[0] : null;
}
