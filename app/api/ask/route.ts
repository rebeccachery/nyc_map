import { NextResponse } from "next/server";
import { AnthropicModelClient, isModelId, MissingApiKeyError, DEFAULT_MODEL } from "@/lib/agent/model";
import { runAgent } from "@/lib/agent/runAgent";
import { parseMetroId } from "@/lib/metroApi";
import { getEngine } from "@/lib/query/engine";
import { loadSnapshot } from "@/lib/snapshot/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Simple per-instance rate limit so a public demo can't run up an API bill.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  let body: { question?: unknown; metro?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Send JSON: { question, metro }." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question : "";
  const metro = parseMetroId(typeof body.metro === "string" ? body.metro : null);
  const model = isModelId(body.model) ? body.model : DEFAULT_MODEL;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { success: false, error: "Too many questions in a minute. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  try {
    const engine = getEngine(loadSnapshot(metro));
    const result = await runAgent(engine, new AnthropicModelClient(), question, {
      model,
      signal: request.signal,
    });
    console.log(
      `[ask] metro=${metro} model=${model} status=${result.status} turns=${result.modelTurns} ` +
        `tools=${result.trace.map((t) => t.tool).join(",")} cost=$${result.costUsd.toFixed(4)} ` +
        `ms=${result.latencyMs} warnings=${result.warnings.length}`
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof MissingApiKeyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    console.error("Error in ask API route:", error);
    const status = (error as { status?: number }).status;
    return NextResponse.json(
      {
        success: false,
        error:
          status === 429 || status === 529
            ? "The AI service is busy. Please try again in a minute."
            : "Something went wrong answering that question.",
      },
      { status: 502 }
    );
  }
}
