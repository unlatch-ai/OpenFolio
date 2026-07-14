import { describe, expect, it } from "vitest";
import { normalizeQueryForFts } from "../src/utils.js";

describe("search query normalization", () => {
  it("drops conversational glue words that otherwise swamp exact search", () => {
    expect(normalizeQueryForFts("the ramen place Jordan recommended"))
      .toBe('"ramen"* OR "place"* OR "Jordan"* OR "recommended"*');
  });

  it("keeps a stopword-only query searchable and quotes punctuation safely", () => {
    expect(normalizeQueryForFts("the")).toBe('"the"*');
    expect(normalizeQueryForFts("ramen?")).toBe('"ramen"*');
  });
});
