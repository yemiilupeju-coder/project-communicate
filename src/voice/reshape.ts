/**
 * Reshapes an adult voice into a child's: the same three changes as Praat's
 * "Change gender" (Boersma & Weenink), written in TypeScript so the build
 * script and every device produce identical clips.
 *
 * 1. Formants up (a shorter vocal tract): band-limited resampling, which
 *    raises every frequency by `formant` and shortens the sound.
 * 2. Pitch to the target median, with the range widened (livelier): TD-PSOLA,
 *    which changes pitch without moving the formants.
 * 3. Duration: PSOLA restores the length and applies `duration`.
 */

export interface ReshapeSettings {
  /** Formant shift ratio, e.g. 1.16. */
  readonly formant: number;
  /** New median pitch in Hz, e.g. 285. */
  readonly median: number;
  /** Pitch range factor around the median, e.g. 1.3 (1 = unchanged). */
  readonly range: number;
  /** Duration factor, e.g. 1.06 (slightly slower). */
  readonly duration: number;
}

const FLOOR = 75;
const CEILING = 600;
const STEP_SECONDS = 0.01;

/** Pitch (Hz) every 10 ms by normalised autocorrelation; 0 where unvoiced. */
export function trackPitch(x: Float32Array, sr: number): Float32Array {
  const step = Math.round(sr * STEP_SECONDS);
  const win = Math.round((sr / FLOOR) * 2.5);
  const minLag = Math.floor(sr / CEILING);
  const maxLag = Math.ceil(sr / FLOOR);
  const frames = Math.max(1, Math.floor(x.length / step));
  const f0 = new Float32Array(frames);
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]!));
  const silence = (peak * 0.04) ** 2;
  for (let f = 0; f < frames; f++) {
    const start = f * step - (win >> 1);
    if (start < 0 || start + win + maxLag >= x.length) continue;
    let energy = 0;
    for (let i = 0; i < win; i++) energy += x[start + i]! ** 2;
    if (energy / win < silence) continue;
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      let e2 = 0;
      for (let i = 0; i < win; i++) {
        const b = x[start + i + lag]!;
        sum += x[start + i]! * b;
        e2 += b * b;
      }
      const r = sum / Math.sqrt(energy * e2 + 1e-12);
      // A slight preference for shorter lags avoids octave-down errors.
      const score = r * (1 - 0.0005 * (lag - minLag));
      if (score > best) {
        best = score;
        bestLag = lag;
      }
    }
    if (best > 0.5 && bestLag > 0) f0[f] = sr / bestLag;
  }
  // Median of 5 frames removes single-frame jumps; very short voiced runs are noise.
  const smooth = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    if (f0[f] === 0) continue;
    const near: number[] = [];
    for (let k = f - 2; k <= f + 2; k++) if (k >= 0 && k < frames && f0[k]! > 0) near.push(f0[k]!);
    near.sort((a, b) => a - b);
    smooth[f] = near[near.length >> 1]!;
  }
  for (let f = 0; f < frames;) {
    if (smooth[f] === 0) {
      f++;
      continue;
    }
    let end = f;
    while (end < frames && smooth[end]! > 0) end++;
    if (end - f < 3) smooth.fill(0, f, end);
    f = end;
  }
  return smooth;
}

function median(values: Float32Array): number {
  const voiced = Array.from(values).filter((v) => v > 0);
  if (voiced.length === 0) return 0;
  voiced.sort((a, b) => a - b);
  return voiced[voiced.length >> 1]!;
}

/** Reads the sound faster by `ratio` with a windowed-sinc low-pass, so nothing aliases. */
export function resample(x: Float32Array, ratio: number, taps = 24): Float32Array {
  const out = new Float32Array(Math.floor(x.length / ratio));
  const cutoff = Math.min(1, 1 / ratio);
  for (let n = 0; n < out.length; n++) {
    const t = n * ratio;
    const centre = Math.floor(t);
    let sum = 0;
    let norm = 0;
    for (let k = centre - taps + 1; k <= centre + taps; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = t - k;
      const arg = Math.PI * d * cutoff;
      const sinc = d === 0 ? 1 : Math.sin(arg) / arg;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / taps);
      const h = sinc * w;
      sum += x[k]! * h;
      norm += h;
    }
    out[n] = norm !== 0 ? sum / norm : 0;
  }
  return out;
}

/**
 * Analysis marks: one per pitch period where voiced, every 10 ms where not.
 * Voiced marks sit on the waveform peak of one consistent polarity per voiced
 * stretch, refined by matching each period to the previous one, so the grains
 * line up cleanly (jittery marks are what make PSOLA sound rough).
 */
function pitchMarks(
  y: Float32Array,
  sr: number,
  f0: Float32Array,
  frameSeconds: number,
  pitchScale: number,
) {
  const marks: { at: number; period: number; voiced: boolean }[] = [];
  const f0At = (i: number) =>
    (f0[Math.min(f0.length - 1, Math.floor(i / sr / frameSeconds))] ?? 0) * pitchScale;
  let i = 0;
  while (i < y.length) {
    if (f0At(i) <= 0) {
      const period = Math.round(sr * 0.01);
      marks.push({ at: i, period, voiced: false });
      i += period;
      continue;
    }
    // One voiced stretch: find its end and its stronger polarity.
    let end = i;
    while (end < y.length && f0At(end) > 0) end++;
    let hi = 0;
    let lo = 0;
    for (let k = i; k < end; k++) {
      hi = Math.max(hi, y[k]!);
      lo = Math.min(lo, y[k]!);
    }
    const sign = hi >= -lo ? 1 : -1;
    // First mark: the strongest peak within the first period.
    let period = sr / f0At(i);
    let at = i;
    for (let k = i; k < Math.min(end, i + period); k++) if (sign * y[k]! > sign * y[at]!) at = k;
    while (at < end) {
      marks.push({ at, period, voiced: true });
      const hz = f0At(at);
      if (hz <= 0) break;
      period = sr / hz;
      const guess = Math.round(at + period);
      const reach = Math.floor(period * 0.2);
      // Best match of the next period against this one (waveform similarity),
      // nudged towards the peak, keeps marks evenly on the same point.
      const len = Math.round(period);
      let best = guess;
      let bestScore = -Infinity;
      for (let c = guess - reach; c <= guess + reach; c++) {
        if (c + len >= y.length || c < 0) continue;
        let score = 0;
        for (let k = -len >> 1; k < len >> 1; k++) {
          const a = y[at + k] ?? 0;
          score += a * (y[c + k] ?? 0);
        }
        score += sign * y[c]! * len * 0.05;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      at = best;
    }
    i = Math.max(end, Math.round((marks.at(-1)?.at ?? i) + period));
  }
  return marks;
}

/** Changes pitch and length with TD-PSOLA (formants stay put). */
function psola(
  y: Float32Array,
  sr: number,
  marks: ReturnType<typeof pitchMarks>,
  newPitch: (analysisSample: number) => number,
  stretch: number,
): Float32Array {
  const out = new Float32Array(Math.ceil(y.length * stretch) + sr);
  let t = 0;
  let m = 0;
  while (t < out.length - sr && marks.length > 0) {
    const ta = t / stretch;
    while (m + 1 < marks.length && Math.abs(marks[m + 1]!.at - ta) <= Math.abs(marks[m]!.at - ta))
      m++;
    const mark = marks[m]!;
    const hz = mark.voiced ? newPitch(mark.at) : 0;
    const outPeriod = hz > 0 ? sr / hz : mark.period;
    // Grains span two of the shorter period: raising the pitch then never
    // smears one pulse into the next (which sounds rough), and lowering it
    // leaves no gaps.
    const half = Math.round(Math.min(mark.period, outPeriod));
    const gain = outPeriod > mark.period ? Math.sqrt(Math.min(2, outPeriod / mark.period)) : 1;
    const centre = Math.round(t);
    for (let k = -half; k <= half; k++) {
      const src = mark.at + k;
      const dst = centre + k;
      if (src < 0 || src >= y.length || dst < 0 || dst >= out.length) continue;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * k) / (half + 1));
      out[dst]! += y[src]! * w * gain;
    }
    t += outPeriod;
  }
  return out.subarray(0, Math.ceil(y.length * stretch));
}

export function reshape(x: Float32Array, sr: number, s: ReshapeSettings): Float32Array {
  const f0 = trackPitch(x, sr);
  const oldMedian = median(f0);
  const y = resample(x, s.formant);
  const frame = STEP_SECONDS / s.formant; // the analysis frames shrink with the sound
  // Resampling raised the pitch by `formant` too, so the marks use the raised pitch.
  const marks = pitchMarks(y, sr, f0, frame, s.formant);
  const scaledMedian = oldMedian * s.formant;
  const newPitch = (at: number) => {
    const hz = (f0[Math.min(f0.length - 1, Math.floor(at / sr / frame))] ?? 0) * s.formant;
    if (hz <= 0 || scaledMedian <= 0) return 0;
    // Move to the new median, then widen the range around it (in octaves).
    return s.median * Math.pow(hz / scaledMedian, s.range);
  };
  return psola(y, sr, marks, newPitch, s.formant * s.duration);
}

/** Trims silence at both ends (keeping a short natural edge), fades, and normalises. */
export function finish(x: Float32Array, sr: number): Float32Array {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]!));
  if (peak === 0) return x;
  const threshold = peak * 0.02;
  let first = 0;
  let last = x.length - 1;
  while (first < x.length && Math.abs(x[first]!) <= threshold) first++;
  while (last > first && Math.abs(x[last]!) <= threshold) last--;
  const pad = Math.round(0.03 * sr);
  const y = x.slice(Math.max(0, first - pad), Math.min(x.length, last + pad + 1));
  const fade = Math.round(0.008 * sr);
  if (y.length > 2 * fade) {
    for (let i = 0; i < fade; i++) {
      y[i]! *= i / fade;
      y[y.length - 1 - i]! *= i / fade;
    }
  }
  const scale = 0.89 / peak;
  for (let i = 0; i < y.length; i++) y[i]! *= scale;
  return y;
}
