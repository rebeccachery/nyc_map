import { describe, expect, it } from "vitest";
import type { AskResponse } from "@/lib/agent/runAgent";
import { answersMatch, checkAnswerText, numbersIn, type GoldenQuestion } from "@/lib/eval/golden";

const q = (answer: GoldenQuestion["answer"]): GoldenQuestion => ({
  id: "T",
  metro: "miami",
  category: "x",
  question: "",
  interpretation: "",
  reference: { tool: "find_zips", input: {} },
  answer,
});
const resp = (answer: string, interpretation = ""): AskResponse =>
  ({ answer, interpretation, warnings: [], diagnostics: [] }) as unknown as AskResponse;

describe("numbersIn", () => {
  it("reads counts, decimals, percents and small number words, but not ZIP codes", () => {
    expect(numbersIn("About 19,567 people (37%) in 33161; score 95.8; seven libraries")).toEqual([19567, 37, 95.8, 7]);
  });
  it("keeps 5-digit quantities that aren't Miami/NYC ZIPs", () => {
    expect(numbersIn("19567 residents")).toEqual([19567]);
  });
});

describe("checkAnswerText", () => {
  it("accepts a rounded percentage within tolerance", () => {
    const question = q({ type: "value", field: "pctNoInternet", tolerance: 0.6 });
    expect(checkAnswerText(question, 33.79, resp("About 34% of households")).ok).toBe(true);
    expect(checkAnswerText(question, 33.79, resp("About 31% of households")).ok).toBe(false);
  });

  it("accepts whole-number rounding of rates even when the question's tolerance is tighter", () => {
    const question = q({ type: "value", field: "pctNoInternet", tolerance: 0.1 });
    expect(checkAnswerText(question, 33.7957, resp("About 34%")).ok).toBe(true);
    expect(checkAnswerText(question, 33.7957, resp("About 35%")).ok).toBe(false);
  });

  it("requires exact counts", () => {
    const question = q({ type: "value", field: "haitianPop", tolerance: 0 });
    expect(checkAnswerText(question, 19567, resp("19,567 residents")).ok).toBe(true);
    expect(checkAnswerText(question, 19567, resp("about 19,600 residents")).ok).toBe(false);
  });

  it("checks tier words", () => {
    const question = q({ type: "value", field: "educationNeedTier" });
    expect(checkAnswerText(question, "high", resp("Yes, it is High Need.")).ok).toBe(true);
    expect(checkAnswerText(question, "high", resp("It is medium need.")).ok).toBe(false);
  });

  it("requires every ZIP of a set, and 'none' for an empty set", () => {
    const question = q({ type: "zip_set" });
    expect(checkAnswerText(question, ["33311", "33313"], resp("33313 and 33311.")).ok).toBe(true);
    expect(checkAnswerText(question, ["33311", "33313"], resp("Only 33311.")).reason).toBe("missing 33313");
    expect(checkAnswerText(question, [], resp("No ZIPs match.")).ok).toBe(true);
  });

  it("requires ranked ZIPs in order, unless scored by overlap", () => {
    const ranked = q({ type: "ranked_zips", n: 3 });
    expect(checkAnswerText(ranked, ["33161", "33162", "33313"], resp("1. 33161 2. 33162 3. 33313")).ok).toBe(true);
    expect(checkAnswerText(ranked, ["33161", "33162", "33313"], resp("33162, 33161, 33313")).reason).toBe("ZIPs out of order");
    const overlap = q({ type: "ranked_zips", n: 5, scoring: "overlap" });
    expect(checkAnswerText(overlap, ["1", "2", "3", "4", "5"].map((d) => `3316${d}`), resp("33161, 33162, 33163")).ok).toBe(true);
  });

  it("accepts any tied nearest place", () => {
    const question = q({ type: "nearest_place" });
    const want = { ids: ["a", "b"], names: ["Jamaica Bay", "Canarsie"], miles: 0 };
    expect(checkAnswerText(question, want, resp("The Canarsie branch is inside the ZIP.")).ok).toBe(true);
  });

  it("wants the winner named first in a comparison", () => {
    const question = q({ type: "argmax_region", field: "haitianPop" });
    const want = { winner: "Brooklyn", values: { Brooklyn: 70920, Queens: 34216 } };
    expect(checkAnswerText(question, want, resp("Brooklyn has more (70,920) than Queens.")).ok).toBe(true);
    expect(checkAnswerText(question, want, resp("Queens has fewer than Brooklyn.")).ok).toBe(false);
  });

  it("needs every county value", () => {
    const question = q({ type: "region_values", field: "libraries" });
    const want = { "Miami-Dade": 50, Broward: 44, "Palm Beach": 19 };
    expect(checkAnswerText(question, want, resp("Miami-Dade 50, Broward 44, Palm Beach 19.")).ok).toBe(true);
    expect(checkAnswerText(question, want, resp("Miami-Dade 50, Broward 44.")).ok).toBe(false);
  });

  it("requires refusals to name the missing topic", () => {
    const question = q({ type: "refusal", mustMention: ["crime"] });
    expect(checkAnswerText(question, null, resp("This map has no crime data.")).ok).toBe(true);
    expect(checkAnswerText(question, null, resp("I can't help with that.")).ok).toBe(false);
  });

  it("requires ambiguous questions to state an interpretation", () => {
    const question = q({ type: "ranked_zips", n: 2, scoring: "overlap", mustDisclose: ["x"] });
    expect(checkAnswerText(question, ["33161", "33162"], resp("33161 and 33162.")).ok).toBe(false);
    expect(checkAnswerText(question, ["33161", "33162"], resp("33161 and 33162.", "Read as count.")).ok).toBe(true);
  });

  it("matches any accepted reading", () => {
    const question = q({ type: "ranked_zips", n: 2 });
    const want = { anyOf: [["33161", "33162"], ["33168", "33150"]] };
    expect(checkAnswerText(question, want, resp("33168 then 33150")).ok).toBe(true);
    expect(answersMatch(question, ["33168", "33150"], want)).toBe(true);
  });
});

describe("scorer self-test helpers", async () => {
  const { runMutations, unsupportedGeography } = await import("@/lib/eval/mutations");

  it("flags descriptive geography but not place names", () => {
    expect(unsupportedGeography("Need is concentrated in the western ZIPs.")).toBe("western");
    expect(unsupportedGeography("Lauderhill Central Park Library and South Dade Regional.")).toBeNull();
  });

  it("catches corrupted numbers, ZIP lists and rankings", () => {
    const rows = [
      { question: q({ type: "count" }), response: resp("Seven libraries are nearby."), want: 7 },
      { question: q({ type: "zip_set" }), response: resp("33311 and 33313."), want: ["33311", "33313"] },
      { question: q({ type: "ranked_zips", n: 2 }), response: resp("33161, then 33162."), want: ["33161", "33162"] },
    ];
    const results = runMutations(rows);
    for (const r of results.filter((x) => x.tried > 0)) expect(r.caught, r.name).toBe(r.tried);
    expect(results.find((r) => r.name === "Changed a key number")!.tried).toBe(1);
  });
});
