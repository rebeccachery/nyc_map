/**
 * Runs the golden set through the live agent and scores it against eval/golden.expected.json.
 *
 *   npm run eval                                   # all questions, once, default model
 *   npm run eval -- --runs 3 --report              # 3 runs; writes eval/REPORT.md
 *   npm run eval -- --only G07,G14
 *   npm run eval -- --model claude-sonnet-5-5
 *
 * Each question is scored three ways:
 *   data      – one of the agent's tool calls returned the expected answer (with the right status)
 *   text      – the written answer itself states the expected figures / ZIPs / place / order
 *   grounded  – no guardrail warnings (dropped citations, ZIPs no tool returned)
 * "Correct" means data and text are both right.
 *
 * Writes eval/results/<timestamp>-<model>.json with every response. Needs ANTHROPIC_API_KEY.
 */
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

type Row = {
  run: number;
  question: import("@/lib/eval/golden").GoldenQuestion;
  response: import("@/lib/agent/runAgent").AskResponse;
  score: import("@/lib/eval/golden").GoldenScore;
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};

async function main() {
  const { AnthropicModelClient, isModelId, DEFAULT_MODEL, MODELS } = await import("@/lib/agent/model");
  const { runAgent } = await import("@/lib/agent/runAgent");
  const { getEngine } = await import("@/lib/query/engine");
  const { loadSnapshot } = await import("@/lib/snapshot/load");
  const { loadGolden, scoreRun } = await import("@/lib/eval/golden");
  const { runMutations, unsupportedGeography } = await import("@/lib/eval/mutations");

  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const modelArg = opt("model");
  const model = isModelId(modelArg) ? modelArg : DEFAULT_MODEL;
  const runs = Math.max(1, Number(opt("runs") ?? 1));
  const concurrency = Math.max(1, Number(opt("concurrency") ?? 4));
  const only = opt("only")?.split(",");
  const writeReport = args.includes("--report");
  const set = opt("set") ?? "golden"; // "golden" or "holdout"

  const { golden, expected } = loadGolden();
  if (!expected) throw new Error("eval/golden.expected.json is missing. Run `npm run truth` first.");
  for (const [metro, createdAt] of Object.entries(expected.generatedFrom)) {
    if (loadSnapshot(metro as "miami" | "nyc").manifest.createdAt !== createdAt) {
      throw new Error(`Expected answers are stale for ${metro}. Run \`npm run truth\`.`);
    }
  }
  let pool = golden.questions;
  if (set === "holdout") {
    // Held-out rewordings reuse the answer key of the golden question they reword.
    const { readFileSync } = await import("node:fs");
    const holdout = JSON.parse(readFileSync(path.join(process.cwd(), "eval", "holdout.json"), "utf8")) as {
      questions: { id: string; of: string; question: string; mustMention?: string[] }[];
    };
    pool = holdout.questions.map((h) => {
      const base = golden.questions.find((q) => q.id === h.of);
      if (!base) throw new Error(`${h.id} rewords unknown question ${h.of}`);
      expected.expected[h.id] = expected.expected[h.of];
      // A rewording may need its own required words (e.g. "dropout" instead of "graduation").
      const answer = h.mustMention ? { ...base.answer, mustMention: h.mustMention } : base.answer;
      return { ...base, id: h.id, question: h.question, answer };
    });
  }
  const questions = pool.filter((q) => !only || only.includes(q.id));
  const missing = questions.filter((q) => !(q.id in expected.expected));
  if (missing.length) throw new Error(`No expected answer for ${missing.map((q) => q.id).join(", ")}. Run \`npm run truth\`.`);

  const client = new AnthropicModelClient();
  const jobs = Array.from({ length: runs }, (_, run) => questions.map((q) => ({ run: run + 1, q }))).flat();
  const rows: Row[] = [];
  let next = 0;
  const started = Date.now();

  async function worker() {
    while (next < jobs.length) {
      const { run, q } = jobs[next++];
      const engine = getEngine(loadSnapshot(q.metro));
      let response;
      for (let attempt = 1; ; attempt++) {
        try {
          response = await runAgent(engine, client, q.question, { model });
          break;
        } catch (error) {
          if (attempt >= 3) throw error;
          await new Promise((r) => setTimeout(r, 2000 * attempt)); // transient API errors
        }
      }
      const score = scoreRun(engine, q, expected!.expected[q.id], response);
      rows.push({ run, question: q, response, score });
      console.log(
        `${score.correct ? "PASS" : "FAIL"} r${run} ${q.id} [${q.category}] ${q.question}\n` +
          `     ${score.reason}${score.grounded ? "" : " | NOT GROUNDED"} | ${response.trace.length} tools | ${response.latencyMs} ms | $${response.costUsd.toFixed(4)}` +
          (response.warnings.length ? `\n     warnings: ${response.warnings.join(" / ")}` : "") +
          (score.correct ? "" : `\n     → ${response.answer.replace(/\s+/g, " ").slice(0, 240)}`)
      );
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  rows.sort((a, b) => a.run - b.run || a.question.id.localeCompare(b.question.id));

  // ---- Summary ----
  const total = rows.length;
  const count = (f: (r: Row) => boolean, rs = rows) => rs.filter(f).length;
  const cost = rows.reduce((s, r) => s + r.response.costUsd, 0);
  const lat = rows.map((r) => r.response.latencyMs);
  const categories = [...new Set(questions.map((q) => q.category))];

  const lines: string[] = [];
  const say = (s = "") => {
    lines.push(s);
  };
  say(set === "holdout" ? `# Ask-the-map evaluation: held-out rewordings` : `# Ask-the-map evaluation`);
  say();
  say(`Model **${MODELS[model].label}** (\`${model}\`) · ${questions.length} questions × ${runs} run${runs > 1 ? "s" : ""} = ${total} answers · ${new Date().toISOString().slice(0, 10)}`);
  say(`Data snapshots: ${Object.entries(expected.generatedFrom).map(([m, d]) => `${m} ${d.slice(0, 10)}`).join(", ")}`);
  say();
  say(`| Metric | Result |`);
  say(`|---|---|`);
  say(`| **Correct** (right data and the written answer states it) | **${pct(count((r) => r.score.correct), total)}** (${count((r) => r.score.correct)}/${total}) |`);
  say(`| Right data retrieved (tool level) | ${pct(count((r) => r.score.toolCorrect), total)} |`);
  say(`| Written answer states the result | ${pct(count((r) => r.score.textCorrect), total)} |`);
  say(`| Grounded (no unverified ZIPs or dropped citations) | ${pct(count((r) => r.score.grounded), total)} |`);
  const geo = rows.filter((r) => unsupportedGeography(r.response.answer));
  say(`| Unsupported geography claims (e.g. "western ZIPs") | ${pct(geo.length, total)} |`);
  const diag = (re: RegExp) => count((r) => r.response.diagnostics.some((d) => re.test(d)));
  say(`| Server fixes: leaked markup repaired / answer sent back for a rewrite | ${pct(diag(/^Repaired leaked/), total)} / ${pct(diag(/^Asked the model to rewrite/), total)} |`);
  say(`| Latency p50 / p95 | ${(quantile(lat, 0.5) / 1000).toFixed(1)} s / ${(quantile(lat, 0.95) / 1000).toFixed(1)} s |`);
  say(`| Cost | $${cost.toFixed(4)} total · $${(cost / total).toFixed(4)} per question |`);
  say();
  say(`## By category`);
  say();
  say(`| Category | Questions | Correct | Data | Text |`);
  say(`|---|---|---|---|---|`);
  for (const c of categories) {
    const rs = rows.filter((r) => r.question.category === c);
    if (!rs.length) continue;
    say(`| ${c} | ${rs.length / runs} | ${pct(count((r) => r.score.correct, rs), rs.length)} | ${pct(count((r) => r.score.toolCorrect, rs), rs.length)} | ${pct(count((r) => r.score.textCorrect, rs), rs.length)} |`);
  }
  if (runs > 1) {
    say();
    say(`## Consistency across ${runs} runs`);
    say();
    const byQ = new Map<string, Row[]>();
    for (const r of rows) byQ.set(r.question.id, [...(byQ.get(r.question.id) ?? []), r]);
    const dist = new Map<number, number>();
    for (const rs of byQ.values()) {
      const k = count((r) => r.score.correct, rs);
      dist.set(k, (dist.get(k) ?? 0) + 1);
    }
    for (let k = runs; k >= 0; k--) say(`- Correct in ${k}/${runs} runs: ${dist.get(k) ?? 0} questions`);
  }
  say();
  say(`## Can the scorer catch wrong answers?`);
  say();
  say(`Each answer that passed was corrupted the way an LLM plausibly goes wrong, then re-scored. A corruption "caught" means the text check failed it.`);
  say();
  say(`| Corruption | Caught |`);
  say(`|---|---|`);
  for (const m of runMutations(rows.map((r) => ({ question: r.question, response: r.response, want: expected!.expected[r.question.id] })))) {
    say(`| ${m.name} | ${m.caught}/${m.tried}${m.tried ? ` (${pct(m.caught, m.tried)})` : ""} |`);
  }
  say();
  say(`Known blind spot: if an answer states the right figure and also a contradicting one, the text check passes it.`);
  if (geo.length) {
    say();
    say(`Unsupported geography: ${geo.map((r) => `${r.question.id} r${r.run} ("${unsupportedGeography(r.response.answer)}")`).join(", ")}.`);
  }

  const failures = rows.filter((r) => !r.score.correct || !r.score.grounded);
  say();
  say(`## Failures and flags`);
  say();
  if (!failures.length) say(`None.`);
  for (const r of failures) {
    say(`- **${r.question.id}** run ${r.run} [${r.question.category}] "${r.question.question}": ${r.score.reason}${r.score.grounded ? "" : `; warnings: ${r.response.warnings.join(" / ")}`}`);
    say(`  > ${r.response.answer.replace(/\s+/g, " ").slice(0, 300)}`);
  }
  say();
  say(`Scoring: "data" re-runs each tool call the agent made (tools are deterministic) and compares with the answer key, which \`eval/ground_truth.py\` computes independently in Python. "Text" checks that the written answer states the expected figure, ZIPs (in order for rankings), place, or count; ambiguous questions must also state their interpretation; out-of-scope questions must be declined and name what's missing.`);

  console.log(`\n${lines.join("\n")}`);
  console.log(`\nWall time ${((Date.now() - started) / 1000).toFixed(0)} s`);

  const dir = path.join(process.cwd(), "eval", "results");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}-${model}${set === "holdout" ? "-holdout" : ""}.json`);
  writeFileSync(file, JSON.stringify({ model, runs, total, costUsd: cost, rows }, null, 2));
  console.log(`Full responses: ${path.relative(process.cwd(), file)}`);
  if (writeReport) {
    const report = path.join(process.cwd(), "eval", set === "holdout" ? "REPORT-holdout.md" : "REPORT.md");
    writeFileSync(report, lines.join("\n") + `\n\nRaw results: \`${path.relative(process.cwd(), file)}\`\n`);
    console.log(`Report: ${path.relative(process.cwd(), report)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
