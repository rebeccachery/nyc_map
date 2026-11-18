# Ask-the-map evaluation

Model **Claude Haiku 5.5** (`claude-haiku-5-5`) · 40 questions × 3 runs = 120 answers · 2026-11-16
Data snapshots: miami 2026-11-13, nyc 2026-11-13

| Metric | Result |
|---|---|
| **Correct** (right data and the written answer states it) | **100%** (120/120) |
| Right data retrieved (tool level) | 100% |
| Written answer states the result | 100% |
| Grounded (no unverified ZIPs or dropped citations) | 100% |
| Unsupported geography claims (e.g. "western ZIPs") | 0% |
| Server fixes: leaked markup repaired / answer sent back for a rewrite | 9% / 0% |
| Latency p50 / p95 | 3.8 s / 6.4 s |
| Cost | $0.1107 total · $0.0009 per question |

## By category

| Category | Questions | Correct | Data | Text |
|---|---|---|---|---|
| lookup | 8 | 100% | 100% | 100% |
| filter_rank | 8 | 100% | 100% | 100% |
| spatial | 8 | 100% | 100% | 100% |
| compound | 6 | 100% | 100% | 100% |
| compare | 4 | 100% | 100% | 100% |
| ambiguous | 3 | 100% | 100% | 100% |
| out_of_scope | 3 | 100% | 100% | 100% |

## Consistency across 3 runs

- Correct in 3/3 runs: 40 questions
- Correct in 2/3 runs: 0 questions
- Correct in 1/3 runs: 0 questions
- Correct in 0/3 runs: 0 questions

## Can the scorer catch wrong answers?

Each answer that passed was corrupted the way an LLM plausibly goes wrong, then re-scored. A corruption "caught" means the text check failed it.

| Corruption | Caught |
|---|---|
| Changed a key number | 36/36 (100%) |
| Dropped a ZIP from a list | 42/42 (100%) |
| Swapped two ranked ZIPs | 15/15 (100%) |
| Named the wrong place | 12/12 (100%) |
| Picked the wrong region | 6/6 (100%) |
| Flipped a need tier | 6/6 (100%) |

Known blind spot: if an answer states the right figure and also a contradicting one, the text check passes it.

## Failures and flags

None.

Scoring: "data" re-runs each tool call the agent made (tools are deterministic) and compares with the answer key, which `eval/ground_truth.py` computes independently in Python. "Text" checks that the written answer states the expected figure, ZIPs (in order for rankings), place, or count; ambiguous questions must also state their interpretation; out-of-scope questions must be declined and name what's missing.

Raw results: `eval/results/2026-11-16T20-49-37-938Z-claude-haiku-5-5.json`
