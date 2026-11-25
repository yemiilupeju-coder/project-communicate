/// <reference lib="webworker" />
/**
 * Makes child-voice clips on the device, off the main thread so the board
 * never freezes. Reads the model only from cache storage (downloaded once by
 * deviceVoice.ts): it never touches the network.
 */

import * as ort from "onnxruntime-web/wasm";
import type { VoicePackId } from "../core/voicePack";
import { renderChildVoice } from "./childVoices";
import type { Lexicon } from "./g2p";
import { ENGINE_WASM, LEXICON, MODEL_PARTS, voiceTablePath } from "./voiceModel";

export const MODEL_CACHE = "communicate-voice-model";

export interface RenderRequest {
  readonly job: number;
  readonly id: VoicePackId;
  readonly text: string;
  readonly base: string;
}
export type RenderReply =
  | { readonly job: number; readonly audio: Float32Array }
  | { readonly job: number; readonly error: string };

let session: Promise<ort.InferenceSession> | null = null;
const tables = new Map<VoicePackId, Promise<Float32Array>>();
let lexicon: Promise<Lexicon> | null = null;

async function fromCache(base: string, path: string): Promise<ArrayBuffer> {
  const cache = await caches.open(MODEL_CACHE);
  const hit = await cache.match(base + path);
  if (!hit) throw new Error(`${path} is not downloaded`);
  return hit.arrayBuffer();
}

function load(base: string): Promise<ort.InferenceSession> {
  session ??= (async () => {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmBinary = await fromCache(base, ENGINE_WASM.path);
    const parts = await Promise.all(MODEL_PARTS.map((part) => fromCache(base, part.path)));
    const model = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
      model.set(new Uint8Array(part), offset);
      offset += part.byteLength;
    }
    return ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  })();
  session.catch(() => {
    session = null;
  });
  return session;
}

function table(base: string, id: VoicePackId): Promise<Float32Array> {
  let found = tables.get(id);
  if (!found) {
    found = fromCache(base, voiceTablePath(id)).then((buffer) => new Float32Array(buffer));
    tables.set(id, found);
    found.catch(() => tables.delete(id));
  }
  return found;
}

function words(base: string): Promise<Lexicon> {
  lexicon ??= fromCache(base, LEXICON.path).then(
    (buffer) => JSON.parse(new TextDecoder().decode(buffer)) as Lexicon,
  );
  lexicon.catch(() => {
    lexicon = null;
  });
  return lexicon;
}

self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  const { job, id, text, base } = event.data;
  try {
    const model = await load(base);
    const run = async (tokens: BigInt64Array, style: Float32Array) => {
      const out = await model.run({
        tokens: new ort.Tensor("int64", tokens, [1, tokens.length]),
        style: new ort.Tensor("float32", style, [1, 256]),
        speed: new ort.Tensor("float32", new Float32Array([1]), [1]),
      });
      return out.audio!.data as Float32Array;
    };
    const audio = await renderChildVoice(run, await table(base, id), await words(base), id, text);
    (self as unknown as Worker).postMessage({ job, audio } satisfies RenderReply, [audio.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ job, error: String(error) } satisfies RenderReply);
  }
};
