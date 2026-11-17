/**
 * Cross-checks the TypeScript query engine against eval/golden.expected.json, which
 * eval/ground_truth.py computes with an independent Python/Shapely implementation.
 * Disagreement means one of the two implementations is wrong.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getEngine } from "@/lib/query/engine";
import { runTool, type ToolSuccess } from "@/lib/query/tools";
import { answersMatch, expectedOptions, extractAnswer, type GoldenQuestion } from "@/lib/eval/golden";
import type { MetroId } from "@/lib/metroRegistry";
import { loadSnapshot, snapshotExists } from "@/lib/snapshot/load";

type Question = GoldenQuestion;

const root = path.resolve(import.meta.dirname, "../..");
const golden = JSON.parse(readFileSync(path.join(root, "eval/golden.json"), "utf8")) as {
  questions: Question[];
};
const expectedPath = path.join(root, "eval/golden.expected.json");
const ready =
  existsSync(expectedPath) && snapshotExists("miami") && snapshotExists("nyc");

type Data = Record<string, unknown>;
describe("golden set", () => {
  it("has unique ids and covers every category", () => {
    const ids = golden.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(golden.questions.map((q) => q.category));
    for (const c of ["lookup", "filter_rank", "spatial", "compound", "compare", "ambiguous", "out_of_scope"]) {
      expect(cats).toContain(c);
    }
  });
});

describe.skipIf(!ready)("golden set: engine agrees with independent ground truth", () => {
  const expected = ready
    ? (JSON.parse(readFileSync(expectedPath, "utf8")) as {
        generatedFrom: Record<string, string>;
        expected: Record<string, unknown>;
      })
    : { generatedFrom: {}, expected: {} };

  it("expected answers were generated from the current snapshots", () => {
    for (const [metro, createdAt] of Object.entries(expected.generatedFrom)) {
      expect(createdAt, `re-run python3 eval/ground_truth.py for ${metro}`).toBe(
        loadSnapshot(metro as MetroId).manifest.createdAt
      );
    }
  });

  for (const q of golden.questions) {
    it(`${q.id} [${q.category}] ${q.question}`, () => {
      const engine = getEngine(loadSnapshot(q.metro));
      const result = runTool(engine, q.reference.tool, q.reference.input);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      const data = (result as ToolSuccess<Data>).data;
      const want = expected.expected[q.id];

      if (q.answer.type === "refusal") {
        const notIn = (data.notInThisData as string[]).join(" ");
        // The data description must list the missing topic, so the agent can ground its refusal.
        for (const topic of q.answer.mustMention ?? []) expect(notIn.toLowerCase()).toContain(topic.toLowerCase());
        return;
      }
      const got = extractAnswer(q, data);
      expect(
        answersMatch(q, got, want),
        `${q.id}: engine ${JSON.stringify(got)} vs ground truth ${JSON.stringify(want)}`
      ).toBe(true);
      // Alternatives (ambiguous questions) must also be computable by the engine.
      for (const alt of q.answer.alternatives ?? []) {
        const res = runTool(engine, alt.tool, alt.input);
        expect(res.ok).toBe(true);
        const altGot = extractAnswer(q, (res as ToolSuccess<Data>).data);
        expect(expectedOptions(want).some((w) => JSON.stringify(w) === JSON.stringify(altGot))).toBe(true);
      }
    });
  }
});
