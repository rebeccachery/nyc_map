import type { ContentBlock, StopReason, Usage } from "@anthropic-ai/sdk/resources/messages/messages";
import { describe, expect, it } from "vitest";
import type { ModelClient, ModelRequest, ModelResponse } from "@/lib/agent/model";
import { estimateCost } from "@/lib/agent/model";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { answerProblem, MAX_QUESTION_CHARS, runAgent } from "@/lib/agent/runAgent";
import { QueryEngine } from "@/lib/query/engine";
import { buildSnapshot } from "@/lib/snapshot/build";
import { buildMiniLibraries, buildMiniSchools, buildMiniZcta } from "../fixtures/miniMetro";

const engine = new QueryEngine(
  buildSnapshot({
    metro: "miami",
    zcta: buildMiniZcta(),
    libraries: buildMiniLibraries(),
    schools: buildMiniSchools(),
    createdAt: "2026-11-13T00:00:00.000Z",
  })
);

const USAGE: Usage = {
  input_tokens: 1000,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 3000,
  cache_creation: null,
  inference_geo: null,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: "standard",
  speed: null,
};

type Turn = { content: unknown[]; stop_reason?: StopReason };

/** Plays back scripted model turns and records every request. */
class ScriptedModel implements ModelClient {
  readonly requests: ModelRequest[] = [];
  constructor(private readonly turns: Turn[]) {}
  async createMessage(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(structuredClone(request));
    const turn = this.turns[this.requests.length - 1];
    if (!turn) throw new Error("ScriptedModel ran out of turns");
    const content = turn.content as ContentBlock[];
    const stop = turn.stop_reason ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn");
    return { content, stop_reason: stop, usage: USAGE };
  }
}

const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input, caller: { type: "direct" } });
const submit = (id: string, input: Record<string, unknown>) =>
  toolUse(id, "submit_answer", {
    status: "answered",
    interpretation: "",
    citations: [],
    show_map: true,
    follow_ups: [],
    ...input,
  });

const FLAGSHIP = { need: { tiers: ["high", "medium"] }, access: [{ kind: "library", withinMiles: 0.1, has: false }] };

function flagshipMatches(): string[] {
  return engine
    .findZips({ need: { tiers: ["high", "medium"] }, access: [{ kind: "library", withinMiles: 0.1, has: false }] })
    .matches.map((m) => m.zcta);
}

describe("runAgent: happy path", () => {
  const zips = flagshipMatches();
  const model = new ScriptedModel([
    { content: [{ type: "text", text: "Let me look." }, toolUse("tu_1", "find_zips", FLAGSHIP)] },
    {
      content: [
        submit("tu_2", {
          answer: `${zips.length} ZIPs match, led by ${zips[0]}.`,
          citations: [`zip:${zips[0]}`, "zip:99999"],
          follow_ups: ["a", "b", "c", "d"],
        }),
      ],
    },
  ]);
  const run = runAgent(engine, model, "Which ZIPs have need and no library nearby?");

  it("answers with checked citations, the chosen map, and tool-provided assumptions", async () => {
    const r = await run;
    expect(r.status).toBe("answered");
    expect(r.citations.map((c) => c.id)).toEqual([`zip:${zips[0]}`]);
    expect(r.citations[0].label).toMatch(/^ZIP \d{5} \(/);
    expect(r.warnings.join(" ")).toMatch(/Dropped citations.*zip:99999/);
    expect(r.map?.highlightZips).toEqual(zips);
    expect(r.assumptions.join(" ")).toMatch(/top third of reliable ZIPs/);
    expect(r.assumptions.join(" ")).toMatch(/nearest edge/);
    // Census + boundaries for the ZIPs, plus the library datasets the distance filter used.
    expect(r.sources.map((s) => s.id)).toEqual(["census-acs5-2022", "tiger-zcta", "mdc-libraries", "broward-libraries", "pbc-libraries"]);
    expect(r.followUps).toHaveLength(3);
    expect(r.trace).toMatchObject([{ tool: "find_zips", ok: true, matchCount: zips.length }]);
    expect(r.modelTurns).toBe(2);
  });

  it("sends the system prompt, all tools with caching on the last, and tool results back", async () => {
    await run;
    const [first, second] = model.requests;
    expect((first.system as { text: string }[])[0].text).toMatch(/Haitian Educational Equity Map/);
    const names = first.tools!.map((t) => (t as { name: string }).name);
    expect(names).toEqual(["find_zips", "get_zip", "find_places", "summarize_regions", "describe_data", "submit_answer"]);
    expect((first.tools!.at(-1) as { cache_control?: unknown }).cache_control).toEqual({ type: "ephemeral" });
    expect((first.tools!.at(-1) as { strict?: boolean }).strict).toBe(true);
    expect(first).not.toHaveProperty("temperature");

    const lastUser = second.messages.at(-1)!;
    const block = (lastUser.content as { type: string; tool_use_id: string; content: string }[])[0];
    expect(block).toMatchObject({ type: "tool_result", tool_use_id: "tu_1" });
    const payload = JSON.parse(block.content);
    expect(payload.data.matchCount).toBe(zips.length);
    expect(payload).not.toHaveProperty("map"); // map stays server-side
  });

  it("prices the run from token usage", async () => {
    const r = await run;
    expect(r.costUsd).toBeCloseTo(
      estimateCost("claude-haiku-5-5", { inputTokens: 2000, outputTokens: 400, cacheReadTokens: 6000, cacheWriteTokens: 0 }),
      6
    );
  });
});

describe("runAgent: guardrails", () => {
  it("returns tool errors to the model with is_error and lets it recover", async () => {
    const model = new ScriptedModel([
      { content: [toolUse("tu_1", "find_zips", { regions: ["Miami"] })] },
      { content: [toolUse("tu_2", "find_zips", {})] },
      { content: [submit("tu_3", { answer: "Done." })] },
    ]);
    const r = await runAgent(engine, model, "Need in Miami?");
    const errBlock = (model.requests[1].messages.at(-1)!.content as { is_error?: boolean; content: string }[])[0];
    expect(errBlock.is_error).toBe(true);
    expect(JSON.parse(errBlock.content).hint).toMatch(/Omit "regions"/);
    expect(r.trace.map((t) => t.ok)).toEqual([false, true]);
    expect(r.status).toBe("answered");
  });

  it("sends back an answer naming a ZIP no tool returned, and flags it if the rewrite still does", async () => {
    const bad = "33900 is fine but 33499 is worse.";
    const model = new ScriptedModel([
      { content: [toolUse("tu_1", "get_zip", { zcta: "33900" })] },
      { content: [submit("tu_2", { answer: bad, citations: ["zip:33900"] })] },
      { content: [submit("tu_3", { answer: bad, citations: ["zip:33900"] })] },
    ]);
    const r = await runAgent(engine, model, "Tell me about 33900");
    const rejection = (model.requests[2].messages.at(-1)!.content as { content: string }[])[0];
    expect(rejection.content).toMatch(/ZIP codes no tool returned \(33499\)/);
    expect(r.warnings.join(" ")).toMatch(/no tool returned: 33499/);
    expect(r.warnings.join(" ")).not.toMatch(/33900/);
  });

  it("keeps the clean rewrite after a ZIP rejection", async () => {
    const model = new ScriptedModel([
      { content: [toolUse("tu_1", "get_zip", { zcta: "33900" })] },
      { content: [submit("tu_2", { answer: "33900 and 33499." })] },
      { content: [submit("tu_3", { answer: "Only 33900 matches." })] },
    ]);
    const r = await runAgent(engine, model, "q");
    expect(r.answer).toBe("Only 33900 matches.");
    expect(r.warnings).toEqual([]);
  });

  it("does not flag the ZIP the user asked about", async () => {
    const model = new ScriptedModel([
      { content: [toolUse("tu_1", "find_places", { kind: "library", nearZip: "33903", limit: 1 })] },
      { content: [submit("tu_2", { answer: "The closest library to 33903 is nearby." })] },
    ]);
    const r = await runAgent(engine, model, "What's the closest library to 33903?");
    expect(r.warnings).toEqual([]);
  });

  it("adds citations for cited ZIPs the model mentioned but forgot to list", async () => {
    const model = new ScriptedModel([
      { content: [toolUse("tu_1", "get_zip", { zcta: "33900" })] },
      { content: [submit("tu_2", { answer: "ZIP 33900 has a library inside it." })] },
    ]);
    const r = await runAgent(engine, model, "33900?");
    expect(r.citations.map((c) => c.id)).toContain("zip:33900");
  });

  it("nudges once, then accepts a plain-text answer with a warning", async () => {
    const model = new ScriptedModel([
      { content: [{ type: "text", text: "Here is my answer." }] },
      { content: [{ type: "text", text: "Still plain text." }] },
    ]);
    const r = await runAgent(engine, model, "hello?");
    expect(model.requests[1].messages.at(-1)).toEqual({
      role: "user",
      content: "Please call submit_answer with your final answer.",
    });
    expect(r.answer).toBe("Still plain text.");
    expect(r.warnings.join(" ")).toMatch(/without calling submit_answer/);
  });

  it("picks the map from the tool call that matches the answer, and honours show_map=false", async () => {
    const zips = flagshipMatches();
    const model = new ScriptedModel([
      { content: [toolUse("tu_1", "find_zips", FLAGSHIP), toolUse("tu_2", "get_zip", { zcta: "33912" })] },
      { content: [submit("tu_3", { answer: `${zips[0]} and others.`, citations: zips.map((z) => `zip:${z}`) })] },
    ]);
    const r = await runAgent(engine, model, "q");
    expect(r.map?.highlightZips).toEqual(zips); // not the later get_zip map
    const quiet = new ScriptedModel([
      { content: [toolUse("tu_1", "find_zips", FLAGSHIP)] },
      { content: [submit("tu_2", { answer: "Definitions only.", show_map: false })] },
    ]);
    expect((await runAgent(engine, quiet, "q")).map).toBeNull();
  });

  it("never shows a map for out-of-scope answers", async () => {
    const model = new ScriptedModel([
      { content: [toolUse("tu_1", "find_zips", {})] },
      { content: [submit("tu_2", { status: "out_of_scope", answer: "No graduation data." })] },
    ]);
    const r = await runAgent(engine, model, "Graduation rates?");
    expect(r.status).toBe("out_of_scope");
    expect(r.map).toBeNull();
  });

  it("stops after the turn limit", async () => {
    const model = new ScriptedModel(Array.from({ length: 3 }, (_, i) => ({ content: [toolUse(`tu_${i}`, "describe_data", {})] })));
    const r = await runAgent(engine, model, "loop", { maxTurns: 3 });
    expect(r.status).toBe("error");
    expect(r.warnings.join(" ")).toMatch(/No final answer after 3 model turns/);
    expect(model.requests).toHaveLength(3);
  });

  it("repairs a final answer whose interpretation swallowed the citations", async () => {
    const model = new ScriptedModel([
      { content: [toolUse("tu_1", "get_zip", { zcta: "33900" })] },
      {
        content: [
          submit("tu_2", {
            answer: "It has a library inside it.",
            interpretation: 'Read as ZIP 33900.</interpretation>\n<parameter name="citations">["zip:33900"]',
          }),
        ],
      },
    ]);
    const r = await runAgent(engine, model, "33900?");
    expect(r.interpretation).toBe("Read as ZIP 33900.");
    expect(r.citations.map((c) => c.id)).toEqual(["zip:33900"]);
    expect(r.diagnostics.join(" ")).toMatch(/Repaired leaked markup/);
    expect(r.warnings).toEqual([]);
  });

  it("sends a self-correcting answer back once and keeps the clean rewrite", async () => {
    const model = new ScriptedModel([
      { content: [toolUse("tu_1", "get_zip", { zcta: "33900" })] },
      { content: [submit("tu_2", { answer: "Broward has more... wait, Miami-Dade is higher. Miami-Dade has more." })] },
      { content: [submit("tu_3", { answer: "Miami-Dade has more." })] },
    ]);
    const r = await runAgent(engine, model, "Which has more?");
    expect(r.answer).toBe("Miami-Dade has more.");
    const rejection = (model.requests[2].messages.at(-1)!.content as { tool_use_id: string; is_error: boolean; content: string }[])[0];
    expect(rejection).toMatchObject({ tool_use_id: "tu_2", is_error: true });
    expect(rejection.content).toMatch(/self-correction/);
    expect(r.diagnostics.join(" ")).toMatch(/rewrite/);
    expect(r.warnings).toEqual([]);
  });

  it("warns if the rewrite still corrects itself", async () => {
    const bad = "Broward... wait, no. Miami-Dade.";
    const model = new ScriptedModel([
      { content: [submit("tu_1", { answer: bad })] },
      { content: [submit("tu_2", { answer: bad })] },
    ]);
    const r = await runAgent(engine, model, "q");
    expect(r.warnings.join(" ")).toMatch(/still contains a mid-answer self-correction/);
  });

  it("handles a refusal", async () => {
    const model = new ScriptedModel([{ content: [], stop_reason: "refusal" }]);
    expect((await runAgent(engine, model, "something")).status).toBe("refused");
  });

  it("rejects empty and over-long questions without calling the model", async () => {
    const model = new ScriptedModel([]);
    expect((await runAgent(engine, model, "   ")).status).toBe("error");
    expect((await runAgent(engine, model, "x".repeat(MAX_QUESTION_CHARS + 1))).status).toBe("error");
    expect(model.requests).toHaveLength(0);
  });

  it("passes thinking blocks back unchanged", async () => {
    const thinking = { type: "thinking", thinking: "hmm", signature: "sig123" };
    const model = new ScriptedModel([
      { content: [thinking, toolUse("tu_1", "describe_data", {})] },
      { content: [submit("tu_2", { answer: "ok" })] },
    ]);
    await runAgent(engine, model, "what data?");
    const assistant = model.requests[1].messages[1];
    expect(assistant.role).toBe("assistant");
    expect((assistant.content as unknown[])[0]).toEqual(thinking);
  });
});

describe("system prompt", () => {
  const prompt = buildSystemPrompt(engine);
  it("states the metro's cut-offs, regions, distance rule and the 'Miami' reading", () => {
    const b = engine.snapshot.manifest.tierBreaks.education;
    expect(prompt).toContain(`composite score ≥ ${b.mediumMax.toFixed(1)} is high`);
    expect(prompt).toContain("Miami-Dade, Broward, Palm Beach");
    expect(prompt).toMatch(/measured from the ZIP's nearest edge/);
    expect(prompt).toMatch(/"Miami" on its own means the whole map/);
    expect(prompt).toMatch(/not Haitian-only/);
  });
});

describe("answerProblem", () => {
  it("catches the self-corrections seen in live runs", () => {
    for (const t of [
      "Miami-Dade has more residents of Haitian ancestry in raw count: about 114,958, compared with 128,878 in Broward... wait, Broward is higher.",
      "about 128,878 in Broward... wait, correction: Broward has more.",
      "compared with about 128,878 in Broward... wait, correcting that: Broward has more.",
    ]) expect(answerProblem(t)).toBe("a mid-answer self-correction");
  });
  it("catches internal names leaking into the answer", () => {
    expect(answerProblem("The closest measure is the share of adults without a diploma (pctNoHS).")).toMatch(/internal name \("pctNoHS"\)/);
    expect(answerProblem("See zip:33127 for details.")).toMatch(/zip:33127/);
  });

  it("leaves normal answers alone", () => {
    for (const t of [
      "Broward has more: 128,878 versus 114,958 in Miami-Dade.",
      "Actual counts come from ACS estimates.",
      "The wait list is not in this data.",
    ]) expect(answerProblem(t)).toBeNull();
  });

  it("treats a parenthetical 'actually' as a self-correction", () => {
    expect(
      answerProblem("Miami-Dade has the largest number, about 115,000. (Broward's count is actually slightly higher.)")
    ).toMatch(/self-correction/);
    expect(answerProblem("Broward has the most residents of Haitian ancestry, about 129,000.")).toBeNull();
  });
});
