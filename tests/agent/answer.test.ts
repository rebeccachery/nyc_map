import { describe, expect, it } from "vitest";
import { repairSubmitInput, submitAnswerInput, SUBMIT_ANSWER_TOOL } from "@/lib/agent/answer";

// Verbatim shapes seen in live Haiku runs (eval G06, G10, G12).
const LEAKED_G10 = {
  status: "answered",
  answer: "Five high-need Broward ZIPs have more than 12% of households without internet.",
  interpretation:
    'Read "more than 12%" as strictly above 12 percent of households without internet.</interpretation>\n<parameter name="citations">["zip:33311","zip:33060","zip:33313","zip:33441","zip:33027"]',
  citations: [],
  map_tool_use_id: "",
  follow_ups: [],
};

describe("repairSubmitInput", () => {
  it("strips leaked markup and recovers the fields written inside it", () => {
    const { input, repaired } = repairSubmitInput(LEAKED_G10);
    const parsed = submitAnswerInput.parse(input);
    expect(parsed.interpretation).toBe('Read "more than 12%" as strictly above 12 percent of households without internet.');
    expect(parsed.citations).toEqual(["zip:33311", "zip:33060", "zip:33313", "zip:33441", "zip:33027"]);
    expect(repaired).toEqual(["interpretation", "citations (recovered)"]);
  });

  it("recovers several leaked parameters, including booleans and lists", () => {
    const { input } = repairSubmitInput({
      status: "answered",
      answer: 'Brooklyn leads.</answer>\n<parameter name="show_map">false</parameter>\n<parameter name="follow_ups">["What about Queens?"]',
      citations: [],
      show_map: true,
      follow_ups: [],
      interpretation: "",
    });
    const parsed = submitAnswerInput.parse(input);
    expect(parsed.answer).toBe("Brooklyn leads.");
    expect(parsed.follow_ups).toEqual(["What about Queens?"]);
    // show_map was already set (true), so the leaked value does not override it.
    expect(parsed.show_map).toBe(true);
  });

  it("never overwrites a field the model filled correctly", () => {
    const { input } = repairSubmitInput({
      ...LEAKED_G10,
      citations: ["zip:33311"],
    });
    expect((input as { citations: string[] }).citations).toEqual(["zip:33311"]);
  });

  it("leaves clean input untouched, including ordinary angle brackets", () => {
    const clean = { status: "answered", answer: "Scores < 36.4 are low; 3 < 5.", interpretation: "", citations: ["zip:1"], show_map: true, follow_ups: [] };
    expect(repairSubmitInput(clean)).toEqual({ input: clean, repaired: [] });
  });

  it("ignores malformed leaked JSON instead of throwing", () => {
    const { input, repaired } = repairSubmitInput({
      ...LEAKED_G10,
      interpretation: 'x</interpretation><parameter name="citations">["zip:1",',
    });
    expect((input as { citations: string[] }).citations).toEqual([]);
    expect(repaired).toEqual(["interpretation"]);
  });
});

describe("submit_answer schema", () => {
  it("puts free-text interpretation last so a leak there cannot swallow other fields", () => {
    const schema = SUBMIT_ANSWER_TOOL.input_schema as { properties: object; required: string[] };
    expect(Object.keys(schema.properties).at(-1)).toBe("interpretation");
    expect(schema.required.at(-1)).toBe("interpretation");
  });
});
