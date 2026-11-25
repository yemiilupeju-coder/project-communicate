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
import { finish, reshape, trackPitch } from "../src/voice/reshape";
import {
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

  it("finishes clips at a steady level without clicks", () => {
    const done = finish(adult, sr);
    const peak = done.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    expect(peak).toBeCloseTo(0.89, 2);
    expect(Math.abs(done[0]!)).toBeLessThan(0.01);
    expect(Math.abs(done[done.length - 1]!)).toBeLessThan(0.01);
  });
});
