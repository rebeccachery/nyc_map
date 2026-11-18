# Evaluation history

How the ask-the-map agent got to its current score, run by run. All runs use Claude Haiku 5.5 on the 13 Nov 2026 data snapshots. Runs 1 to 11 were on 15 Nov 2026. Raw responses for every run are in `eval/results/`.

| # | Run | Set × runs | Correct | What it found | What changed |
|---|---|---|---|---|---|
| 1 | `2026-11-15T00-59` | 15 × 1 | 14/15 (data only) | G15 (graduation rates): answered in words as out of scope but status "answered". 7 of 19 early answers had tool-call markup leaked into a text field, silently dropping citations, the map choice, and follow-ups. | Explicit out-of-scope rule. Free-text field moved last in the answer schema; server repairs leaked markup. Server picks the map (the model couldn't name its own tool calls). |
| 2 | `01-01` | 4 × 1 | 4/4 | Fixes hold. | — |
| 3 | `01-08` | 15 × 1 | 15/15 | Leak moved to `answer` (2/15), both repaired. | — |
| 4 | `03-00` | 40 × 1 | 39/40 | Golden set grown to 40 with answer-text checks. The one failure was the scorer: it wanted 33.8% but the prompt asks for whole numbers ("34%"). | Text checks accept whole-number rounding of rates and scores. |
| 5 | `03-02` | 40 × 3 | 120/120 | A perfect score, so answers were read by hand. Found: invented geography ("concentrated in the western and central ZIPs"), a miscount of its own list ("ten of thirteen shown" while listing five), and unrequested advice. None of these are caught by checking figures. | Prompt: don't describe where ZIPs are or recommend actions unless a tool supports it; say exactly how many results are listed. New report flag for unsupported geography. Scorer self-test added (corrupts real answers, checks they fail). |
| 6 | `03-06` | 40 × 3 | 113/120 | The prompt change exposed new failures. G12 0/3: "Miami-Dade has more… wait, Broward is higher" (self-correction inside the answer). G37/G15: the out-of-scope rule didn't distinguish a stand-in for the same concept (families → residents) from a different measure (diploma rates ≠ graduation rates), so the agent swung both ways. G30: correct answer via `get_zip`, which the scorer didn't recognize. | Prompt: stand-in vs different measure, with examples; no mid-answer corrections. Server: an answer containing a self-correction is sent back once for a clean rewrite. Scorer: nearest place also read from `get_zip`. |
| 7 | `03-09` | 40 × 3 | 120/120 | One "not grounded" flag that wasn't a trust issue (a data tool called in the same turn as the final answer). | That notice moved from user-facing warnings to internal diagnostics. |
| 8 | `03-12` | 40 × 3 | 120/120 | 100% grounded. Prompt tuning stopped here. | — |
| 9 | `03-13` holdout | 12 × 3 | 33/36 | 12 rewordings written after tuning (casual, typos, indirect). All 3 misses were the scorer: a reworded refusal still required the word "graduation"; a count read from `get_zip`. One answer showed an internal field name ("pctNoHS") to the user (1 of 556 answers so far). | Held-out questions can set their own required words. Scorer reads within-1-mile counts from `get_zip`. Prompt and server guard against internal names in answers (sent back for a rewrite). |
| 10 | `03-16` golden + holdout | 40 × 3, 12 × 3 | 120/120, 36/36 | G34 listed a Miami-Dade ZIP (33012) that no tool returned for a Broward question. The ZIP guard caught it as a warning; the count was still right. | An answer naming a ZIP no tool returned is now also sent back once for a rewrite, not just flagged. |
| 11 | `03-19` golden + holdout | 40 × 3, 12 × 3 | 120/120, 36/36 | 100% grounded, no flags. Rewrites needed in 1% of answers; leaked markup repaired in about 10%. | — |
| 12 | `2026-11-16` golden + holdout | 40 × 3, 12 × 3 | **120/120, 36/36** | Prompted by a question outside the golden set, tried while writing the demo script: "Compare Haitian ancestry across the three counties". 2 of 5 answers said Miami-Dade has the largest count (114,958) when Broward's is larger (128,878); one corrected itself in brackets ("Broward's count is actually slightly higher"), which the self-correction check missed. The golden set had passed 120/120 the whole time. | `summarize_regions` now returns `rankings` (regions ordered highest first on each figure, computed in code) and the prompt forbids the model from deciding which number is larger. Any "actually" in an answer triggers a rewrite. After the change: 10 of 10 correct on that question. Final; see `REPORT.md` and `REPORT-holdout.md`. |

## What the scores do and don't show

- **Strong evidence:** for questions like these, the agent retrieves the right data and states it correctly, consistently across runs (every question right 3/3), at about $0.001 and 4 seconds per question. The scorer was itself tested: corruptions applied to real answers (changed number, dropped ZIP, swapped ranking, wrong place, wrong region, flipped tier) are caught, except 1 of 45 changed numbers across the final golden and held-out runs.
- **Limits:**
  - The questions were written by the builder, and the prompt was tuned on the 40-question set. The 12 held-out rewordings show robustness to phrasing, not to new kinds of question. Run 12 is the proof: the first new kind of question tried (a three-way comparison) was wrong 2 times in 5 while the golden set scored 100%.
  - Single-turn only: no follow-up context.
  - Miami-heavy (33 of 40); NYC is lightly covered.
  - The text check passes an answer that states the right figure and also a contradicting one (never seen in a real answer).
  - Qualitative problems (tone, emphasis, helpfulness) still need human review; run 5 shows why.
- **Next step in a real deployment:** collect real questions from staff during a pilot, add them to the golden set, and track the same metrics on each prompt or model change.
