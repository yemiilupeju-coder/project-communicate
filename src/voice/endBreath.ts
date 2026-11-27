/**
 * Removes the out-breath some Kokoro styles leave after a word (ADR 0012).
 *
 * The boy's delivery (am_puck's prosody) ends words with a burst of breathy
 * hiss (around 7 kHz, only 8-13 dB below the word) once the voice has stopped.
 * After "are" it is heard as "aren't"; after "car" as "cart". When the text
 * ends on a voiced sound (a vowel, r, l, m, n, ng, w, y) nothing after the
 * voice is speech, so a hissy tail there is cut off with a short fade. Real
 * consonant endings (t, s, k, d...) are kept, and so is any tail that is not
 * hiss (a soft, low decay of the voice).
 */

/** Sounds whose noise after the voice is part of the word. */
const OBSTRUENTS = new Set([..."ptkfθsʃhbdgvðzʒʧʤʔ"]);
/** Kokoro phoneme marks that are not sounds: stress, length, punctuation, spaces. */
const MARKS = /[ˈˌːˑ\s.,!?;:"'“”‘’()…—–-]/gu;

/** True when the phonemes end on a voiced sound (no consonant noise of its own). */
export function endsVoiced(phonemeText: string): boolean {
  const sounds = [...phonemeText.replace(MARKS, "")];
  const last = sounds.at(-1);
  return last !== undefined && !OBSTRUENTS.has(last);
}

const MIN_HISS_HZ = 3000;
const KEEP_S = 0.02;
const FADE_S = 0.02;

/** A two-pole low-pass at 1.5 kHz: periodicity is judged on the voice's fundamental band. */
function lowPass(x: Float32Array, sr: number): Float64Array {
  const w = Math.tan((Math.PI * 1500) / sr);
  const k = 1 / (1 + Math.SQRT2 * w + w * w);
  const b0 = w * w * k;
  const a1 = 2 * (w * w - 1) * k;
  const a2 = (1 - Math.SQRT2 * w + w * w) * k;
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    const o = b0 * v + 2 * b0 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = o;
    y[i] = o;
  }
  return y;
}

/** End (in samples) of the last voiced frame: periodic between 90 and 600 Hz, and not near silence. */
function voicedEnd(x: Float32Array, sr: number): number {
  const lo = lowPass(x, sr);
  const W = Math.round(0.03 * sr);
  const H = Math.round(0.005 * sr);
  const lagMin = Math.floor(sr / 600);
  const lagMax = Math.ceil(sr / 90);
  const rms: number[] = [];
  for (let i = 0; i + W <= lo.length; i += H) {
    let s = 0;
    for (let j = i; j < i + W; j++) s += lo[j]! * lo[j]!;
    rms.push(Math.sqrt(s / W));
  }
  const floor = Math.max(...rms, 0) * 0.01; // -40 dB
  for (let f = rms.length - 1; f >= 0; f--) {
    if (rms[f]! < floor) continue;
    const i = f * H;
    let mean = 0;
    for (let j = i; j < i + W; j++) mean += lo[j]!;
    mean /= W;
    let r0 = 0;
    for (let j = i; j < i + W; j++) r0 += (lo[j]! - mean) ** 2;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let r = 0;
      for (let j = i; j + lag < i + W; j++) r += (lo[j]! - mean) * (lo[j + lag]! - mean);
      if (r / (r0 + 1e-12) > 0.5) return i + W;
    }
  }
  return x.length;
}

/** Spectral centroid (Hz) of a short stretch, by a plain DFT on 64 bands up to Nyquist. */
function centroid(x: Float32Array, sr: number): number {
  const n = x.length;
  let num = 0;
  let den = 0;
  for (let b = 1; b <= 64; b++) {
    const f = (b / 64) * (sr / 2);
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
      const a = (2 * Math.PI * f * i) / sr;
      re += x[i]! * w * Math.cos(a);
      im -= x[i]! * w * Math.sin(a);
    }
    const p = re * re + im * im;
    num += p * f;
    den += p;
  }
  return den > 0 ? num / den : 0;
}

/** Where a hissy tail after the voice should be cut (in samples), or null if there is none. */
function breathCut(x: Float32Array, sr: number): number | null {
  if (x.length === 0) return null;
  const end = voicedEnd(x, sr);
  const keep = end + Math.round(KEEP_S * sr);
  if (keep >= x.length - Math.round(0.02 * sr)) return null;
  if (centroid(x.subarray(end), sr) < MIN_HISS_HZ) return null;
  return keep;
}

/** Seconds of breathy hiss left after the voice ends (0 when there is none). For tests and QA. */
export function breathAfterVoice(x: Float32Array, sr: number): number {
  const cut = breathCut(x, sr);
  return cut === null ? 0 : (x.length - cut) / sr;
}

export function trimEndBreath(x: Float32Array, sr: number, voicedEnding: boolean): Float32Array {
  if (!voicedEnding) return x;
  const keep = breathCut(x, sr);
  if (keep === null) return x;
  const y = x.slice(0, keep);
  const fade = Math.min(Math.round(FADE_S * sr), y.length);
  for (let i = 0; i < fade; i++)
    y[y.length - fade + i]! *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / fade);
  return y;
}
