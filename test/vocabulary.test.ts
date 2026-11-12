import { describe, expect, it } from "vitest";
import { CORE_WORDS, PHRASES, SPIKE_VOCABULARY, TEST_SENTENCE } from "../src/spikes/voice/phrases";

describe("spike vocabulary", () => {
  it("has 100 words and 100 phrases, 200 unique items in total", () => {
    expect(CORE_WORDS).toHaveLength(100);
    expect(PHRASES).toHaveLength(100);
    expect(new Set(SPIKE_VOCABULARY).size).toBe(200);
  });

  it("has no empty or padded entries", () => {
    for (const item of SPIKE_VOCABULARY) {
      expect(item.trim()).toBe(item);
      expect(item.length).toBeGreaterThan(0);
    }
  });

  it("contains every word of the test sentence", () => {
    for (const word of TEST_SENTENCE) {
      expect(SPIKE_VOCABULARY).toContain(word);
    }
  });
});
