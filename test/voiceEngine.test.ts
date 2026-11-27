import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { speakableTexts } from "../src/features/communicator/speakable";
import {
  fromSpelling,
  numberWords,
  ordinalWords,
  toPhonemes,
  type Lexicon,
} from "../src/voice/g2p";
import { phonemes, tokenize } from "../src/voice/kokoro";
import { KOKORO_VOCAB } from "../src/voice/kokoroVocab";
import {
  loudness,
  normaliseLoudness,
  PEAK_CEILING_DBTP,
  TARGET_LUFS,
  truePeak,
} from "../src/voice/loudness";
import { finish, reshape, trackPitch } from "../src/voice/reshape";
import {
  ENGINE_SCRIPT,
  ENGINE_WASM,
  LEXICON,
  MODEL_PARTS,
  voiceTablePath,
  VOICE_TABLE_BYTES,
} from "../src/voice/voiceModel";

const lexicon = JSON.parse(readFileSync(`public/${LEXICON.path}`, "utf8")) as Lexicon;

describe("pronunciation (misaki rules, no eSpeak)", () => {
  // Expected values are misaki's own output (Python, misaki 0.9) for the same text.
  it.each([
    ["Hi! This is my voice.", "hˈI! ðˌɪs ɪz mI vˈYs."],
    ["I want to go to the park.", "ˌI wˈɑnt tə ɡˌO tə ðə pˈɑɹk."],
    ["I am hungry", "ˌI ɐm hˈʌŋɡɹi"],
    ["the apple", "ði ˈæpᵊl"],
    ["Stop that!", "stˈɑp ðˈæt!"],
    ["Can I have more, please?", "kˌæn ˌI hæv mˈɔɹ, plˈiz?"],
    ["She's playing outside.", "ʃˌiz plˈAɪŋ ˌWtsˈId."],
    ["We jumped and laughed", "wˌi ʤˈʌmpt ænd lˈæft"],
    ["Where are my shoes?", "wˌɛɹ ɑɹ mI ʃˈuz?"],
    ["TV time", "tˌivˈi tˈIm"],
  ])("says %s as misaki does", (text, expected) => {
    expect(toPhonemes(lexicon, text)).toBe(expected);
  });

  it("handles British spellings and endings misaki's dictionaries miss", () => {
    expect(toPhonemes(lexicon, "colour")).toBe(toPhonemes(lexicon, "color"));
    expect(toPhonemes(lexicon, "favourite")).toBe(toPhonemes(lexicon, "favorite"));
    expect(toPhonemes(lexicon, "sweeter")).toBe("swˈitəɹ");
    expect(toPhonemes(lexicon, "calmest")).toBe("kˈɑlmɪst");
  });

  it("says numbers as words", () => {
    expect(numberWords(0)).toBe("zero");
    expect(numberWords(42)).toBe("forty two");
    expect(numberWords(2026)).toBe("two thousand twenty six");
    expect(numberWords(1_000_000)).toBe("one million");
    expect(ordinalWords(1)).toBe("first");
    expect(ordinalWords(23)).toBe("twenty third");
    expect(ordinalWords(40)).toBe("fortieth");
    expect(toPhonemes(lexicon, "I have 3 dogs")).toBe("ˌI hæv θɹˈi dˈɔɡz");
  });

  it("gives any made-up word or name a stressed pronunciation", () => {
    for (const word of ["zib", "Okafor", "Pikachu", "skibidi", "Xavier", "Brxl"]) {
      const ps = fromSpelling(word);
      expect(ps.length).toBeGreaterThan(0);
      for (const ch of ps) expect(KOKORO_VOCAB[ch], `${word}: ${ch}`).toBeDefined();
    }
    expect(fromSpelling("zib")).toBe("zˈɪb");
    expect(fromSpelling("Pikachu")).toBe("pɪkˈæʧu");
  });

  it("only produces sounds the model knows, for every built-in phrase", () => {
    for (const text of speakableTexts()) {
      const ps = phonemes(lexicon, text);
      for (const ch of ps) expect(KOKORO_VOCAB[ch], `${text}: "${ch}"`).toBeDefined();
      expect(tokenize(ps).length, text).toBeGreaterThan(0);
    }
  });
});

describe("voice model files", () => {
  it("has every model part at its listed size, each under the host's 25 MiB limit", () => {
    for (const part of MODEL_PARTS) {
      expect(statSync(`public/${part.path}`).size).toBe(part.bytes);
      expect(part.bytes).toBeLessThan(25 * 1024 * 1024);
    }
  });

  it("has the voice tables and the dictionary at their listed sizes", () => {
    expect(statSync(`public/${voiceTablePath("girl")}`).size).toBe(VOICE_TABLE_BYTES);
    expect(statSync(`public/${voiceTablePath("boy")}`).size).toBe(VOICE_TABLE_BYTES);
    const lexiconFile = readFileSync(`public/${LEXICON.path}`);
    expect(lexiconFile.length).toBe(LEXICON.bytes);
    const hash = createHash("sha1").update(lexiconFile).digest("hex").slice(0, 10);
    expect(LEXICON.path).toContain(hash);
    expect(LEXICON.bytes).toBeLessThan(25 * 1024 * 1024);
  });

  it("ships the same engine script as the installed onnxruntime-web", () => {
    const ours = readFileSync(`public/${ENGINE_SCRIPT}`);
    const installed = readFileSync("node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs");
    expect(ours.equals(installed)).toBe(true);
  });

  it("ships the same engine file as the installed onnxruntime-web", () => {
    const ours = readFileSync(`public/${ENGINE_WASM.path}`);
    const installed = readFileSync("node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm");
    expect(ours.length).toBe(ENGINE_WASM.bytes);
    expect(ours.equals(installed)).toBe(true);
  });
});

describe("child voice reshaping", () => {
  const sr = 24000;
  // A 150 Hz buzz with a little vibrato, like an adult voice.
  const adult = new Float32Array(sr);
  let phase = 0;
  for (let i = 0; i < adult.length; i++) {
    phase += (2 * Math.PI * (150 + 5 * Math.sin((2 * Math.PI * 3 * i) / sr))) / sr;
    adult[i] = 0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase);
  }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const voiced = (x: Float32Array) => Array.from(trackPitch(x, sr)).filter((hz) => hz > 0);

  it("finds the pitch of a voice", () => {
    expect(Math.abs(median(voiced(adult)) - 150)).toBeLessThan(6);
  });

  it("raises the pitch to the child's median", () => {
    const child = reshape(adult, sr, { formant: 1.16, median: 285, range: 1.3, duration: 1 });
    expect(Math.abs(median(voiced(child)) - 285)).toBeLessThan(15);
  });

  it("keeps the length, apart from the chosen duration change", () => {
    const child = reshape(adult, sr, { formant: 1.3, median: 255, range: 1.25, duration: 1.06 });
    expect(child.length / adult.length).toBeGreaterThan(1.0);
    expect(child.length / adult.length).toBeLessThan(1.12);
  });

  it("raises a low voice a long way with even periods (no flutter)", () => {
    const low = new Float32Array(sr);
    let ph = 0;
    for (let i = 0; i < low.length; i++) {
      ph += (2 * Math.PI * 115) / sr;
      low[i] = 0.5 * Math.sin(ph) + 0.3 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph);
    }
    const child = reshape(low, sr, { formant: 1.3, median: 255, range: 1.25, duration: 1.06 });
    const hz = Array.from(trackPitch(child, sr))
      .slice(20, -20)
      .filter((v) => v > 0);
    const octaves = hz.map((v) => Math.log2(v));
    const mean = octaves.reduce((a, b) => a + b, 0) / octaves.length;
    const spread = Math.sqrt(octaves.reduce((a, b) => a + (b - mean) ** 2, 0) / octaves.length);
    expect(Math.abs(2 ** mean - 255)).toBeLessThan(10);
    expect(spread).toBeLessThan(0.01); // under a sixth of a semitone of wobble
  });

  it("brings peaky speech to the target without passing the ceiling", () => {
    const x = Float32Array.from(adult);
    for (let i = 3000; i < 3010; i++) x[i] = 0.99; // a sharp burst, like a "p"
    normaliseLoudness(x, sr);
    expect(loudness(x, sr)).toBeCloseTo(TARGET_LUFS, 0);
    expect(20 * Math.log10(truePeak(x))).toBeLessThanOrEqual(PEAK_CEILING_DBTP + 0.1);
  });

  it("finishes clips at the same loudness, under the peak ceiling, without clicks", () => {
    for (const level of [0.05, 0.5, 0.95]) {
      const done = finish(
        adult.map((v) => v * level),
        sr,
      );
      expect(loudness(done, sr)).toBeCloseTo(TARGET_LUFS, 0);
      expect(20 * Math.log10(truePeak(done))).toBeLessThanOrEqual(PEAK_CEILING_DBTP + 0.1);
      expect(Math.abs(done[0]!)).toBeLessThan(0.01);
      expect(Math.abs(done[done.length - 1]!)).toBeLessThan(0.01);
    }
  });
});

describe("loudness (ITU-R BS.1770)", () => {
  it("measures a 1 kHz tone as the standard says", () => {
    const tone = new Float32Array(48000 * 3).map(
      (_, i) => 0.1 * Math.sin((2 * Math.PI * 1000 * i) / 48000),
    );
    // A full-scale 1 kHz sine is -3.01 LUFS; at 0.1 (-20 dB) it is -23.01.
    expect(loudness(tone, 48000)).toBeCloseTo(-23.01, 1);
  });

  it("finds peaks between samples", () => {
    // A sine at a quarter of the sample rate, sampled off its peaks.
    const x = new Float32Array(400).map((_, i) => Math.sin((Math.PI / 2) * i + Math.PI / 4));
    expect(Math.max(...x.map(Math.abs))).toBeCloseTo(0.707, 2);
    expect(truePeak(x)).toBeGreaterThan(0.95);
  });
});
