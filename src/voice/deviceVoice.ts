/**
 * Child-voice clips made on the device (ADR 0004): words added for one
 * student, words typed on the keyboard, and whole sentences (said in one go,
 * so they sound like speech rather than words read from a list). The voice
 * model (≈ 114 MB) is downloaded once, on request, into cache storage; each
 * clip made is saved there too and works offline.
 */

import { clipKey, sentenceKey, sentenceText, type VoicePackId } from "../core/voicePack";
import { JobQueue, type Priority } from "./jobQueue";
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
    // The model itself is saved but an update needs a small new file (say, a
    // new voice table): fetch it quietly rather than asking again. Likewise
    // when an older version of the model is saved: the person already chose
    // to download the voice, so an update replaces it (the old files are
    // dropped once the new ones are in).
    const modelSaved = MODEL_PARTS.every(
      (part) => found[modelFiles().findIndex((file) => file.path === part.path)],
    );
    const olderSaved = (await cache.keys()).length > 0;
    if ((modelSaved || olderSaved) && navigator.onLine) return downloadModel();
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

// ── Making clips (in a worker, one at a time) ──

let worker: Worker | null = null;
let idleTimer: number | undefined;
let nextJob = 1;
const pending = new Map<number, (reply: RenderReply | null) => void>();
let playbackBusy: () => boolean = () => false;
/** Lets the player say when audio is playing; background work waits for it to finish. */
export function setPlaybackCheck(check: () => boolean): void {
  playbackBusy = check;
}
const queue = new JobQueue<Float32Array | null>(() => playbackBusy());
/** Engine threads: several where the page allows it; one after a failure. */
// One core is left free for the page and audio playback.
let threads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./voiceWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<RenderReply>) => {
      const reply = event.data;
      pending.get(reply.job)?.(reply);
      pending.delete(reply.job);
    };
    worker.onerror = () => stopWorker();
  }
  return worker;
}

function stopWorker(): void {
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
  worker?.terminate();
  worker = null;
}

// The model takes memory, so it is let go while the app is in the background
// for a while; while the app is open, it stays ready so sentences come quickly.
const IDLE_HIDDEN_MS = 120_000;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    window.clearTimeout(idleTimer);
    if (document.visibilityState === "hidden") {
      idleTimer = window.setTimeout(() => {
        if (pending.size === 0 && queue.running() === null) stopWorker();
      }, IDLE_HIDDEN_MS);
    }
  });
}

function ask(id: VoicePackId, text: string): Promise<RenderReply | null> {
  return new Promise((resolve) => {
    const job = nextJob++;
    pending.set(job, resolve);
    getWorker().postMessage({ job, id, text, base, threads } satisfies RenderRequest);
  });
}

/** Asks the worker for a clip; if the engine can't start with threads, tries again with one. */
async function ask1(id: VoicePackId, text: string): Promise<Float32Array | null> {
  let reply = await ask(id, text);
  if (reply && "error" in reply && reply.loading && threads > 1) {
    threads = 1;
    stopWorker();
    reply = await ask(id, text);
  }
  return reply && "audio" in reply ? reply.audio : null;
}

// How fast this device makes clips (milliseconds per letter), learned as it goes.
let msPerLetter = 0;
let runningSince = 0;
let runningLetters = 0;

// How long loading the model took here (the first clip after the worker starts).
let loadMs = 0;

function render(id: VoicePackId, key: string, text: string, priority: Priority) {
  return queue.add(
    `${id}:${key}`,
    priority,
    async () => {
      const cold = worker === null; // this one includes loading the model
      runningSince = performance.now();
      runningLetters = text.length;
      const audio = await ask1(id, text);
      const ms = performance.now() - runningSince;
      runningSince = 0;
      if (cold && audio) loadMs = Math.max(0, ms - msPerLetter * text.length);
      if (!cold && audio && audio.length > 0 && text.length >= 8) {
        const rate = ms / text.length;
        msPerLetter = msPerLetter === 0 ? rate : 0.7 * msPerLetter + 0.3 * rate;
      }
      return audio;
    },
    null,
  );
}

/** Loads the voice maker ahead of use, so the first sentence isn't slowed by it. */
export function warmUp(id: VoicePackId): void {
  if (state !== "saved") return;
  if (!worker) void render(id, "warm-up", "Hi.", "later");
  // A typical sentence, to learn how fast this device is.
  if (msPerLetter === 0) void render(id, "warm-up-2", "I want to play outside.", "later");
}

/**
 * About how long until the device could have this sentence ready, in
 * milliseconds (Infinity before it has made anything to judge by).
 */
export function sentenceEta(id: VoicePackId, text: string): number {
  if (msPerLetter === 0) return Infinity;
  const own = msPerLetter * sentenceText(text).length;
  if (queue.running() === `${id}:${sentenceKey(text)}`)
    return Math.max(0, own - (performance.now() - runningSince));
  const busy =
    runningSince > 0
      ? Math.max(0, msPerLetter * runningLetters - (performance.now() - runningSince))
      : 0;
  const ahead = queue.pending().filter((job) => job.priority === "now").length;
  // If the model isn't loaded, loading it comes first.
  const load = worker === null ? loadMs || 3000 : 0;
  return load + own + busy + ahead * own;
}

// ── Saved clips ──

const clipUrl = (id: VoicePackId, key: string) =>
  `${base}voice-words/${VOICE_VERSION}/${id}/${encodeURIComponent(key)}`;
const known = new Map<VoicePackId, Set<string>>();
const audioCache = new Map<string, Float32Array>();
/** Saved sentences, oldest first, so the oldest go when there are too many. */
const sentenceOrder: { id: VoicePackId; key: string }[] = [];
const MAX_SENTENCES = 300;
const isSentence = (key: string) => key.startsWith("sentence:");

function remember(id: VoicePackId, key: string): void {
  if (!known.has(id)) known.set(id, new Set());
  const keys = known.get(id)!;
  if (!keys.has(key) && isSentence(key)) sentenceOrder.push({ id, key });
  keys.add(key);
}

/** Loads the list of saved clips (call once at start-up). */
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
      remember(match[2] as VoicePackId, decodeURIComponent(match[3]!));
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
    const response = await cache.match(clipUrl(id, key));
    if (!response) return null;
    const pcm = new Int16Array(await response.arrayBuffer());
    const audio = Float32Array.from(pcm, (v) => v / 32767);
    audioCache.set(name, audio);
    return audio;
  } catch {
    return null;
  }
}

async function save(id: VoicePackId, key: string, audio: Float32Array): Promise<void> {
  audioCache.set(`${id}:${key}`, audio);
  if (hasWordClip(id, key)) return;
  remember(id, key);
  const pcm = Int16Array.from(audio, (v) =>
    Math.max(-32768, Math.min(32767, Math.round(v * 32767))),
  );
  try {
    const cache = await caches.open(WORDS_CACHE);
    await cache.put(clipUrl(id, key), new Response(pcm.buffer));
    while (sentenceOrder.length > MAX_SENTENCES) {
      const old = sentenceOrder.shift()!;
      known.get(old.id)?.delete(old.key);
      audioCache.delete(`${old.id}:${old.key}`);
      await cache.delete(clipUrl(old.id, old.key));
    }
  } catch {
    // still usable this session
  }
}

/** Makes and saves a clip for each word that doesn't have one yet. */
export async function makeClips(
  id: VoicePackId,
  texts: readonly string[],
  priority: Priority = "now",
): Promise<boolean> {
  if (state !== "saved") return false;
  const jobs = texts.map(async (text) => {
    const key = clipKey(text);
    if (!key || hasWordClip(id, key)) return true;
    const audio = await render(id, key, text, priority);
    if (!audio || audio.length === 0) return false;
    await save(id, key, audio);
    return true;
  });
  return (await Promise.all(jobs)).every(Boolean);
}

// ── Whole sentences ──

/**
 * Guesses kept in memory only: the sentence a student is building is made
 * while they pause, and saved only if they actually say it.
 */
const guesses = new Map<string, Float32Array>();
const MAX_GUESSES = 12;

export function hasSentence(id: VoicePackId, text: string): boolean {
  const key = sentenceKey(text);
  return hasWordClip(id, key) || guesses.has(`${id}:${key}`);
}

/**
 * Makes a sentence's clip. `save` keeps it on the device (a sentence that was
 * said, or a saved sentence); otherwise it is a guess, kept in memory.
 */
export async function makeSentence(
  id: VoicePackId,
  text: string,
  priority: Priority,
  keep: boolean,
): Promise<boolean> {
  if (hasSentence(id, text)) {
    if (keep) await keepSentence(id, text);
    return true;
  }
  if (state !== "saved" || clipKey(text).length === 0) return false;
  const key = sentenceKey(text);
  const audio = await render(id, key, sentenceText(text), priority);
  if (!audio || audio.length === 0) return false;
  guesses.set(`${id}:${key}`, audio);
  while (guesses.size > MAX_GUESSES) guesses.delete(guesses.keys().next().value!);
  if (keep) await keepSentence(id, text);
  return true;
}

/** The sentence's clip, if it has been made (saved, or guessed this session). */
export async function sentenceClip(id: VoicePackId, text: string): Promise<Float32Array | null> {
  const key = sentenceKey(text);
  return guesses.get(`${id}:${key}`) ?? (await wordClip(id, key));
}

/** Saves a guessed sentence once it has been said, so it plays whole next time too. */
export async function keepSentence(id: VoicePackId, text: string): Promise<void> {
  const key = sentenceKey(text);
  const audio = guesses.get(`${id}:${key}`);
  if (audio) await save(id, key, audio);
}

export function wordSampleRate(): number {
  return SAMPLE_RATE;
}
