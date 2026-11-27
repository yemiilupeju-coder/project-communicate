import { describe, expect, it } from "vitest";
import { breathAfterVoice, endsVoiced, trimEndBreath } from "../src/voice/endBreath";

const SR = 24000;

/** A vowel-like 220 Hz tone with harmonics, then (optionally) a tail. */
function word(tail: "hiss" | "low" | "none", seconds = 0.3): Float32Array {
  const v = Math.round(SR * seconds);
  const t = tail === "none" ? 0 : Math.round(SR * 0.15);
  const x = new Float32Array(v + t);
  for (let i = 0; i < v; i++)
    for (let h = 1; h <= 8; h++) x[i]! += (0.3 / h) * Math.sin((2 * Math.PI * 220 * h * i) / SR);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
  let prev = 0;
  let slow = 0;
  for (let i = v; i < v + t; i++) {
    const n = rand();
    slow = 0.98 * slow + 0.02 * n;
    // hiss: differenced noise (energy high up); low: smoothed noise, a soft rumble
    x[i] = tail === "hiss" ? 0.15 * (n - prev) : 0.5 * slow;
    prev = n;
  }
  return x;
}

describe("out-breath after a word", () => {
  it("knows which phonemes end on a voiced sound", () => {
    expect(endsVoiced("ˈɑɹ")).toBe(true); // are
    expect(endsVoiced("mˈɔɹ.")).toBe(true); // more.
    expect(endsVoiced("jˌu ɑɹ ɐ sˈupəɹstˌɑɹ!")).toBe(true);
    expect(endsVoiced("nˈɑt")).toBe(false); // not
    expect(endsVoiced("jˈɛs")).toBe(false); // yes
    expect(endsVoiced("hˈɛlp")).toBe(false); // help
    expect(endsVoiced("")).toBe(false);
  });

  it("cuts a hissy tail after a voiced ending, with a fade", () => {
    const x = word("hiss");
    expect(breathAfterVoice(x, SR)).toBeGreaterThan(0.1);
    const y = trimEndBreath(x, SR, true);
    expect(y.length).toBeLessThan(x.length - 0.1 * SR);
    expect(y.length).toBeGreaterThan(0.29 * SR); // the vowel is kept
    expect(Math.abs(y[y.length - 1]!)).toBeLessThan(1e-3);
    expect(breathAfterVoice(y, SR)).toBe(0);
  });

  it("keeps consonant endings, quiet low decays and clean words as they are", () => {
    const hiss = word("hiss");
    expect(trimEndBreath(hiss, SR, false)).toBe(hiss); // t, s, k... endings are noise on purpose
    const low = word("low");
    expect(trimEndBreath(low, SR, true)).toBe(low);
    const clean = word("none");
    expect(trimEndBreath(clean, SR, true)).toBe(clean);
  });
});
