import { describe, expect, it } from "vitest";
import { envelopeLift } from "../src/voice/envelopeLift";

const SR = 24000;

/** A synthetic vowel: a 250 Hz pulse train through three formant resonators. */
function vowel(formants: number[], seconds = 0.6): Float32Array {
  const n = Math.round(SR * seconds);
  let x = new Float64Array(n);
  for (let i = 0; i < n; i += SR / 250) x[Math.round(i)] = 1;
  for (const f of formants) {
    const r = Math.exp((-Math.PI * 80) / SR);
    const a1 = 2 * r * Math.cos((2 * Math.PI * f) / SR);
    const a2 = -r * r;
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = x[i]! + a1 * (y[i - 1] ?? 0) + a2 * (y[i - 2] ?? 0);
    x = y;
  }
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return Float32Array.from(x, (v) => (0.5 * v) / peak);
}

/** Power spectrum (dB) of the middle 4096 samples. */
function spectrum(x: Float32Array): number[] {
  const n = 4096;
  const start = Math.floor((x.length - n) / 2);
  const out: number[] = [];
  for (let k = 0; k <= n / 2; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i += 1) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
      const a = (2 * Math.PI * k * i) / n;
      re += x[start + i]! * w * Math.cos(a);
      im -= x[start + i]! * w * Math.sin(a);
    }
    out.push(10 * Math.log10(re * re + im * im + 1e-12));
  }
  return out;
}

/** Strongest harmonic in [lo, hi] Hz: where the formant's peak shows. */
function peakHz(spec: number[], lo: number, hi: number): number {
  const hz = (k: number) => (k * SR) / 4096;
  let best = -Infinity;
  let at = 0;
  spec.forEach((v, k) => {
    if (hz(k) >= lo && hz(k) <= hi && v > best) {
      best = v;
      at = hz(k);
    }
  });
  return at;
}

describe("even formant lift", () => {
  it("leaves the voice untouched at 1", () => {
    const x = vowel([700, 1200, 2600]);
    expect(envelopeLift(x, SR, 1)).toBe(x);
  });

  it("keeps the length and gives the same result every time", () => {
    const x = vowel([700, 1200, 2600]);
    const a = envelopeLift(x, SR, 1.07);
    const b = envelopeLift(x, SR, 1.07);
    expect(a.length).toBe(x.length);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
    expect(a.every((v) => Number.isFinite(v) && Math.abs(v) < 2)).toBe(true);
  });

  it("raises the formants but leaves the pitch (the harmonics) where they were", () => {
    const x = vowel([700, 1200, 2600]);
    const y = envelopeLift(x, SR, 1.2);
    const sx = spectrum(x);
    const sy = spectrum(y);
    // the harmonics are still at multiples of 250 Hz: energy at 250 Hz stays a peak
    const k250 = Math.round((250 * 4096) / SR);
    const k375 = Math.round((375 * 4096) / SR);
    expect(sy[k250]! - sy[k375]!).toBeGreaterThan(20);
    // the second formant's peak moves up to the next harmonics (1200 -> ~1440 Hz)
    expect(peakHz(sx, 1000, 1700)).toBeCloseTo(1250, -2);
    expect(peakHz(sy, 1000, 1700)).toBeGreaterThan(1350);
    // and the third (2600 -> ~3120 Hz)
    expect(peakHz(sy, 2300, 3500)).toBeGreaterThan(2900);
  });
});
