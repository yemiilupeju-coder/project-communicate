// Renders the listening-benchmark script (script.json) with Kokoro, in any
// number of variants: raw voices, the app's current processing, and
// alternatives. One WAV per item, 24 kHz, no loudness processing (package.py
// matches loudness for every engine the same way).
//
//   node scripts/voice-benchmark/.kokoro.mjs <out-dir> <variants.json> [voice-tables-dir]
//
// variants.json: [{ "name", "kokoro", "reshape": {...} | null, "pitchSemitones"?, "keepPitch"?, "speed"? }]
//   reshape null      = Kokoro's voice untouched
//   keepPitch: true   = move resonances only; pitch stays the source's
//   pitchSemitones: n = target pitch n semitones above the source's own median
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as ort from "onnxruntime-node";
import type { Lexicon } from "../../src/voice/g2p";
import { kokoroFeeds, SAMPLE_RATE, synthesize, type KokoroRun } from "../../src/voice/kokoro";
import { reshape, trackPitch, type ReshapeSettings } from "../../src/voice/reshape";
import { finish } from "../../src/voice/reshape";
import { LEXICON, MODEL_PARTS } from "../../src/voice/voiceModel";

interface Variant {
  name: string;
  kokoro: string;
  reshape: ReshapeSettings | null;
  keepPitch?: boolean;
  pitchSemitones?: number;
  /** Kokoro's own speaking speed (1 = default; children and narrators are slower). */
  speed?: number;
}
interface Script {
  short: string[];
  conversational: string[];
  expressive: string[];
  narration: string;
  assembled: string[][];
}

const root = new URL("../../", import.meta.url);
const [outDir, variantsFile, tablesDir] = process.argv.slice(2);
if (!outDir || !variantsFile)
  throw new Error("usage: kokoro <out-dir> <variants.json> [tables-dir]");
const script = JSON.parse(
  readFileSync(new URL("scripts/voice-benchmark/script.json", root), "utf8"),
) as Script;
const variants = JSON.parse(readFileSync(variantsFile, "utf8")) as Variant[];
const lexicon = JSON.parse(
  readFileSync(new URL(`public/${LEXICON.path}`, root), "utf8"),
) as Lexicon;
const model = Buffer.concat(
  MODEL_PARTS.map((p) => readFileSync(new URL(`public/${p.path}`, root))),
);
const session = await ort.InferenceSession.create(model, { intraOpNumThreads: 2 });
let speed = 1;
// Benchmark variants set the speed; pitch stays as Kokoro predicts it.
const run: KokoroRun = async (tokens, style, inputs) =>
  (
    await session.run(
      kokoroFeeds((type, data, dims) => new ort.Tensor(type, data, dims), tokens, style, {
        ...inputs,
        speed,
      }),
    )
  ).audio!.data as Float32Array;

function wav(path: string, x: Float32Array) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + x.length * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SAMPLE_RATE, 24);
  b.writeUInt32LE(SAMPLE_RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(x.length * 2, 40);
  x.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  writeFileSync(path, b);
}

/** Silence trimmed (as the app does), nothing else: for raw voices. */
function trimOnly(x: Float32Array): Float32Array {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const floor = peak * 0.02;
  let a = 0;
  while (a < x.length && Math.abs(x[a]!) < floor) a++;
  let b = x.length;
  while (b > a && Math.abs(x[b - 1]!) < floor) b--;
  const pad = Math.round(SAMPLE_RATE * 0.03);
  return x.slice(Math.max(0, a - pad), Math.min(x.length, b + pad));
}

function median(xs: number[]): number {
  const s = [...xs].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)] ?? 0;
}

const items: [string, string][] = [
  ...script.short.map((t, i) => [`1-short-${i}`, t] as [string, string]),
  ...script.conversational.map((t, i) => [`2-conv-${i}`, t] as [string, string]),
  ...script.expressive.map((t, i) => [`3-expr-${i}`, t] as [string, string]),
  ["4-narration", script.narration],
];

for (const v of variants) {
  speed = v.speed ?? 1;
  const tablePath = tablesDir
    ? `${tablesDir}/${v.kokoro}.bin`
    : new URL(`public/voice-model/${v.kokoro}.bin`, root);
  const t = readFileSync(tablePath);
  const table = new Float32Array(t.buffer, t.byteOffset, t.byteLength / 4);
  // The source voice's own median pitch, from the narration.
  const rawNarration = await synthesize(run, table, lexicon, script.narration);
  const sourceF0 = median(Array.from(trackPitch(rawNarration, SAMPLE_RATE)).filter((f) => f > 0));
  let settings = v.reshape;
  if (settings && v.keepPitch) settings = { ...settings, median: sourceF0 };
  if (settings && v.pitchSemitones !== undefined)
    settings = { ...settings, median: sourceF0 * 2 ** (v.pitchSemitones / 12) };
  const make = async (text: string) => {
    const raw =
      text === script.narration ? rawNarration : await synthesize(run, table, lexicon, text);
    return settings ? finish(reshape(raw, SAMPLE_RATE, settings), SAMPLE_RATE) : trimOnly(raw);
  };
  const dir = `${outDir}/${v.name}`;
  mkdirSync(dir, { recursive: true });
  for (const [id, text] of items) wav(`${dir}/${id}.wav`, await make(text));
  // AAC: the same sentences as single-word clips joined as the app joins them
  // (35 ms apart), and said whole.
  for (const [i, words] of script.assembled.entries()) {
    const gap = new Float32Array(Math.round(0.035 * SAMPLE_RATE));
    const parts: Float32Array[] = [];
    for (const w of words) parts.push(await make(w), gap);
    const joined = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      joined.set(p, o);
      o += p.length;
    }
    wav(`${dir}/5-assembled-${i}-joined.wav`, joined);
    const sentence = words.join(" ");
    wav(
      `${dir}/5-assembled-${i}-whole.wav`,
      await make(sentence.charAt(0).toUpperCase() + sentence.slice(1) + "."),
    );
  }
  writeFileSync(
    `${dir}/settings.json`,
    JSON.stringify({ ...v, sourceF0, applied: settings }, null, 1),
  );
  console.log(
    v.name,
    "source f0",
    Math.round(sourceF0),
    "Hz",
    settings ? `→ ${Math.round(settings.median)} Hz` : "(raw)",
  );
}
