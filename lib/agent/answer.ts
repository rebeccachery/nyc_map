import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { z } from "zod";

export const ANSWER_STATUSES = ["answered", "out_of_scope", "needs_clarification"] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

/**
 * The final-answer tool. Strict, with every field required, so the model's output always parses.
 * Free-text `interpretation` is last on purpose: in live runs Haiku sometimes ended that string
 * with tool-call markup and wrote the remaining fields inside it, losing them. Nothing follows it now.
 */
export const SUBMIT_ANSWER_TOOL: Tool = {
  name: "submit_answer",
  description:
    "Submit the final answer to the user. Call exactly once, after gathering every figure you need from the data tools. Every number and ZIP code in `answer` must come from earlier tool results. Each field holds only its own value.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: [...ANSWER_STATUSES],
        description:
          '"answered"; "out_of_scope" when the data cannot answer it; "needs_clarification" only when no reasonable reading exists.',
      },
      answer: { type: "string", description: "The answer for the user, in plain language." },
      citations: {
        type: "array",
        items: { type: "string" },
        description: "Record ids (zip:…, lib:…, sch:…) behind the figures in the answer.",
      },
      show_map: {
        type: "boolean",
        description: "true when the map should highlight the ZIPs or places behind this answer.",
      },
      follow_ups: {
        type: "array",
        items: { type: "string" },
        description: "Up to 3 follow-up questions answerable with this data.",
      },
      interpretation: {
        type: "string",
        description: 'One sentence on how you read an ambiguous question (e.g. "Read \'Miami\' as the whole metro"), or "".',
      },
    },
    required: ["status", "answer", "citations", "show_map", "follow_ups", "interpretation"],
    additionalProperties: false,
  },
};

/** Defensive parse: strict mode guarantees the shape, but a fallback path or another provider may not. */
export const submitAnswerInput = z.object({
  status: z.enum(ANSWER_STATUSES),
  answer: z.string(),
  interpretation: z.string().default(""),
  citations: z.array(z.string()).default([]),
  show_map: z.boolean().default(true),
  follow_ups: z.array(z.string()).default([]),
});
export type SubmitAnswerInput = z.infer<typeof submitAnswerInput>;

const FIELD_NAMES = ["status", "answer", "interpretation", "citations", "show_map", "follow_ups"] as const;
type FieldName = (typeof FIELD_NAMES)[number];

/** Start of tool-call markup leaking into a string value, e.g. `</interpretation>` or `<parameter name=…>`. */
const LEAK_START = new RegExp(`</?(?:parameter\\b|invoke\\b|${FIELD_NAMES.join("|")})\\b`);
const LEAKED_PARAM = /<parameter name="(\w+)">([\s\S]*?)(?=<\/?parameter\b|<\/invoke\b|$)/g;

function leakedValue(field: FieldName, raw: string): unknown {
  const text = raw.replace(/<\/\w+>\s*$/, "").trim();
  if (field === "citations" || field === "follow_ups" || field === "show_map") {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
  return text;
}

const isEmpty = (v: unknown) =>
  v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Repairs a submit_answer input whose string fields contain leaked tool-call markup: strips the
 * markup and recovers any fields written inside it (only where the real field is empty).
 * Returns the input unchanged, with `repaired: false`, when nothing leaked.
 */
export function repairSubmitInput(raw: unknown): { input: unknown; repaired: string[] } {
  if (!raw || typeof raw !== "object") return { input: raw, repaired: [] };
  const input: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const repaired: string[] = [];

  for (const field of FIELD_NAMES) {
    const value = input[field];
    if (typeof value !== "string") continue;
    const at = value.search(LEAK_START);
    if (at < 0) continue;

    const tail = value.slice(at);
    input[field] = value.slice(0, at).trim();
    repaired.push(field);
    for (const [, name, body] of tail.matchAll(LEAKED_PARAM)) {
      if (!(FIELD_NAMES as readonly string[]).includes(name)) continue;
      const recovered = leakedValue(name as FieldName, body);
      if (recovered !== undefined && isEmpty(input[name])) {
        input[name] = recovered;
        repaired.push(`${name} (recovered)`);
      }
    }
  }
  return { input, repaired };
}
