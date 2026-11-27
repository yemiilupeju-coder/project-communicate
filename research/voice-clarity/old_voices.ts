// The previous voices (Nov 25 build, b6b295e): af_nova / af_kore from Kokoro
// int8 at normal speed and pitch, then the app's PSOLA reshape, then finish.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as ort from "onnxruntime-node";
import { reshape, finish } from "../project-communicate/src/voice/reshape";
import { NEUTRAL_INPUTS, kokoroFeeds } from "../project-communicate/src/voice/kokoro";
const C = JSON.parse(readFileSync("corpus.json", "utf8")) as Record<string, { tokens: number[] }>;
const session = await ort.InferenceSession.create(
  "/home/claude/project-communicate/research/child-voice/kokoro-pitch-int8.onnx",
  { intraOpNumThreads: 2 },
);
const OLD = {
  girl: { voice: "af_nova", settings: { formant: 1.26, median: 285, range: 1.25, duration: 1.08 } },
  boy: { voice: "af_kore", settings: { formant: 1.16, median: 250, range: 1.22, duration: 1.08 } },
};
for (const [vid, o] of Object.entries(OLD)) {
  const b = readFileSync(`/tmp/qa/tables/${o.voice}.bin`);
  const table = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  for (const [stage, fn] of [
    ["O1-old-raw", (x: Float32Array) => x],
    ["O2-old-reshaped", (x: Float32Array) => reshape(x, 24000, o.settings)],
    ["O3-old-finished", (x: Float32Array) => finish(reshape(x, 24000, o.settings), 24000)],
  ] as const) {
    const d = `raw/${vid}/${stage}`;
    mkdirSync(d, { recursive: true });
    for (const [k, v] of Object.entries(C)) {
      const t = BigInt64Array.from([0, ...v.tokens, 0].map(BigInt));
      const style = table.subarray(
        (Math.min(v.tokens.length, 510) - 1) * 256,
        Math.min(v.tokens.length, 510) * 256,
      );
      const out = await session.run(
        kokoroFeeds((a, d2, s) => new ort.Tensor(a, d2, s), t, style, NEUTRAL_INPUTS),
      );
      const x = fn(out.audio!.data as Float32Array) as Float32Array;
      writeFileSync(`${d}/${k}.f32`, Buffer.from(x.buffer, x.byteOffset, x.byteLength));
    }
    console.log(vid, stage);
  }
}
