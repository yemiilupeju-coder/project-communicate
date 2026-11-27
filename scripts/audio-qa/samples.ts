// Generates the audio-QA test corpus with the app's own voice code
// (src/voice), so what is measured is exactly what devices make.
//
//   node scripts/audio-qa/.samples.mjs <out-dir> <voices.json> [voice-tables-dir]
//
// voices.json: [{ "name": "girl", "kokoro": "af_bella", "reshape": {...} | null }]
// (reshape null = the adult voice as Kokoro makes it, for baselines), or
// "app" for the voices the app uses now (src/voice/childVoices.ts: generated
// in the model, no reshaping). Adult base voices are rendered too when a
// folder of Kokoro voice tables (<name>.bin) is given.
// Writes <out-dir>/<name>/<nn>.wav (one per sentence, 24 kHz mono 16-bit), and
// <out-dir>/clarity/<name>/{w,s}-<nn>.wav (clarity-corpus.json, in order).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as ort from "onnxruntime-node";
import { CHILD_VOICES } from "../../src/voice/childVoices";
import { envelopeLift } from "../../src/voice/envelopeLift";
import type { Lexicon } from "../../src/voice/g2p";
import {
  kokoroFeeds,
  NEUTRAL_INPUTS,
  SAMPLE_RATE,
  synthesize,
  type KokoroInputs,
  type KokoroRun,
} from "../../src/voice/kokoro";
import { finish, reshape, type ReshapeSettings } from "../../src/voice/reshape";
import { LEXICON, MODEL_PARTS } from "../../src/voice/voiceModel";

/** Things students say: statements, questions, exclamations, short and long. */
export const CORPUS = [
  "Hi! This is my voice.",
  "I can do it!",
  "You are a superstar!",
  "Can I have some more juice, please?",
  "I want to play outside with my friends.",
  "I don't like that.",
  "Thank you for helping me today.",
  "Where is my teacher?",
];

interface Voice {
  name: string;
  /** A Kokoro voice name (table read from the tables folder), or a table path under public/. */
  kokoro: string;
  table?: string;
  inputs?: KokoroInputs;
  /** The even formant lift the app applies after the model (ADR 0012); 1 = none. */
  lift?: number;
  reshape: ReshapeSettings | null;
}

const root = new URL("../../", import.meta.url);
const [outDir, voicesFile, tablesDir] = process.argv.slice(2);
if (!outDir || !voicesFile) throw new Error("usage: samples <out-dir> <voices.json> [tables-dir]");
const voices: Voice[] =
  voicesFile === "app"
    ? Object.entries(CHILD_VOICES).map(([name, v]) => ({
        name,
        kokoro: v.from.timbre,
        table: v.table,
        inputs: v.inputs,
        lift: v.lift,
        reshape: null,
      }))
    : (JSON.parse(readFileSync(voicesFile, "utf8")) as Voice[]);
mkdirSync(outDir, { recursive: true });
const CLARITY = JSON.parse(
  readFileSync(new URL("scripts/audio-qa/clarity-corpus.json", root), "utf8"),
) as { words: string[]; sentences: string[] };
const lexicon = JSON.parse(
  readFileSync(new URL(`public/${LEXICON.path}`, root), "utf8"),
) as Lexicon;
const model = Buffer.concat(
  MODEL_PARTS.map((p) => readFileSync(new URL(`public/${p.path}`, root))),
);
const session = await ort.InferenceSession.create(model, { intraOpNumThreads: 2 });
const run: KokoroRun = async (tokens, style, inputs) =>
  (
    await session.run(
      kokoroFeeds((type, data, dims) => new ort.Tensor(type, data, dims), tokens, style, inputs),
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

// Each child voice's adult base voice too, unchanged, to measure how far it was moved.
const bases = voices
  .filter((v) => v.reshape || v.table)
  // For a voice generated in the model, the base is its source voice at the same
  // speed with the pitch left as Kokoro predicts it: same timing, so the
  // vocal-tract measure can compare them frame by frame.
  // Its own table, with no lift: what the model makes before the pitch and the lift.
  .map((v): Voice => ({
    name: v.table ? `base_${v.name}` : `base_${v.kokoro}`,
    kokoro: v.kokoro,
    reshape: null,
    ...(v.table && v.inputs
      ? { table: v.table, inputs: { ...v.inputs, f0Scale: 1, f0Range: 1 } }
      : {}),
  }))
  .filter((b, i, all) => all.findIndex((x) => x.name === b.name) === i);
writeFileSync(`${outDir}/voices.json`, JSON.stringify(voices, null, 1));
for (const voice of [...voices, ...bases] as Voice[]) {
  const tablePath = voice.table
    ? new URL(`public/${voice.table}`, root)
    : tablesDir
      ? `${tablesDir}/${voice.kokoro}.bin`
      : new URL(`public/voice-model/${voice.kokoro}.bin`, root);
  const t = readFileSync(tablePath);
  const table = new Float32Array(t.buffer, t.byteOffset, t.byteLength / 4);
  mkdirSync(`${outDir}/${voice.name}`, { recursive: true });
  for (const [n, text] of CORPUS.entries()) {
    const raw = await synthesize(run, table, lexicon, text, voice.inputs ?? NEUTRAL_INPUTS);
    const lifted =
      voice.lift && voice.lift !== 1 ? envelopeLift(raw, SAMPLE_RATE, voice.lift) : raw;
    const out = voice.reshape ? reshape(lifted, SAMPLE_RATE, voice.reshape) : lifted;
    wav(`${outDir}/${voice.name}/${String(n).padStart(2, "0")}.wav`, finish(out, SAMPLE_RATE));
  }
  // The clarity corpus (ADR 0012): single words and short sentences, scored by clarity.py
  // for the American "r" and for how many words a recogniser gets right.
  mkdirSync(`${outDir}/clarity/${voice.name}`, { recursive: true });
  for (const [n, text] of [...CLARITY.words, ...CLARITY.sentences].entries()) {
    const raw = await synthesize(run, table, lexicon, text, voice.inputs ?? NEUTRAL_INPUTS);
    const lifted =
      voice.lift && voice.lift !== 1 ? envelopeLift(raw, SAMPLE_RATE, voice.lift) : raw;
    const out = voice.reshape ? reshape(lifted, SAMPLE_RATE, voice.reshape) : lifted;
    const kind = n < CLARITY.words.length ? "w" : "s";
    wav(
      `${outDir}/clarity/${voice.name}/${kind}-${String(n).padStart(2, "0")}.wav`,
      finish(out, SAMPLE_RATE),
    );
  }
  console.log(voice.name, "done");
}
