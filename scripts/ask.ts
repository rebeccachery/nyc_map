/**
 * Ask the map from the command line.
 *
 *   npm run ask -- "Which Miami ZIPs have high need and no library within a mile?"
 *   npm run ask -- --metro nyc --model claude-sonnet-5-5 "Top 3 Brooklyn ZIPs by Haitian ancestry"
 *   npm run ask -- --json "..."     # print the full response object
 *
 * Needs ANTHROPIC_API_KEY in .env.local.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { AnthropicModelClient, isModelId, DEFAULT_MODEL } = await import("@/lib/agent/model");
  const { runAgent } = await import("@/lib/agent/runAgent");
  const { getEngine } = await import("@/lib/query/engine");
  const { loadSnapshot } = await import("@/lib/snapshot/load");
  const { parseMetroId } = await import("@/lib/metroApi");

  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return undefined;
    const [, value] = args.splice(i, 2);
    return value;
  };
  const json = args.includes("--json") ? (args.splice(args.indexOf("--json"), 1), true) : false;
  const metro = parseMetroId(opt("metro") ?? "miami");
  const modelArg = opt("model");
  const model = isModelId(modelArg) ? modelArg : DEFAULT_MODEL;
  const question = args.join(" ").trim();
  if (!question) {
    console.error('Usage: npm run ask -- [--metro miami|nyc] [--model id] [--json] "question"');
    process.exit(2);
  }

  const r = await runAgent(getEngine(loadSnapshot(metro)), new AnthropicModelClient(), question, { model });
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  console.log(`\n[${r.status}] ${r.answer}\n`);
  if (r.interpretation) console.log(`Interpretation: ${r.interpretation}`);
  if (r.citations.length) console.log(`Citations: ${r.citations.map((c) => c.label).join("; ")}`);
  if (r.sources.length) console.log(`Sources: ${r.sources.map((s) => s.name).join("; ")}`);
  if (r.map) console.log(`Map: highlight ${r.map.highlightZips.length} ZIPs (${r.map.needMode} mode)`);
  console.log("Assumptions:");
  for (const a of r.assumptions) console.log(`  - ${a}`);
  if (r.warnings.length) console.log(`WARNINGS:\n  - ${r.warnings.join("\n  - ")}`);
  console.log(
    `\nTools: ${r.trace.map((t) => `${t.tool}${t.ok ? "" : " (error)"}`).join(" → ") || "none"}` +
      ` | ${r.modelTurns} turns | ${r.latencyMs} ms | ${r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheWriteTokens} in / ${r.usage.outputTokens} out tokens | ~$${r.costUsd.toFixed(4)}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
