import type { ContentBlock, Usage } from "@anthropic-ai/sdk/resources/messages/messages";
import { describe, expect, it } from "vitest";
import type { ModelClient, ModelRequest, ModelResponse } from "@/lib/agent/model";
import { runAgent } from "@/lib/agent/runAgent";
import { loadGolden, scoreToolLevel, type GoldenQuestion } from "@/lib/eval/golden";
import { getEngine } from "@/lib/query/engine";
import { loadSnapshot, snapshotExists } from "@/lib/snapshot/load";

const USAGE = { input_tokens: 10, output_tokens: 10 } as Usage;

/** A fake agent that makes a given tool call, then submits. */
class OneCallModel implements ModelClient {
  private turn = 0;
  constructor(
    private readonly call: { tool: string; input: unknown } | null,
    private readonly status = "answered"
  ) {}
  async createMessage(_req: ModelRequest): Promise<ModelResponse> {
    void _req;
    this.turn++;
    const submit = {
      type: "tool_use",
      id: "tu_submit",
      name: "submit_answer",
      input: { status: this.status, answer: "x", interpretation: "Read as the whole metro.", citations: [], show_map: true, follow_ups: [] },
    };
    const content = this.turn === 1 && this.call
      ? [{ type: "tool_use", id: "tu_1", name: this.call.tool, input: this.call.input }]
      : [submit];
    return { content: content as ContentBlock[], stop_reason: "tool_use", usage: USAGE };
  }
}

const { golden, expected } = loadGolden();
const ready = !!expected && snapshotExists("miami") && snapshotExists("nyc");

describe.skipIf(!ready)("tool-level scorer", () => {
  const score = async (q: GoldenQuestion, model: ModelClient) => {
    const engine = getEngine(loadSnapshot(q.metro));
    return scoreToolLevel(engine, q, expected!.expected[q.id], await runAgent(engine, model, q.question));
  };

  it("gives full marks to an agent that makes the reference call", async () => {
    for (const q of golden.questions) {
      const s = await score(q, new OneCallModel(q.reference, q.answer.type === "refusal" ? "out_of_scope" : "answered"));
      expect(s.correct, `${q.id}: ${s.reason}`).toBe(true);
    }
  });

  it("fails an agent that answers without tools, or with the wrong filter", async () => {
    const g07 = golden.questions.find((q) => q.id === "G07")!;
    expect((await score(g07, new OneCallModel(null))).correct).toBe(false);
    const wrong = { tool: "find_zips", input: { need: { tiers: ["high"] }, access: [{ kind: "library", withinMiles: 2, has: false }], limit: 200 } };
    expect((await score(g07, new OneCallModel(wrong))).reason).toMatch(/no tool call produced/);
  });

  it("fails an out-of-scope question that gets answered anyway", async () => {
    const g15 = golden.questions.find((q) => q.answer.type === "refusal")!;
    const s = await score(g15, new OneCallModel({ tool: "find_zips", input: {} }, "answered"));
    expect(s).toMatchObject({ correct: false, reason: "expected out_of_scope, got answered" });
  });

  it("accepts the nearest library found through get_zip", async () => {
    const g30 = golden.questions.find((q) => q.id === "G30")!;
    const s = await score(g30, new OneCallModel({ tool: "get_zip", input: { zcta: "33127" } }));
    expect(s).toMatchObject({ correct: true, reason: "matched via get_zip" });
  });

  it("accepts a within-1-mile count read from get_zip", async () => {
    const g26 = golden.questions.find((q) => q.id === "G26")!;
    const s = await score(g26, new OneCallModel({ tool: "get_zip", input: { zcta: "33311" } }));
    expect(s).toMatchObject({ correct: true, reason: "matched via get_zip" });
  });

  it("rejects a truncated ZIP list for set questions", async () => {
    const g07 = golden.questions.find((q) => q.id === "G07")!;
    const truncated = { tool: "find_zips", input: { ...(g07.reference.input as object), limit: 3 } };
    expect((await score(g07, new OneCallModel(truncated))).correct).toBe(false);
  });
});
