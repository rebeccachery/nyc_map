# Five-minute demo

A script for showing "ask the map" to someone who has not seen it. Each step says what to do, what should appear, and the point to make.

## Before you start

```bash
npm install
npm run verify        # tests, type check, basemap check, build
npm run dev           # http://localhost:3000
```

`.env.local` needs `ANTHROPIC_API_KEY`. Open `http://localhost:3000/map/miami`. The whole demo costs under one cent.

Figures below are from the 13 Nov 2026 snapshot and are the same on every run. The wording of each answer varies slightly.

## 1. The question the project started with (1 min)

**Type:** `Which Miami ZIPs have high need and no library within a mile?`

**You should see:** ten ZIPs listed (33460, 33435, 33461, 33030, 33034, 33444, 33403, 33445, 33404, 33436), highlighted on the map with the rest dimmed. Eight are in Palm Beach County, two in Miami-Dade, none in Broward.

**Say:** this took a few seconds and cost a tenth of a cent. Doing it by hand means joining Census tables to three county GIS portals and measuring distances.

## 2. Where the answer came from (1 min)

**Click:** "How this was answered" under the answer.

**You should see:** the definitions the answer rests on ("high need" is the top third of ZIPs on the composite score; distance is straight-line from the ZIP's nearest edge), the cited sources with links, the tool that ran, and the cost.

**Say:** the model did not calculate anything. It picked a query tool, ordinary tested code produced the figures, and the server checked that every ZIP and citation in the answer came from a tool result.

## 3. A place question (30 s)

**Click:** "New question", then type `What's the closest library to 33034?`

**You should see:** the nearest library named with its distance, and the map zoomed to that ZIP with the library marked.

**Say:** the map follows the answer. 33034 (Florida City) was missing from the map entirely before this project; the ZIP list had been typed by hand.

## 4. A comparison (30 s)

**Type:** `Compare Haitian ancestry across the three counties`

**You should see:** Broward 128,878 (6.6% of residents), Miami-Dade 114,958 (4.3%), Palm Beach 92,278 (6.2%).

**Say:** most people expect Miami-Dade to lead because of Little Haiti. Broward has more residents of Haitian ancestry and a higher share. The model itself got this wrong 2 times in 5 when this script was first written, while the test set was scoring 100%. The fix was to have code rank the counties instead of the model.

## 5. A question it should refuse (1 min)

**Type:** `Which Miami ZIPs have the lowest high school graduation rates?`

**You should see:** no ranking and no map highlight. The answer says graduation rates are not in the Miami data and offers the nearest thing it has: the share of adults without a high school diploma.

**Say:** this is the behavior that matters most for a nonprofit. A tool that makes up a ranking here would be worse than no tool. Three of the 40 test questions check for exactly this.

## 6. The proof (1 min)

**Open:** [`eval/REPORT.md`](../eval/REPORT.md).

**Say:**

- 40 questions, each run 3 times: 120 of 120 correct. 12 reworded questions (casual, misspelled, indirect): 36 of 36.
- The answer key comes from a separate Python program that shares no code with the app.
- The scorer was tested by corrupting real answers; it caught 44 of 45 changed numbers and every other corruption.
- The first perfect score was misleading. Reading the answers by hand found invented geography and unrequested advice, which is why [`eval/HISTORY.md`](../eval/HISTORY.md) lists twelve runs.

## If someone asks

| Question | Answer |
|---|---|
| What does it cost to run? | About $0.001 a question on Claude Haiku 5.5. A thousand questions a month is about $1. |
| Can it be wrong? | Yes. The questions were written by the builder, so real users will ask things the test set does not cover. The pilot plan in the write-up is how to find those. |
| How current is the data? | Census ACS 2022 five-year estimates; libraries and schools as of the snapshot date shown in each answer's sources. `npm run snapshot` refreshes it. |
| Does it remember the last question? | No. Each question is answered on its own. |
| Why libraries? | They are the best public stand-in for a tutoring site. The data has no tutoring programs. |
| What about New York? | It works at `/map/nyc`, with lighter test coverage (7 of 40 questions). |

## If something goes wrong

- **"Ask the map isn't set up"**: `ANTHROPIC_API_KEY` is missing from `.env.local`. Restart `npm run dev` after adding it.
- **Blank or watermarked background map**: run `npm run check:basemap`. The ask feature still works without the background.
- **The map layers take 20 to 30 seconds on first load**: the live map fetches Census data once and caches it for an hour. Load the page before the demo.
