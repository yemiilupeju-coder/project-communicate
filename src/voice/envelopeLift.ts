/**
 * The even formant lift (ADR 0012): makes a voice's vocal tract sound
 * smaller by scaling its spectral envelope evenly up in frequency, the way a
 * shorter vocal tract does. Every formant rises by the same ratio, so vowels
 * keep their identity and the American "r" keeps its dip.
 *
 * Per frame, the smooth envelope is found (cepstral smoothing), stretched by
 * `lift` along frequency, and the spectrum is re-weighted to match. The
 * harmonics are not moved and the phase is not touched, so pitch, timing and
 * consonant bursts stay as the model generated them.
 *
 * Port of research/child-voice/transforms.py envelope_filter (checked against
 * it in test/envelopeLift.test.ts).
 */

const N = 1024; // frame length (42.7 ms at 24 kHz)
const HOP = 120; // 5 ms
const BINS = N / 2 + 1;

/** In-place iterative radix-2 FFT of length N (inverse when `inv`, unscaled). */
function fft(re: Float64Array, im: Float64Array, inv: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]!;
      re[i] = re[j]!;
      re[j] = t;
      t = im[i]!;
      im[i] = im[j]!;
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len;
    const wr0 = Math.cos(ang);
    const wi0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nwr = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = nwr;
      }
    }
  }
}

/** Linear interpolation of `v` at fractional index `x`, clamped at the ends. */
function at(v: Float64Array, x: number): number {
  if (x <= 0) return v[0]!;
  const last = v.length - 1;
  if (x >= last) return v[last]!;
  const i = Math.floor(x);
  const f = x - i;
  return v[i]! * (1 - f) + v[i + 1]! * f;
}

/**
 * Returns `x` with its formants raised evenly by `lift` (1.07 = 7% higher).
 * `maxDb` limits how far any frequency is turned up or down.
 */
export function envelopeLift(
  x: Float32Array,
  sampleRate: number,
  lift: number,
  maxDb = 15,
): Float32Array {
  if (lift === 1 || x.length === 0) return x;
  const win = Float64Array.from(
    { length: N },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N),
  );
  const pad = N / 2;
  const frames = 1 + Math.floor(x.length / HOP);
  const q = Math.floor(0.0022 * sampleRate); // cepstral cut-off: 2.2 ms
  const limit = maxDb / 8.686; // dB to natural-log units
  const taper = Float64Array.from({ length: BINS }, (_, k) => {
    const f = (k * sampleRate) / N;
    return Math.min(1, Math.max(0, (10500 - f) / 1500)); // leave the very top alone
  });

  // 1. Spectrum of every frame (centred, zero-padded, Hann window).
  const specRe: Float64Array[] = [];
  const specIm: Float64Array[] = [];
  const gains: Float64Array[] = [];
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let t = 0; t < frames; t++) {
    const start = t * HOP - pad;
    for (let i = 0; i < N; i++) {
      const s = start + i;
      re[i] = s >= 0 && s < x.length ? x[s]! * win[i]! : 0;
      im[i] = 0;
    }
    fft(re, im, false);
    specRe.push(re.slice(0, BINS));
    specIm.push(im.slice(0, BINS));

    // 2. Smooth log envelope by cepstral liftering.
    for (let k = 0; k < BINS; k++) {
      re[k] = Math.log(Math.hypot(specRe[t]![k]!, specIm[t]![k]!) + 1e-9);
      im[k] = 0;
    }
    for (let k = 1; k < N / 2; k++) {
      re[N - k] = re[k]!;
      im[N - k] = 0;
    }
    fft(re, im, true); // cepstrum (times N)
    for (let n = 0; n < N; n++) {
      const keep = n < q || n > N - q;
      re[n] = keep ? re[n]! / N : 0;
      im[n] = keep ? im[n]! / N : 0;
    }
    fft(re, im, false);
    const env = re.slice(0, BINS);

    // 3. Gain that turns the envelope into the same envelope stretched by `lift`.
    const g = new Float64Array(BINS);
    for (let k = 0; k < BINS; k++)
      g[k] = Math.max(-limit, Math.min(limit, at(env, k / lift) - env[k]!));
    gains.push(g);
  }

  // 4. Smooth the gain over three frames, taper the top, apply, and overlap-add.
  const out = new Float64Array(x.length + N);
  const norm = new Float64Array(x.length + N);
  for (let t = 0; t < frames; t++) {
    for (let k = 0; k < BINS; k++) {
      // three-frame average (frames past the ends count as zero gain)
      const g =
        gains[t]![k]! + (t > 0 ? gains[t - 1]![k]! : 0) + (t < frames - 1 ? gains[t + 1]![k]! : 0);
      const gain = Math.exp((g / 3) * taper[k]!);
      re[k] = specRe[t]![k]! * gain;
      im[k] = specIm[t]![k]! * gain;
    }
    for (let k = 1; k < N / 2; k++) {
      re[N - k] = re[k]!;
      im[N - k] = -im[k]!;
    }
    fft(re, im, true);
    const start = t * HOP - pad;
    for (let i = 0; i < N; i++) {
      const s = start + i;
      if (s < 0 || s >= x.length) continue;
      out[s] = out[s]! + (re[i]! / N) * win[i]!;
      norm[s] = norm[s]! + win[i]! * win[i]!;
    }
  }
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = norm[i]! > 1e-8 ? out[i]! / norm[i]! : 0;
  return y;
}
