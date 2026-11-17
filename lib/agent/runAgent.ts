import type {
  ContentBlock,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { repairSubmitInput, submitAnswerInput, SUBMIT_ANSWER_TOOL, type AnswerStatus } from "@/lib/agent/answer";
import {
  addUsage,
  DEFAULT_MODEL,
  emptyUsage,
  estimateCost,
  type ModelClient,
  type ModelId,
  type TokenUsage,
} from "@/lib/agent/model";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import type { QueryEngine } from "@/lib/query/engine";
import { runTool, toolJsonSchemas, type MapView, type ToolResult } from "@/lib/query/tools";
import type { SourceRef } from "@/lib/snapshot/types";

export const MAX_QUESTION_CHARS = 500;
export const MAX_MODEL_TURNS = 6;

export type AskStatus = AnswerStatus | "refused" | "error";

export type Citation = { id: string; label: string; sourceId: string | null };

/** A library or school the map should ring, with coordinates so the client needs no lookup. */
export type FocusPlace = { id: string; name: string; kind: "library" | "school"; lat: number; lon: number };

export type TraceStep = {
  tool: string;
  toolUseId: string;
  input: unknown;
  ok: boolean;
  error?: string;
  matchCount?: number;
  ms: number;
};

export type AskResponse = {
  status: AskStatus;
  question: string;
  metro: string;
  answer: string;
  interpretation: string;
  assumptions: string[];
  citations: Citation[];
  sources: SourceRef[];
  map: MapView | null;
  focusPlaces: FocusPlace[];
  followUps: string[];
  /** Guardrail findings. Non-empty means the answer needs a human look. */
  warnings: string[];
  /** Internal notes that don't affect the answer's trustworthiness (e.g. a repaired tool call). */
  diagnostics: string[];
  trace: TraceStep[];
  model: ModelId;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
  modelTurns: number;
};

export type AskOptions = {
  model?: ModelId;
  effort?: "low" | "medium" | "high";
  maxTurns?: number;
  signal?: AbortSignal;
};

type ToolCallRecord = { block: ToolUseBlock; result: ToolResult; serialized: string };

function toolDefinitions(): Tool[] {
  const tools: Tool[] = [
    ...toolJsonSchemas().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Tool["input_schema"],
    })),
    SUBMIT_ANSWER_TOOL,
  ];
  // Cache the whole tool list (and, with it, the system prompt that precedes it).
  tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: "ephemeral" } };
  return tools;
}

/** What the model sees from a tool: data, citations and assumptions. The map view stays server-side. */
function serializeForModel(result: ToolResult): string {
  if (!result.ok) return JSON.stringify({ error: result.error, hint: result.hint });
  return JSON.stringify({
    data: result.data,
    citations: result.citations,
    assumptions: result.assumptions,
    ...(result.map ? { hasMapView: true } : {}),
  });
}

function zipLikeTokens(metro: string, text: string): string[] {
  const pattern = metro === "nyc" ? /\b1[01]\d{3}\b/g : /\b3[34]\d{3}\b/g;
  return [...new Set(text.match(pattern) ?? [])];
}

function citationLabel(engine: QueryEngine, id: string): Citation {
  if (id.startsWith("zip:")) {
    const z = engine.getZip(id.slice(4));
    return {
      id,
      label: z ? `ZIP ${z.properties.zcta}${z.properties.region ? ` (${z.properties.region})` : ""}` : id,
      sourceId: "census-acs5-2022",
    };
  }
  const p = engine.getPlace(id);
  return {
    id,
    label: p ? `${p.name}${p.city ? `, ${p.city}` : ""} (${p.kind})` : id,
    sourceId: p?.sourceId ?? null,
  };
}

/**
 * Answers one question: Claude chooses tools, the deterministic engine runs them, and the server
 * checks the final answer against what the tools actually returned.
 */
export async function runAgent(
  engine: QueryEngine,
  client: ModelClient,
  question: string,
  options: AskOptions = {}
): Promise<AskResponse> {
  const started = Date.now();
  const model = options.model ?? DEFAULT_MODEL;
  const maxTurns = options.maxTurns ?? MAX_MODEL_TURNS;
  const usage = emptyUsage();
  const calls: ToolCallRecord[] = [];
  const trace: TraceStep[] = [];
  const warnings: string[] = [];
  const diagnostics: string[] = [];
  const q = question.trim();

  const finish = (partial: Partial<AskResponse> & { status: AskStatus; answer: string }, turns: number) =>
    assemble(engine, q, model, partial, calls, trace, warnings, diagnostics, usage, started, turns);

  if (!q) return finish({ status: "error", answer: "Please type a question." }, 0);
  if (q.length > MAX_QUESTION_CHARS) {
    return finish({ status: "error", answer: `Please keep questions under ${MAX_QUESTION_CHARS} characters.` }, 0);
  }

  const system = buildSystemPrompt(engine);
  const tools = toolDefinitions();
  const messages: MessageParam[] = [{ role: "user", content: q }];
  let nudged = false;
  let answerRetried = false;

  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await client.createMessage(
      {
        model,
        max_tokens: 4096,
        system: [{ type: "text", text: system }],
        tools,
        messages,
        ...(options.effort ? { output_config: { effort: options.effort } } : {}),
      },
      options.signal
    );
    addUsage(usage, res.usage);

    if (res.stop_reason === "refusal") {
      return finish({ status: "refused", answer: "This question can't be answered here." }, turn);
    }
    if (res.stop_reason === "max_tokens") {
      warnings.push("The model ran out of output tokens.");
      return finish({ status: "error", answer: "Sorry, that answer ran too long. Try a narrower question." }, turn);
    }

    // Keep the assistant turn verbatim (including thinking blocks) for the next request.
    messages.push({ role: "assistant", content: res.content as ContentBlock[] });
    const toolUses = res.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

    const submit = toolUses.find((b) => b.name === SUBMIT_ANSWER_TOOL.name);
    if (submit) {
      const { input: submitted, repaired } = repairSubmitInput(submit.input);
      if (repaired.length) diagnostics.push(`Repaired leaked markup in submit_answer: ${repaired.join(", ")}.`);
      const parsed = submitAnswerInput.safeParse(submitted);
      if (!parsed.success) {
        warnings.push("submit_answer input did not match its schema.");
        return finish({ status: "error", answer: "Sorry, something went wrong composing the answer." }, turn);
      }
      const unverified = unverifiedZips(engine, q, parsed.data.answer, calls);
      const problem =
        answerProblem(parsed.data.answer) ??
        (unverified.length ? `ZIP codes no tool returned (${unverified.join(", ")}); use only ZIPs from tool results` : null);
      if (problem && !answerRetried && turn < maxTurns) {
        // Send it back once: the user should never see the model correcting itself mid-answer.
        answerRetried = true;
        diagnostics.push(`Asked the model to rewrite an answer: ${problem}.`);
        messages.push({
          role: "user",
          content: [
            ...toolUses
              .filter((b) => b.id !== submit.id)
              .map((b) => ({ type: "tool_result" as const, tool_use_id: b.id, content: "Not run: submit_answer was called in the same turn.", is_error: true })),
            {
              type: "tool_result",
              tool_use_id: submit.id,
              content: `Rejected: ${problem}. Call submit_answer again with a clean, final answer that states the result once, correctly.`,
              is_error: true,
            },
          ],
        });
        continue;
      }
      if (problem && !unverified.length) warnings.push(`Final answer still contains ${problem}.`);
      // Not a trust problem (the answer only cites earlier results), so it's a diagnostic, not a warning.
      if (toolUses.length > 1) diagnostics.push("The model called data tools in the same turn as submit_answer; those calls were ignored.");
      return finish(
        {
          status: parsed.data.status,
          answer: parsed.data.answer,
          interpretation: parsed.data.interpretation,
          followUps: parsed.data.follow_ups.slice(0, 3),
          ...resolveFinal(engine, q, parsed.data.citations, parsed.data.show_map, parsed.data.answer, calls, warnings),
        },
        turn
      );
    }

    if (toolUses.length === 0) {
      const text = res.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n")
        .trim();
      if (!nudged && turn < maxTurns) {
        nudged = true;
        messages.push({ role: "user", content: "Please call submit_answer with your final answer." });
        continue;
      }
      warnings.push("The model answered without calling submit_answer, so citations could not be checked.");
      return finish({ status: "answered", answer: text || "Sorry, I couldn't produce an answer.", ...resolveFinal(engine, q, [], true, text, calls, warnings) }, turn);
    }

    const results: ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      const t0 = Date.now();
      const result = runTool(engine, block.name, block.input);
      const serialized = serializeForModel(result);
      calls.push({ block, result, serialized });
      trace.push({
        tool: block.name,
        toolUseId: block.id,
        input: block.input,
        ok: result.ok,
        ...(result.ok ? {} : { error: result.error }),
        ...(result.ok && typeof (result.data as { matchCount?: unknown }).matchCount === "number"
          ? { matchCount: (result.data as { matchCount: number }).matchCount }
          : {}),
        ms: Date.now() - t0,
      });
      results.push({ type: "tool_result", tool_use_id: block.id, content: serialized, ...(result.ok ? {} : { is_error: true }) });
    }
    messages.push({ role: "user", content: results });
  }

  warnings.push(`No final answer after ${maxTurns} model turns.`);
  return finish({ status: "error", answer: "Sorry, I couldn't finish answering that. Try rephrasing or narrowing the question." }, maxTurns);
}

/**
 * Self-corrections like "…wait, Broward is higher" read as unreliable; the answer must be final.
 * Any "actually" counts: in 900+ evaluated answers it only ever introduced a correction
 * ("Miami-Dade has the largest… (Broward's count is actually higher)").
 */
const SELF_CORRECTION = /(\.\.\.|…|—|-)\s*(wait|correction|scratch that|i mean)\b|\b(wait|correction),\s|\bcorrecting (that|myself)\b|\bactually\b/i;

/** Internal names users should never see: field names, tool names, record ids. */
const INTERNAL_NAME = /\b(pctNoHS|pctNoInternet|haitianPopPct|educationNeedScore|educationNeedTier|populationNeedTier|limitedEnglish|matchCount|find_zips|get_zip|find_places|summarize_regions|describe_data)\b|\b(zip|lib|sch):[\w-]+/;

export function answerProblem(answer: string): string | null {
  if (SELF_CORRECTION.test(answer)) return "a mid-answer self-correction";
  const internal = answer.match(INTERNAL_NAME);
  if (internal) return `an internal name ("${internal[0]}") instead of plain words`;
  return null;
}

/** ZIPs in the answer that no tool returned, no tool was called with, and the user didn't type. */
function unverifiedZips(engine: QueryEngine, question: string, answer: string, calls: ToolCallRecord[]): string[] {
  const known = [question, ...calls.map((c) => `${c.serialized} ${JSON.stringify(c.block.input)}`)].join(" ");
  return zipLikeTokens(engine.metro, answer).filter((z) => !known.includes(z));
}

/** Checks citations and ZIPs against tool output, and picks the map view. */
function resolveFinal(
  engine: QueryEngine,
  question: string,
  modelCitations: string[],
  showMap: boolean,
  answer: string,
  calls: ToolCallRecord[],
  warnings: string[]
): Pick<AskResponse, "citations" | "map"> {
  const okCalls = calls.filter((c) => c.result.ok);
  const seen = new Set(okCalls.flatMap((c) => (c.result.ok ? c.result.citations : [])));

  const valid = [...new Set(modelCitations)].filter((id) => seen.has(id));
  const invalid = modelCitations.filter((id) => !seen.has(id));
  if (invalid.length) warnings.push(`Dropped citations not found in tool results: ${invalid.join(", ")}.`);

  const unverified = unverifiedZips(engine, question, answer, calls);
  if (unverified.length) warnings.push(`ZIP codes in the answer that no tool returned: ${unverified.join(", ")}.`);

  // Also accept ZIP citations by bare code if the model mentioned a cited ZIP but omitted its id.
  for (const z of zipLikeTokens(engine.metro, answer)) {
    const id = `zip:${z}`;
    if (seen.has(id) && !valid.includes(id)) valid.push(id);
  }

  // The server picks the map: the tool result whose highlighted ZIPs best match the ZIPs in the
  // answer; ties go to the latest call. (Models are unreliable at naming their own tool calls.)
  let map: MapView | null = null;
  if (showMap) {
    const mentioned = new Set(
      valid.filter((id) => id.startsWith("zip:")).map((id) => id.slice(4))
    );
    let best = -1;
    for (const c of okCalls) {
      if (!c.result.ok || !c.result.map) continue;
      const m = c.result.map;
      if (m.highlightZips.length === 0 && !m.focusPlaceIds?.length) continue;
      const overlap = m.highlightZips.filter((z) => mentioned.has(z)).length;
      if (overlap >= best) {
        best = overlap;
        map = m;
      }
    }
  }
  return { citations: valid.map((id) => citationLabel(engine, id)), map };
}

function assemble(
  engine: QueryEngine,
  question: string,
  model: ModelId,
  partial: Partial<AskResponse> & { status: AskStatus; answer: string },
  calls: ToolCallRecord[],
  trace: TraceStep[],
  warnings: string[],
  diagnostics: string[],
  usage: TokenUsage,
  started: number,
  turns: number
): AskResponse {
  const okResults = calls.map((c) => c.result).filter((r) => r.ok);
  // Assumptions come from the tools, not the model, so required disclosures can't be dropped.
  const assumptions = [...new Set(okResults.flatMap((r) => (r.ok ? r.assumptions : [])))];

  const citations = partial.citations ?? [];
  const sourceIds = new Set<string>([
    ...citations.flatMap((c) => {
      if (c.id.startsWith("zip:")) return engine.getZip(c.id.slice(4))?.properties.sourceIds ?? [];
      return c.sourceId ? [c.sourceId] : [];
    }),
    // Datasets a tool measured against (e.g. libraries for "no library within a mile").
    ...okResults.flatMap((r) => (r.ok ? r.sources : [])),
  ]);
  const sources = engine.snapshot.manifest.sources.filter((s) => sourceIds.has(s.id));

  const map = partial.status === "answered" ? (partial.map ?? null) : null;
  const focusPlaces: FocusPlace[] = (map?.focusPlaceIds ?? [])
    .map((id) => engine.getPlace(id))
    .filter((p) => p !== undefined)
    .map((p) => ({ id: p.id, name: p.name, kind: p.kind, lat: p.lat, lon: p.lon }));

  return {
    status: partial.status,
    question,
    metro: engine.metro,
    answer: partial.answer,
    interpretation: partial.interpretation ?? "",
    assumptions,
    citations,
    sources,
    map,
    focusPlaces,
    followUps: partial.followUps ?? [],
    warnings,
    diagnostics,
    trace,
    model,
    usage,
    costUsd: Number(estimateCost(model, usage).toFixed(6)),
    latencyMs: Date.now() - started,
    modelTurns: turns,
  };
}
