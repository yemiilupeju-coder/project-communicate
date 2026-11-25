/**
 * Child-voice clips made on the device (ADR 0004): words added for one
 * student and words typed on the keyboard, in the same voice as the built-in
 * clips. The voice model (≈ 112 MB) is downloaded once, on request, into
 * cache storage; each new word's clip is saved there too and works offline.
 */

import { clipKey, type VoicePackId } from "../core/voicePack";
import { VOICE_VERSION } from "./childVoices";
import { SAMPLE_RATE } from "./kokoro";
import { ENGINE_WASM, LEXICON, MODEL_PARTS, voiceTablePath, VOICE_TABLE_BYTES } from "./voiceModel";
import type { RenderReply, RenderRequest } from "./voiceWorker";

const MODEL_CACHE = "communicate-voice-model";
const WORDS_CACHE = "communicate-voice-words";
const base = import.meta.env.BASE_URL;
const IDLE_MS = 120_000;

const modelFiles = () => [
  ...MODEL_PARTS,
  ENGINE_WASM,
  LEXICON,
  { path: voiceTablePath("girl"), bytes: VOICE_TABLE_BYTES },
  { path: voiceTablePath("boy"), bytes: VOICE_TABLE_BYTES },
];

// ── The model download ──

export type ModelState = "absent" | "downloading" | "saved" | "failed";
let state: ModelState = "absent";
let progress = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function modelStatus(): { state: ModelState; progress: number } {
  return { state, progress };
}
export function onModelChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Checks cache storage once at start-up. */
export async function checkModel(): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(MODEL_CACHE);
    const found = await Promise.all(modelFiles().map((file) => cache.match(base + file.path)));
    if (found.every(Boolean)) {
      state = "saved";
      notify();
      return true;
    }
  } catch {
    // no cache storage: stays absent
  }
  return false;
}

let downloading: Promise<boolean> | null = null;

/** Downloads whatever part of the model isn't saved yet, reporting progress from 0 to 1. */
export function downloadModel(): Promise<boolean> {
  downloading ??= (async () => {
    state = "downloading";
    progress = 0;
    notify();
    try {
      const cache = await caches.open(MODEL_CACHE);
      const files = modelFiles();
      const total = files.reduce((sum, file) => sum + file.bytes, 0);
      let done = 0;
      for (const file of files) {
        const href = base + file.path;
        if (await cache.match(href)) {
          done += file.bytes;
          continue;
        }
        const response = await fetch(href);
        if (!response.ok || !response.body) throw new Error(`${file.path}: ${response.status}`);
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          chunks.push(value);
          done += value.byteLength;
          progress = Math.min(0.99, done / total);
          notify();
        }
        await cache.put(href, new Response(new Blob(chunks as BlobPart[])));
      }
      // Drop files an older version of the app downloaded.
      const wanted = new Set(files.map((file) => new URL(base + file.path, location.href).href));
      for (const request of await cache.keys())
        if (!wanted.has(request.url)) await cache.delete(request);
      state = "saved";
      progress = 1;
      notify();
      return true;
    } catch {
      state = "failed";
      notify();
      return false;
    } finally {
      downloading = null;
    }
  })();
  return downloading;
}

// ── Making clips (in a worker) ──

let worker: Worker | null = null;
let idleTimer: number | undefined;
let nextJob = 1;
const pending = new Map<number, (audio: Float32Array | null) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./voiceWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<RenderReply>) => {
      const reply = event.data;
      pending.get(reply.job)?.("audio" in reply ? reply.audio : null);
      pending.delete(reply.job);
    };
    worker.onerror = () => {
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  // The model takes memory; let it go when no words have been made for a while.
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (pending.size === 0) {
      worker?.terminate();
      worker = null;
    }
  }, IDLE_MS);
  return worker;
}

function render(id: VoicePackId, text: string): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    const job = nextJob++;
    pending.set(job, resolve);
    getWorker().postMessage({ job, id, text, base } satisfies RenderRequest);
  });
}

// ── Saved word clips ──

const wordUrl = (id: VoicePackId, key: string) =>
  `${base}voice-words/${VOICE_VERSION}/${id}/${encodeURIComponent(key)}`;
const known = new Map<VoicePackId, Set<string>>();
const audioCache = new Map<string, Float32Array>();

/** Loads the list of saved word clips (call once at start-up). */
export async function loadSavedWords(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(WORDS_CACHE);
    for (const request of await cache.keys()) {
      const path = new URL(request.url).pathname;
      const match = path.match(/voice-words\/([^/]+)\/(girl|boy)\/(.+)$/);
      if (!match) continue;
      if (match[1] !== VOICE_VERSION) {
        await cache.delete(request); // made by an older engine: make again
        continue;
      }
      const id = match[2] as VoicePackId;
      if (!known.has(id)) known.set(id, new Set());
      known.get(id)!.add(decodeURIComponent(match[3]!));
    }
  } catch {
    // cache storage unavailable
  }
}

export function hasWordClip(id: VoicePackId, key: string): boolean {
  return known.get(id)?.has(key) ?? false;
}

export async function wordClip(id: VoicePackId, key: string): Promise<Float32Array | null> {
  const name = `${id}:${key}`;
  const hit = audioCache.get(name);
  if (hit) return hit;
  try {
    const cache = await caches.open(WORDS_CACHE);
    const response = await cache.match(wordUrl(id, key));
    if (!response) return null;
    const pcm = new Int16Array(await response.arrayBuffer());
    const audio = Float32Array.from(pcm, (v) => v / 32767);
    audioCache.set(name, audio);
    return audio;
  } catch {
    return null;
  }
}

const making = new Map<string, Promise<boolean>>();

/** Makes and saves a clip for each text that doesn't have one yet (one at a time). */
export async function makeClips(id: VoicePackId, texts: readonly string[]): Promise<boolean> {
  if (state !== "saved") return false;
  let all = true;
  for (const text of texts) {
    const key = clipKey(text);
    if (!key || hasWordClip(id, key)) continue;
    const name = `${id}:${key}`;
    let job = making.get(name);
    if (!job) {
      job = (async () => {
        const audio = await render(id, text);
        if (!audio || audio.length === 0) return false;
        const pcm = Int16Array.from(audio, (v) =>
          Math.max(-32768, Math.min(32767, Math.round(v * 32767))),
        );
        try {
          const cache = await caches.open(WORDS_CACHE);
          await cache.put(wordUrl(id, key), new Response(pcm.buffer));
        } catch {
          // still usable this session
        }
        audioCache.set(name, audio);
        if (!known.has(id)) known.set(id, new Set());
        known.get(id)!.add(key);
        return true;
      })();
      making.set(name, job);
      void job.finally(() => making.delete(name));
    }
    if (!(await job)) all = false;
  }
  return all;
}

export function wordSampleRate(): number {
  return SAMPLE_RATE;
}
