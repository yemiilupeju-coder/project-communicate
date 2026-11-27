/**
 * Kokoro-82M text-to-speech (Apache 2.0, hexgrad), without any server: text →
 * phonemes (misaki's dictionaries and rules, see g2p.ts) → tokens → the ONNX
 * model.
 *
 * The text normalisation follows kokoro-js (Apache 2.0, Joshua Lochner). The
 * model runner is passed in, so the same code runs in the build script
 * (onnxruntime-node) and on devices (onnxruntime-web, in a worker).
 */

import { toPhonemes, type Lexicon } from "./g2p";
import { KOKORO_VOCAB } from "./kokoroVocab";

export const SAMPLE_RATE = 24000;
const MAX_TOKENS = 510;

/**
 * The model's numeric inputs besides text and style. The app's model has the
 * in-graph pitch control (research/child-voice/make_pitch_model.py): the
 * pitch curve Kokoro predicts is rescaled before its decoder generates the
 * voice, so the child's pitch is made by the model, not shifted afterwards.
 *   f0Scale  multiplies the whole pitch curve (1 = as predicted)
 *   f0Range  widens (>1) or narrows (<1) the movement around f0Ref, in log terms
 *   f0Ref    the centre for f0Range, in Hz (the voice's own predicted median)
 */
export interface KokoroInputs {
  readonly speed: number;
  readonly f0Scale: number;
  readonly f0Range: number;
  readonly f0Ref: number;
}

/** Kokoro as trained: normal speed, pitch untouched. */
export const NEUTRAL_INPUTS: KokoroInputs = { speed: 1, f0Scale: 1, f0Range: 1, f0Ref: 200 };

/** Runs the model: token ids (with the 0 padding), a 256-value style and the inputs → audio samples. */
export type KokoroRun = (
  tokens: BigInt64Array,
  style: Float32Array,
  inputs: KokoroInputs,
) => Promise<Float32Array>;

/**
 * The model's input tensors. `tensor` makes one with whichever onnxruntime the
 * caller uses (web on devices, node in the build scripts).
 */
export function kokoroFeeds<T>(
  tensor: (type: "int64" | "float32", data: BigInt64Array | Float32Array, dims: number[]) => T,
  tokens: BigInt64Array,
  style: Float32Array,
  inputs: KokoroInputs,
): Record<string, T> {
  const one = (v: number) => tensor("float32", new Float32Array([v]), [1]);
  return {
    tokens: tensor("int64", tokens, [1, tokens.length]),
    style: tensor("float32", style, [1, 256]),
    speed: one(inputs.speed),
    f0_scale: one(inputs.f0Scale),
    f0_range: one(inputs.f0Range),
    f0_ref: one(inputs.f0Ref),
  };
}

function splitNumber(text: string): string {
  if (text.includes(".")) return text;
  if (text.includes(":")) {
    const [h, m] = text.split(":").map(Number);
    return m === 0 ? `${h} o'clock` : m! < 10 ? `${h} oh ${m}` : `${h} ${m}`;
  }
  const year = parseInt(text.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return text;
  const left = text.slice(0, 2);
  const right = parseInt(text.slice(2, 4), 10);
  const s = text.endsWith("s") ? "s" : "";
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${s}`;
    if (right < 10) return `${left} oh ${right}${s}`;
  }
  return `${left} ${right}${s}`;
}

function money(text: string): string {
  const unit = text[0] === "$" ? "dollar" : "pound";
  if (isNaN(Number(text.slice(1)))) return `${text.slice(1)} ${unit}s`;
  if (!text.includes(".")) return `${text.slice(1)} ${unit}${text.slice(1) === "1" ? "" : "s"}`;
  const [whole = "", part = ""] = text.slice(1).split(".");
  const cents = parseInt(part.padEnd(2, "0"), 10);
  const small =
    text[0] === "$" ? (cents === 1 ? "cent" : "cents") : cents === 1 ? "penny" : "pence";
  return `${whole} ${unit}${whole === "1" ? "" : "s"} and ${cents} ${small}`;
}

function decimal(text: string): string {
  const [whole = "", part = ""] = text.split(".");
  return `${whole} point ${part.split("").join(" ")}`;
}

function normalise(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/«/g, "“")
    .replace(/»/g, "”")
    .replace(/[“”]/g, '"')
    .replace(/\(/g, "«")
    .replace(/\)/g, "»")
    .replace(/[^\S \n]/g, " ")
    .replace(/  +/, " ")
    .replace(/(?<=\n) +(?=\n)/g, "")
    .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
    .replace(/\betc\.(?! [A-Z])/gi, "etc")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNumber)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(
      /[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi,
      money,
    )
    .replace(/\d*\.\d+/g, decimal)
    .replace(/(?<=\d)-(?=\d)/g, " to ")
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, "-"))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")
    .trim();
}

/** American English phonemes for Kokoro, punctuation kept (it shapes the intonation). */
export function phonemes(lexicon: Lexicon, text: string): string {
  return toPhonemes(lexicon, normalise(text));
}

export function tokenize(phonemeText: string): number[] {
  const ids: number[] = [];
  for (const ch of phonemeText) {
    const id = KOKORO_VOCAB[ch];
    if (id !== undefined) ids.push(id);
  }
  return ids.slice(0, MAX_TOKENS);
}

/**
 * Speaks text in a Kokoro voice. `voice` is the voice's style table
 * (510 rows of 256 values); the row is chosen by the number of phonemes.
 */
export async function synthesize(
  run: KokoroRun,
  voice: Float32Array,
  lexicon: Lexicon,
  text: string,
  inputs: KokoroInputs = NEUTRAL_INPUTS,
): Promise<Float32Array> {
  const ids = tokenize(phonemes(lexicon, text));
  if (ids.length === 0) return new Float32Array(0);
  const row = Math.min(ids.length, voice.length / 256) - 1;
  const style = voice.slice(row * 256, row * 256 + 256);
  const tokens = BigInt64Array.from([0, ...ids, 0].map((id) => BigInt(id)));
  return run(tokens, style, inputs);
}
