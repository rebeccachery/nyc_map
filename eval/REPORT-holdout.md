# Ask-the-map evaluation: held-out rewordings

Model **Claude Haiku 5.5** (`claude-haiku-5-5`) · 12 questions × 3 runs = 36 answers · 2026-11-16
Data snapshots: miami 2026-11-13, nyc 2026-11-13

| Metric | Result |
|---|---|
| **Correct** (right data and the written answer states it) | **100%** (36/36) |
| Right data retrieved (tool level) | 100% |
| Written answer states the result | 100% |
| Grounded (no unverified ZIPs or dropped citations) | 100% |
| Unsupported geography claims (e.g. "western ZIPs") | 0% |
| Server fixes: leaked markup repaired / answer sent back for a rewrite | 11% / 0% |
| Latency p50 / p95 | 3.4 s / 5.5 s |
| Cost | $0.0332 total · $0.0009 per question |

## By category

| Category | Questions | Correct | Data | Text |
|---|---|---|---|---|
| spatial | 3 | 100% | 100% | 100% |
| lookup | 1 | 100% | 100% | 100% |
| filter_rank | 3 | 100% | 100% | 100% |
| compare | 3 | 100% | 100% | 100% |
| out_of_scope | 1 | 100% | 100% | 100% |
| compound | 1 | 100% | 100% | 100% |

## Consistency across 3 runs

- Correct in 3/3 runs: 12 questions
- Correct in 2/3 runs: 0 questions
- Correct in 1/3 runs: 0 questions
- Correct in 0/3 runs: 0 questions

## Can the scorer catch wrong answers?

Each answer that passed was corrupted the way an LLM plausibly goes wrong, then re-scored. A corruption "caught" means the text check failed it.

| Corruption | Caught |
|---|---|
| Changed a key number | 8/9 (89%) |
| Dropped a ZIP from a list | 15/15 (100%) |
| Swapped two ranked ZIPs | 3/3 (100%) |
| Named the wrong place | 3/3 (100%) |
| Picked the wrong region | 6/6 (100%) |
| Flipped a need tier | 0/0 |

Known blind spot: if an answer states the right figure and also a contradicting one, the text check passes it.

## Failures and flags

None.

Scoring: "data" re-runs each tool call the agent made (tools are deterministic) and compares with the answer key, which `eval/ground_truth.py` computes independently in Python. "Text" checks that the written answer states the expected figure, ZIPs (in order for rankings), place, or count; ambiguous questions must also state their interpretation; out-of-scope questions must be declined and name what's missing.

Raw results: `eval/results/2026-11-16T20-50-04-825Z-claude-haiku-5-5-holdout.json`
