/**
 * Converts audio to another sample rate with a windowed-sinc polyphase filter
 * (high quality, like the browser's own decoder, unlike the straight-line
 * interpolation Chrome uses when it plays a buffer at another rate). The
 * filter weights are worked out once per pair of rates, so converting a
 * sentence takes a few milliseconds.
 */

const TAPS = 24;
const tables = new Map<string, { up: number; down: number; weights: Float32Array[] }>();

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function table(from: number, to: number) {
  const name = `${from}>${to}`;
  let t = tables.get(name);
  if (t) return t;
  const g = gcd(Math.round(from), Math.round(to));
  const up = Math.round(to) / g;
  const down = Math.round(from) / g;
  // Below the lower of the two rates' limits, so nothing aliases either way.
  const cutoff = Math.min(1, up / down);
  const weights: Float32Array[] = [];
  for (let phase = 0; phase < up; phase++) {
    const w = new Float32Array(2 * TAPS);
    let sum = 0;
    for (let k = -TAPS + 1; k <= TAPS; k++) {
      const d = phase / up - k;
      const arg = Math.PI * d * cutoff;
      const sinc = d === 0 ? 1 : Math.sin(arg) / arg;
      const win = 0.5 + 0.5 * Math.cos((Math.PI * d) / (TAPS + 1));
      w[k + TAPS - 1] = sinc * win;
      sum += sinc * win;
    }
    for (let i = 0; i < w.length; i++) w[i]! /= sum;
    weights.push(w);
  }
  t = { up, down, weights };
  tables.set(name, t);
  return t;
}

export function convertRate(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const { up, down, weights } = table(from, to);
  const out = new Float32Array(Math.floor((x.length * up) / down));
  for (let n = 0; n < out.length; n++) {
    const pos = n * down;
    const base = Math.floor(pos / up);
    const w = weights[pos % up]!;
    let s = 0;
    for (let k = -TAPS + 1; k <= TAPS; k++) {
      const i = base + k;
      if (i >= 0 && i < x.length) s += x[i]! * w[k + TAPS - 1]!;
    }
    out[n] = s;
  }
  return out;
}
