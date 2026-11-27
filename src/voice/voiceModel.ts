/**
 * The voice model files devices download once (≈ 112 MB in all), hosted with
 * the app. The model is split into parts because the host serves files of up
 * to 25 MB; devices and the build script join them back together.
 */

import type { VoicePackId } from "../core/voicePack";
import { CHILD_VOICES } from "./childVoices";

export const MODEL_PARTS: readonly { path: string; bytes: number }[] = [
  // Kokoro-82M int8 with the in-graph pitch control (research/child-voice),
  // named by its content so devices fetch a changed model.
  { path: "voice-model/kokoro-int8-f0-26f8c9d3.onnx.part0", bytes: 24_000_000 },
  { path: "voice-model/kokoro-int8-f0-26f8c9d3.onnx.part1", bytes: 24_000_000 },
  { path: "voice-model/kokoro-int8-f0-26f8c9d3.onnx.part2", bytes: 24_000_000 },
  { path: "voice-model/kokoro-int8-f0-26f8c9d3.onnx.part3", bytes: 20_361_713 },
];

/** onnxruntime-web's engine, copied from node_modules/onnxruntime-web/dist (a test checks it matches). */
export const ENGINE_WASM = { path: "voice-model/ort-wasm-simd-threaded.wasm", bytes: 14_848_852 };

/**
 * The engine's script, which its helper threads start from (copied from
 * node_modules/onnxruntime-web/dist; a test checks it matches). Small, so it
 * is part of the app (precached), not the download.
 */
export const ENGINE_SCRIPT = "voice-model/ort-wasm-simd-threaded.mjs";

export function voiceTablePath(id: VoicePackId): string {
  return CHILD_VOICES[id].table;
}

export const VOICE_TABLE_BYTES = 522_240;

/**
 * misaki's US English pronunciation dictionaries (Apache 2.0, hexgrad), merged
 * into one word → phonemes file. Named by its content, so a new one downloads.
 */
export const LEXICON = { path: "voice-model/lexicon-us-50ec005305.json", bytes: 5_286_254 };

export function modelDownloadMegabytes(): number {
  const total =
    MODEL_PARTS.reduce((sum, part) => sum + part.bytes, 0) +
    ENGINE_WASM.bytes +
    LEXICON.bytes +
    2 * VOICE_TABLE_BYTES;
  return Math.round(total / 1_000_000);
}
