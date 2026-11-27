// Applies the app's own processing, in the app's order, to the raw stage D
// audio (and to the source, for comparison): E finish (trim, fades, loudness,
// limiter), F 24k->48k rate conversion (device-made clips), and the playback
// trim + 4 ms fade (clipPlayer.trimmed). MP3 (G) is done with the build's
// exact ffmpeg settings in stages_mp3.py.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { finish } from "../project-communicate/src/voice/reshape";
import { convertRate } from "../project-communicate/src/core/rateConvert";
// soundSpan copied verbatim from src/core/clipPlayer.ts (that module needs the browser).
function soundSpan(samples: Float32Array, sampleRate: number): [number, number] {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) return [0, 0];
  const floor = peak * 0.01; // 40 dB below the loudest point
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]!) < floor) start++;
  let end = samples.length;
  while (end > start && Math.abs(samples[end - 1]!) < floor) end--;
  const pad = Math.round(sampleRate * 0.015);
  return [Math.max(0, start - pad), Math.min(samples.length, end + pad)];
}
const read = (p: string) => {
  const b = readFileSync(p);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const write = (p: string, x: Float32Array) =>
  writeFileSync(p, Buffer.from(x.buffer, x.byteOffset, x.byteLength));
function playTrim(x: Float32Array, sr: number) {
  const [s, e] = soundSpan(x, sr);
  const out = x.slice(s, e);
  const fade = Math.min(Math.round(sr * 0.004), Math.floor(out.length / 2));
  for (let i = 0; i < fade; i++) {
    out[i]! *= i / fade;
    out[out.length - 1 - i]! *= i / fade;
  }
  return out;
}
for (const vid of ["girl", "boy"]) {
  const src = `raw/${vid}/D-generated-shipped`;
  for (const [name, fn] of [
    ["E-finished", (x: Float32Array) => finish(x, 24000)],
    ["F-rate-48k", (x: Float32Array) => convertRate(finish(x, 24000), 24000, 48000)],
    [
      "H-device-playback-48k",
      (x: Float32Array) => convertRate(playTrim(finish(x, 24000), 24000), 24000, 48000),
    ],
  ] as const) {
    const out = `raw/${vid}/${name}`;
    mkdirSync(out, { recursive: true });
    for (const f of readdirSync(src)) write(`${out}/${f}`, fn(read(`${src}/${f}`)) as Float32Array);
  }
  console.log(vid, "done");
}
