/**
 * Regression tests for the child voices (ADR 0011): the app's model and
 * voice tables, run exactly as devices and the pack build run them.
 *
 * Reference samples live in test/fixtures/child-voices. After a deliberate
 * voice change, remake them with:
 *   UPDATE_VOICE_REFERENCE=1 npx vitest run test/childVoiceModel.test.ts
 * and listen to them before committing.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as ort from "onnxruntime-node";
import { beforeAll, describe, expect, it } from "vitest";
import type { VoicePackId } from "../src/core/voicePack";
import { CHILD_VOICES, renderChildVoice } from "../src/voice/childVoices";
import type { Lexicon } from "../src/voice/g2p";
import { kokoroFeeds, SAMPLE_RATE, type KokoroRun } from "../src/voice/kokoro";
import { loudness, PEAK_CEILING_DBTP, TARGET_LUFS, truePeak } from "../src/voice/loudness";
import { breathAfterVoice } from "../src/voice/endBreath";
import { trackPitch } from "../src/voice/reshape";
import { LEXICON, MODEL_PARTS, voiceTablePath } from "../src/voice/voiceModel";

const FIXTURES = "test/fixtures/child-voices";
const SENTENCES = {
  help: "I need help.",
  come: "Can you please come and help me?",
} as const;
const IDS: VoicePackId[] = ["girl", "boy"];

let session: ort.InferenceSession;
let lexicon: Lexicon;
const run: KokoroRun = async (tokens, style, inputs) =>
  (
    await session.run(
      kokoroFeeds((type, data, dims) => new ort.Tensor(type, data, dims), tokens, style, inputs),
    )
  ).audio!.data as Float32Array;

function table(id: VoicePackId): Float32Array {
  const b = readFileSync(`public/${voiceTablePath(id)}`);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
const say = (id: VoicePackId, text: string) => renderChildVoice(run, table(id), lexicon, id, text);

function wav16(x: Float32Array): Buffer {
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
  return b;
}
function readWav16(path: string): Float32Array {
  const b = readFileSync(path);
  const n = b.readUInt32LE(40) / 2;
  return Float32Array.from({ length: n }, (_, i) => b.readInt16LE(44 + i * 2) / 32767);
}

/** Magnitude spectrum of each 512-sample frame (hop 256), in dB. */
function spectrogram(x: Float32Array): Float64Array[] {
  const n = 512;
  const out: Float64Array[] = [];
  const win = Float64Array.from(
    { length: n },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n),
  );
  for (let start = 0; start + n <= x.length; start += 256) {
    const re = Float64Array.from({ length: n }, (_, i) => x[start + i]! * win[i]!);
    const im = new Float64Array(n);
    // iterative radix-2 FFT
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j]!, re[i]!];
        [im[i], im[j]] = [im[j]!, im[i]!];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len)
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k);
          const wi = Math.sin(ang * k);
          const a = i + k;
          const b = a + len / 2;
          const tr = re[b]! * wr - im[b]! * wi;
          const ti = re[b]! * wi + im[b]! * wr;
          re[b] = re[a]! - tr;
          im[b] = im[a]! - ti;
          re[a] = re[a]! + tr;
          im[a] = im[a]! + ti;
        }
    }
    out.push(
      Float64Array.from(
        { length: n / 2 + 1 },
        (_, k) => 10 * Math.log10(re[k]! ** 2 + im[k]! ** 2 + 1e-10),
      ),
    );
  }
  return out;
}

/** Mean log-spectral distance (dB) over the frames that hold speech. */
function spectralDistance(a: Float32Array, b: Float32Array): number {
  const A = spectrogram(a);
  const B = spectrogram(b);
  const frames = Math.min(A.length, B.length);
  const loudest = Math.max(...A.map((f) => Math.max(...f)));
  let sum = 0;
  let count = 0;
  for (let t = 0; t < frames; t++) {
    if (Math.max(...A[t]!) < loudest - 40) continue;
    let d = 0;
    for (let k = 0; k < A[t]!.length; k++)
      d += (Math.max(A[t]![k]!, loudest - 80) - Math.max(B[t]![k]!, loudest - 80)) ** 2;
    sum += Math.sqrt(d / A[t]!.length);
    count++;
  }
  return sum / count;
}

const medianPitch = (x: Float32Array) => {
  const hz = Array.from(trackPitch(x, SAMPLE_RATE))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  return hz[Math.floor(hz.length / 2)]!;
};

beforeAll(async () => {
  const model = Buffer.concat(MODEL_PARTS.map((part) => readFileSync(`public/${part.path}`)));
  session = await ort.InferenceSession.create(model, { intraOpNumThreads: 2 });
  lexicon = JSON.parse(readFileSync(`public/${LEXICON.path}`, "utf8")) as Lexicon;
}, 60_000);

describe("child voice model files", () => {
  it("names the model by its content, so devices fetch a changed model", () => {
    const model = Buffer.concat(MODEL_PARTS.map((part) => readFileSync(`public/${part.path}`)));
    const hash = createHash("sha1").update(model).digest("hex").slice(0, 8);
    for (const part of MODEL_PARTS) expect(part.path).toContain(hash);
  });

  it("names each voice table by its content", () => {
    for (const id of IDS) {
      const hash = createHash("sha1")
        .update(readFileSync(`public/${voiceTablePath(id)}`))
        .digest("hex");
      expect(voiceTablePath(id)).toContain(hash.slice(0, 8));
    }
  });

  it("has the pitch inputs the child voices need", () => {
    for (const name of ["tokens", "style", "speed", "f0_scale", "f0_range", "f0_ref"])
      expect(session.inputNames).toContain(name);
  });
});

describe.each(IDS)("the %s voice", (id) => {
  it("is set to a child's pitch", () => {
    // The pitch the model is asked for (Praat measures the clips within 2% of it).
    const target = CHILD_VOICES[id].inputs.f0Scale * CHILD_VOICES[id].inputs.f0Ref;
    expect(target).toBeGreaterThan(230);
    expect(target).toBeLessThan(280);
  });

  it("speaks a sentence at a child's pitch, not an adult's", async () => {
    // The app's tracker (made for reshaping) reads these voices a little high,
    // so this is a band check; the reference test below catches any drift.
    const pitch = medianPitch(await say(id, SENTENCES.come));
    expect(pitch).toBeGreaterThan(220);
    expect(pitch).toBeLessThan(330);
  }, 60_000);

  it("makes exactly the same clip every time (a repeated word sounds the same)", async () => {
    const a = await say(id, SENTENCES.help);
    const b = await say(id, SENTENCES.help);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  }, 60_000);

  it("finishes clips at the app's loudness, under the peak ceiling, with silent ends", async () => {
    const x = await say(id, SENTENCES.come);
    expect(loudness(x, SAMPLE_RATE)).toBeCloseTo(TARGET_LUFS, 0);
    expect(20 * Math.log10(truePeak(x))).toBeLessThanOrEqual(PEAK_CEILING_DBTP + 0.1);
    expect(Math.abs(x[0]!)).toBeLessThan(0.01);
    expect(Math.abs(x[x.length - 1]!)).toBeLessThan(0.01);
  }, 60_000);

  it('ends words cleanly: no out-breath heard as an extra sound ("are" as "aren\'t")', async () => {
    // Words ending on a voiced sound; the boy's delivery used to add 0.1-0.2 s
    // of breathy hiss after each (ADR 0012).
    for (const word of ["are", "car", "more", "my", "water", "You are a superstar!"]) {
      expect(breathAfterVoice(await say(id, word), SAMPLE_RATE), word).toBeLessThan(0.03);
    }
  }, 120_000);

  it.each(Object.entries(SENTENCES))(
    "still matches the reference sample: %s",
    async (name, text) => {
      const x = await say(id, text);
      const path = `${FIXTURES}/${id}-${name}.wav`;
      if (process.env.UPDATE_VOICE_REFERENCE || !existsSync(path)) {
        mkdirSync(FIXTURES, { recursive: true });
        writeFileSync(path, wav16(x));
      }
      const ref = readWav16(path);
      expect(Math.abs(x.length / ref.length - 1)).toBeLessThan(0.02);
      expect(Math.abs(medianPitch(x) / medianPitch(ref) - 1)).toBeLessThan(0.03);
      // Under 2 dB: the same voice (16-bit storage and CPU rounding differ by far
      // less); a changed table, pitch setting or model moves it well past this.
      expect(spectralDistance(ref, x)).toBeLessThan(2);
    },
    60_000,
  );
});
