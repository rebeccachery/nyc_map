import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  MessageCreateParamsNonStreaming,
  StopReason,
  Usage,
} from "@anthropic-ai/sdk/resources/messages/messages";

/**
 * The one seam between the agent and an LLM provider. The request/response shapes follow
 * the Claude Messages API; another provider plugs in by translating to and from them.
 */
export type ModelRequest = MessageCreateParamsNonStreaming;
export type ModelResponse = { content: ContentBlock[]; stop_reason: StopReason | null; usage: Usage };

export interface ModelClient {
  createMessage(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse>;
}

export const MODELS = {
  "claude-haiku-5-5": {
    label: "Claude Haiku 5.5",
    // USD per million tokens (prompts ≤ 100K tokens). https://platform.claude.com/docs/en/about-claude/pricing
    price: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  },
  "claude-sonnet-5-5": {
    label: "Claude Sonnet 5.5",
    price: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  },
} as const;

export type ModelId = keyof typeof MODELS;
export const DEFAULT_MODEL: ModelId = "claude-haiku-5-5";

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && value in MODELS;
}

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

export function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
}

export function addUsage(total: TokenUsage, u: Usage): void {
  total.inputTokens += u.input_tokens ?? 0;
  total.outputTokens += u.output_tokens ?? 0;
  total.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
  total.cacheReadTokens += u.cache_read_input_tokens ?? 0;
}

/** Estimated cost in USD from list prices. */
export function estimateCost(model: ModelId, u: TokenUsage): number {
  const p = MODELS[model].price;
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheWriteTokens * p.cacheWrite +
      u.cacheReadTokens * p.cacheRead) /
    1_000_000
  );
}

export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new MissingApiKeyError();
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  async createMessage(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    const res = await this.client.messages.create(request, { signal });
    return { content: res.content, stop_reason: res.stop_reason, usage: res.usage };
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. Add it to .env.local to enable ask-the-map.");
  }
}
