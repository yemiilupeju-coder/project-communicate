/** Summary statistics for timing samples (milliseconds). */
export interface TimingSummary {
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
  mean: number;
}

/**
 * Nearest-rank percentile. `p` is in [0, 100]. Returns NaN for an empty list.
 * Input does not need to be sorted and is not mutated.
 */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) return Number.NaN;
  if (p < 0 || p > 100 || Number.isNaN(p)) {
    throw new RangeError(`percentile must be between 0 and 100, got ${p}`);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  // rank is within 1..length, so the element exists.
  return sorted[rank - 1] as number;
}

export function summarize(samples: readonly number[]): TimingSummary {
  if (samples.length === 0) {
    return { count: 0, min: NaN, median: NaN, p95: NaN, max: NaN, mean: NaN };
  }
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    count: samples.length,
    min: Math.min(...samples),
    median: percentile(samples, 50),
    p95: percentile(samples, 95),
    max: Math.max(...samples),
    mean: total / samples.length,
  };
}

/** Formats a millisecond value for display; NaN renders as an em dash. */
export function formatMs(value: number): string {
  if (Number.isNaN(value)) return "—";
  return value < 10 ? `${value.toFixed(1)} ms` : `${Math.round(value)} ms`;
}
