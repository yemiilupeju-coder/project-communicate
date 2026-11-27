/**
 * Loudness as people hear it (ITU-R BS.1770-4 / EBU R128), so every clip,
 * word or sentence, girl or boy, plays at the same loudness. Peak
 * normalisation (the old way) left quiet-sounding words and loud-sounding
 * ones, and the boy louder than the girl.
 */

/**
 * The K-weighting filters' coefficients for this sample rate, as derived by
 * Brecht De Man to match the coefficients published in ITU-R BS.1770 exactly.
 */
function biquad(kind: "shelf" | "highpass", sr: number) {
  if (kind === "shelf") {
    const G = 3.99984385397;
    const Q = 0.7071752369554193;
    const K = Math.tan((Math.PI * 1681.9744509555319) / sr);
    const Vh = 10 ** (G / 20);
    const Vb = Vh ** 0.499666774155;
    const a0 = 1 + K / Q + K * K;
    return [
      (Vh + (Vb * K) / Q + K * K) / a0,
      (2 * (K * K - Vh)) / a0,
      (Vh - (Vb * K) / Q + K * K) / a0,
      (2 * (K * K - 1)) / a0,
      (1 - K / Q + K * K) / a0,
    ] as const;
  }
  const Q = 0.5003270373253953;
  const K = Math.tan((Math.PI * 38.13547087613982) / sr);
  const a0 = 1 + K / Q + K * K;
  return [1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] as const;
}

function filter(
  x: Float32Array,
  [b0, b1, b2, a1, a2]: readonly [number, number, number, number, number],
): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** Integrated loudness in LUFS (gated 400 ms blocks; a clip shorter than a block is one block). */
export function loudness(x: Float32Array, sr: number): number {
  const k = filter(filter(x, biquad("shelf", sr)), biquad("highpass", sr));
  const block = Math.round(0.4 * sr);
  const step = Math.round(0.1 * sr);
  const powers: number[] = [];
  if (k.length <= block) {
    let s = 0;
    for (const v of k) s += v * v;
    powers.push(s / Math.max(1, k.length));
  } else {
    for (let i = 0; i + block <= k.length; i += step) {
      let s = 0;
      for (let j = i; j < i + block; j++) s += k[j]! * k[j]!;
      powers.push(s / block);
    }
  }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p + 1e-12);
  const audible = powers.filter((p) => lufs(p) > -70);
  if (audible.length === 0) return -Infinity;
  const mean = (ps: number[]) => ps.reduce((a, b) => a + b, 0) / ps.length;
  const relative = lufs(mean(audible)) - 10;
  const gated = audible.filter((p) => lufs(p) > relative);
  return lufs(mean(gated.length ? gated : audible));
}

/** The highest peak including between samples (4× oversampled, as true-peak meters do). */
export function truePeak(x: Float32Array): number {
  let peak = 0;
  const taps = 8;
  for (let i = 0; i < x.length; i++) {
    peak = Math.max(peak, Math.abs(x[i]!));
    for (const frac of [0.25, 0.5, 0.75]) {
      let s = 0;
      for (let k = -taps + 1; k <= taps; k++) {
        const j = i + k;
        if (j < 0 || j >= x.length) continue;
        const t = frac - k;
        const sinc = Math.sin(Math.PI * t) / (Math.PI * t);
        const w = 0.5 + 0.5 * Math.cos((Math.PI * t) / taps);
        s += x[j]! * sinc * w;
      }
      peak = Math.max(peak, Math.abs(s));
    }
  }
  return peak;
}

/** Every clip is set to this loudness... */
export const TARGET_LUFS = -16;
/** ...unless its true peak would pass this (dBTP), so nothing clips after encoding. */
export const PEAK_CEILING_DBTP = -1.5;

/**
 * Brings a clip to the target loudness (in place). The few peaks that would
 * then pass the ceiling, mostly the burst of a "p" or "t", are turned down on
 * their own by a gentle limiter (3 ms look-ahead, 40 ms recovery), instead of
 * turning the whole clip down, which left peaky voices quieter than others.
 */
export function normaliseLoudness(x: Float32Array, sr: number): void {
  const lufs = loudness(x, sr);
  if (!Number.isFinite(lufs)) return;
  const gain = 10 ** ((TARGET_LUFS - lufs) / 20);
  // Samples are held a little under the ceiling, leaving room for the peaks
  // between samples.
  const ceiling = 10 ** ((PEAK_CEILING_DBTP - 0.5) / 20);
  const need = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]!) * gain;
    need[i] = v > ceiling ? ceiling / v : 1;
  }
  // Look ahead: start turning down before a peak arrives.
  const ahead = Math.round(0.003 * sr);
  const held = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let m = 1;
    for (let k = Math.max(0, i - ahead); k <= Math.min(x.length - 1, i + ahead); k++)
      m = Math.min(m, need[k]!);
    held[i] = m;
  }
  // Recover smoothly; never louder than allowed.
  const release = Math.exp(-1 / (0.04 * sr));
  let g = 1;
  for (let i = 0; i < x.length; i++) {
    const target = held[i]!;
    g = target < g ? target : target + (g - target) * release;
    x[i]! *= gain * g;
  }
}
