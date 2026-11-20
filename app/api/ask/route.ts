import { NextResponse } from "next/server";
import { AnthropicModelClient, isModelId, MissingApiKeyError, DEFAULT_MODEL } from "@/lib/agent/model";
import { runAgent } from "@/lib/agent/runAgent";
import { parseMetroId } from "@/lib/metroApi";
import { getEngine } from "@/lib/query/engine";
import { loadSnapshot } from "@/lib/snapshot/load";
import { getUsageLimiter } from "@/lib/usageLimits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Visitors get the default model unless the deployment opts in to letting the request choose
// (the eval harness and CLI call runAgent directly, so they aren't affected).
const ALLOW_MODEL_CHOICE = process.env.ASK_ALLOW_MODEL_CHOICE === "true";

export async function POST(request: Request) {
  let body: { question?: unknown; metro?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Send JSON: { question, metro }." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question : "";
  const metro = parseMetroId(typeof body.metro === "string" ? body.metro : null);
  const model = ALLOW_MODEL_CHOICE && isModelId(body.model) ? body.model : DEFAULT_MODEL;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limiter = getUsageLimiter();
  const decision = await limiter.admit(ip);
  if (!decision.ok) {
    console.log(`[ask] limited reason=${decision.reason}`);
    return NextResponse.json(
      { success: false, error: decision.message },
      { status: decision.reason === "budget" ? 503 : 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } }
    );
  }

  try {
    const engine = getEngine(loadSnapshot(metro));
    const result = await runAgent(engine, new AnthropicModelClient(), question, {
      model,
      signal: request.signal,
    });
    await limiter.charge(result.costUsd);
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
