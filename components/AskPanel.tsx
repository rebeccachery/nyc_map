"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EXAMPLE_QUESTIONS, type AskResponse } from "@/lib/askClient";
import type { MetroConfig } from "@/lib/metroRegistry";

type AskPanelProps = {
  metro: MetroConfig;
  result: AskResponse | null;
  loading: boolean;
  error: string | null;
  onAsk: (question: string) => void;
  onCancel: () => void;
  /** Remove the answer's highlight from the map but keep the answer. */
  onClearMap: () => void;
  /** Discard the answer and its map highlight. */
  onReset: () => void;
  onSelectZip: (zcta: string) => void;
  mapActive: boolean;
};

const STATUS_COPY: Record<AskResponse["status"], { label: string; className: string } | null> = {
  answered: null,
  out_of_scope: { label: "Not in this data", className: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  needs_clarification: { label: "Needs more detail", className: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  refused: { label: "Can't answer", className: "border-zinc-700 bg-zinc-800/60 text-zinc-300" },
  error: { label: "Something went wrong", className: "border-red-500/30 bg-red-500/10 text-red-300" },
};

/** Renders answer text, turning cited ZIP codes into buttons and "- " lines into a list. */
function AnswerText({
  text,
  citedZips,
  onSelectZip,
}: {
  text: string;
  citedZips: Set<string>;
  onSelectZip: (z: string) => void;
}) {
  const inline = (line: string, key: string) =>
    line.split(/\b(\d{5})\b/).map((part, i) =>
      i % 2 === 1 && citedZips.has(part) ? (
        <button
          key={`${key}-${i}`}
          type="button"
          onClick={() => onSelectZip(part)}
          className="inline rounded font-semibold text-orange-300 underline decoration-orange-500/40 underline-offset-2 hover:bg-orange-500/10 hover:text-orange-200"
          title={`Show ${part} on the map`}
        >
          {part}
        </button>
      ) : (
        <span key={`${key}-${i}`}>{part}</span>
      )
    );

  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    const items = list;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="ml-4 list-disc space-y-0.5">
        {items.map((l, i) => (
          <li key={i}>{inline(l, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>
    );
    list = [];
  };
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (bullet) list.push(bullet[1]);
    else {
      flush();
      blocks.push(<p key={`p-${blocks.length}`}>{inline(line, `p-${blocks.length}`)}</p>);
    }
  }
  flush();
  return <div className="space-y-2 text-[13px] leading-relaxed text-zinc-200">{blocks}</div>;
}

export default function AskPanel({
  metro,
  result,
  loading,
  error,
  onAsk,
  onCancel,
  onClearMap,
  onReset,
  onSelectZip,
  mapActive,
}: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const examples = EXAMPLE_QUESTIONS[metro.id];

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => {
      clearInterval(t);
      setElapsed(0);
    };
  }, [loading]);

  const citedZips = useMemo(
    () => new Set((result?.citations ?? []).filter((c) => c.id.startsWith("zip:")).map((c) => c.id.slice(4))),
    [result]
  );

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setQuestion(trimmed);
    onAsk(trimmed);
  };

  const status = result ? STATUS_COPY[result.status] : null;
  const zipCount = result?.map?.highlightZips.length ?? 0;
  const tools = result?.trace.map((t) => t.tool.replace(/_/g, " ")).join(" → ");

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <label htmlFor="ask-input" className="text-section-title">
          Ask the map
        </label>
        <p className="mt-1 text-caption">
          Ask about need, Haitian communities, libraries, and schools across {metro.label}. Answers
          come from the map&apos;s data and cite their sources.
        </p>
        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900 focus-within:border-orange-500/50 focus-within:ring-1 focus-within:ring-orange-500/30">
          <textarea
            id="ask-input"
            ref={inputRef}
            rows={3}
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(question);
              }
            }}
            placeholder={examples[0]}
            disabled={loading}
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] text-zinc-100 placeholder:text-zinc-600 outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="pl-1 text-[10px] text-zinc-600">{question.length > 400 ? `${question.length}/500` : "Enter to ask"}</span>
            {loading ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
            ) : (
              <button
                type="submit"
                disabled={!question.trim()}
                className="rounded-lg border border-orange-500/40 bg-orange-500/15 px-3 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Ask
              </button>
            )}
          </div>
        </div>
      </form>

      {!result && !loading && !error && (
        <div>
          <p className="text-section-title">Try</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {examples.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => submit(q)}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left text-xs text-zinc-300 transition hover:border-orange-500/30 hover:bg-orange-500/5 hover:text-zinc-100"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-3" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
            </span>
            {elapsed < 4 ? "Reading your question…" : elapsed < 10 ? "Checking the data…" : "Still working…"}
            <span className="ml-auto tabular-nums text-zinc-600">{elapsed}s</span>
          </div>
          <div className="mt-3 animate-pulse space-y-2">
            <div className="h-2.5 w-full rounded bg-zinc-800" />
            <div className="h-2.5 w-5/6 rounded bg-zinc-800" />
            <div className="h-2.5 w-2/3 rounded bg-zinc-800" />
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-950/60 bg-red-950/20 p-3 text-xs text-red-300" role="alert">
          {error}
          <button
            type="button"
            onClick={() => submit(question)}
            className="ml-2 font-semibold text-red-200 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {result && !loading && (
        <article className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3" aria-live="polite">
          {status && (
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}>
              {status.label}
            </span>
          )}

          <AnswerText text={result.answer} citedZips={citedZips} onSelectZip={onSelectZip} />

          {result.interpretation && (
            <p className="text-caption italic text-zinc-400">{result.interpretation}</p>
          )}

          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-300">
              Some details couldn&apos;t be verified against the data. Check the figures on the map before relying on them.
            </div>
          )}

          {zipCount > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-orange-500/20 bg-orange-500/5 px-2.5 py-2 text-[11px]">
              <span className="text-orange-200">
                {mapActive
                  ? `Map shows ${zipCount} ${zipCount === 1 ? "ZIP" : "ZIPs"} from this answer`
                  : `${zipCount} ${zipCount === 1 ? "ZIP" : "ZIPs"} in this answer`}
              </span>
              {mapActive && (
                <button type="button" onClick={onClearMap} className="font-semibold text-orange-300 hover:text-orange-200">
                  Clear map
                </button>
              )}
            </div>
          )}

          {result.citations.length > 0 && (
            <div>
              <p className="text-section-title">Cited records</p>
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {result.citations.slice(0, 24).map((c) => (
                  <li key={c.id}>
                    {c.id.startsWith("zip:") ? (
                      <button
                        type="button"
                        onClick={() => onSelectZip(c.id.slice(4))}
                        className="rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-orange-500/30 hover:text-orange-200"
                      >
                        {c.label}
                      </button>
                    ) : (
                      <span className="inline-block rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {c.label}
                      </span>
                    )}
                  </li>
                ))}
                {result.citations.length > 24 && (
                  <li className="px-1 py-0.5 text-[10px] text-zinc-500">+{result.citations.length - 24} more</li>
                )}
              </ul>
            </div>
          )}

          {result.followUps.length > 0 && (
            <div>
              <p className="text-section-title">Ask next</p>
              <div className="mt-1.5 flex flex-col gap-1">
                {result.followUps.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => submit(q)}
                    className="rounded-lg px-2 py-1 text-left text-xs text-cyan-300 hover:bg-cyan-500/5 hover:text-cyan-200"
                  >
                    → {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <details className="group rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2.5">
            <summary className="cursor-pointer text-[11px] font-semibold text-zinc-400 group-open:text-zinc-300">
              How this was answered
            </summary>
            <div className="mt-2 space-y-2.5">
              {result.assumptions.length > 0 && (
                <div>
                  <p className="text-section-title">Definitions and assumptions</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-caption text-zinc-400">
                    {result.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.sources.length > 0 && (
                <div>
                  <p className="text-section-title">Sources</p>
                  <ul className="mt-1 space-y-0.5 text-caption">
                    {result.sources.map((s) => (
                      <li key={s.id}>
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300">
                          {s.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.warnings.length > 0 && (
                <div>
                  <p className="text-section-title">Checks that flagged</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-caption text-amber-300/80">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-caption text-zinc-600">
                {tools ? `Looked up: ${tools}. ` : ""}
                {(result.latencyMs / 1000).toFixed(1)}s · ~${result.costUsd.toFixed(4)} · Census ACS 2022 5-year estimates
              </p>
            </div>
          </details>

          <button
            type="button"
            onClick={() => {
              onReset();
              setQuestion("");
              inputRef.current?.focus();
            }}
            className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-300"
          >
            New question
          </button>
        </article>
      )}
    </div>
  );
}
