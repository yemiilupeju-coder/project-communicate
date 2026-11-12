import { describe, expect, it } from "vitest";
import { formatMs, percentile, summarize } from "../src/shared/stats";

describe("percentile", () => {
  it("uses nearest rank and does not mutate input", () => {
    const samples = [50, 10, 40, 20, 30];
    expect(percentile(samples, 50)).toBe(30);
    expect(percentile(samples, 95)).toBe(50);
    expect(percentile(samples, 0)).toBe(10);
    expect(samples).toEqual([50, 10, 40, 20, 30]);
  });

  it("returns NaN for no samples and rejects out-of-range p", () => {
    expect(percentile([], 50)).toBeNaN();
    expect(() => percentile([1], 101)).toThrow(RangeError);
    expect(() => percentile([1], -1)).toThrow(RangeError);
  });
});

describe("summarize", () => {
  it("summarizes timings", () => {
    const s = summarize([10, 20, 30, 40]);
    expect(s).toMatchObject({ count: 4, min: 10, max: 40, median: 20, p95: 40, mean: 25 });
  });

  it("handles an empty list without throwing", () => {
    const s = summarize([]);
    expect(s.count).toBe(0);
    expect(s.median).toBeNaN();
  });
});

describe("formatMs", () => {
  it("formats small, large and missing values", () => {
    expect(formatMs(4.25)).toBe("4.3 ms");
    expect(formatMs(123.6)).toBe("124 ms");
    expect(formatMs(Number.NaN)).toBe("—");
  });
});
