/**
 * Plays a voice pack's clips through Web Audio (ADR 0004).
 *
 * A pack is two files: one audio file of every clip back to back, and an
 * index of where each clip starts. They are downloaded once, kept in the
 * browser's cache storage, and work offline from then on.
 */

import {
  hasSentence,
  hasWordClip,
  makeClips,
  makeSentence,
  modelStatus,
  sentenceClip,
  setPlaybackCheck,
  wordClip,
  wordSampleRate,
} from "../voice/deviceVoice";
import {
  clipKey,
  planClips,
  sentenceKey,
  VOICE_PACK_IDS,
  wordsOf,
  type ClipIndex,
  type VoicePackId,
} from "./voicePack";
import { convertRate } from "./rateConvert";
import { VOICE_PACK_FILES } from "./voicePacks.generated";

const CACHE_NAME = "communicate-voices";
/** The pause between joined clips: short, as between words in speech. */
const GAP_SECONDS = 0.035;

interface Pack {
  readonly index: ClipIndex;
  readonly data: ArrayBuffer;
}

const url = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const packs = new Map<VoicePackId, Promise<Pack | null>>();
const decoded = new Map<string, Promise<AudioBuffer | null>>();
let context: AudioContext | null = null;
let playing: AudioBufferSourceNode[] = [];

async function cachedFetch(path: string, download: boolean): Promise<Response | null> {
  const href = url(path);
  try {
    const cache = "caches" in window ? await caches.open(CACHE_NAME) : null;
    const hit = cache ? await cache.match(href) : undefined;
    if (hit) return hit;
    if (!download) return null;
    const response = await fetch(href);
    if (!response.ok) return null;
    if (cache) await cache.put(href, response.clone());
    return response;
  } catch {
    return null;
  }
}

/** Removes packs left over from earlier versions of the app. */
async function tidyCache(): Promise<void> {
  if (!("caches" in window)) return;
  const keep = new Set(
    VOICE_PACK_IDS.flatMap((id) => [
      url(VOICE_PACK_FILES[id].audio),
      url(VOICE_PACK_FILES[id].index),
    ]),
  );
  const cache = await caches.open(CACHE_NAME);
  for (const request of await cache.keys()) {
    if (![...keep].some((href) => request.url.endsWith(href))) await cache.delete(request);
  }
}

/**
 * Loads a pack, downloading it if needed (and allowed). Resolves to null when
 * it isn't available, for example offline before it was ever downloaded.
 */
export function loadPack(id: VoicePackId, download = true): Promise<Pack | null> {
  const existing = packs.get(id);
  if (existing) return existing;
  const files = VOICE_PACK_FILES[id];
  const promise = (async () => {
    const [indexResponse, audioResponse] = await Promise.all([
      cachedFetch(files.index, download),
      cachedFetch(files.audio, download),
    ]);
    if (!indexResponse || !audioResponse) return null;
    try {
      const pack = {
        index: (await indexResponse.json()) as ClipIndex,
        data: await audioResponse.arrayBuffer(),
      };
      void tidyCache().catch(() => undefined);
      return pack;
    } catch {
      return null;
    }
  })();
  packs.set(id, promise);
  // A failed load (say, offline) may succeed later, so don't keep the failure.
  void promise.then((pack) => {
    if (!pack) packs.delete(id);
  });
  return promise;
}

/** Whether a pack is on this device, ready to use offline. */
export async function packIsSaved(id: VoicePackId): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const files = VOICE_PACK_FILES[id];
    const found = await Promise.all([cache.match(url(files.audio)), cache.match(url(files.index))]);
    return found.every(Boolean);
  } catch {
    return false;
  }
}

/** Megabytes to download for a pack, for the adult menu. */
export function packMegabytes(id: VoicePackId): number {
  return Math.round(VOICE_PACK_FILES[id].bytes / 100_000) / 10;
}

function audio(): AudioContext | null {
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  // Speak even when an iPhone's ring/silent switch is set to silent, like the device voice.
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "playback";
  // A little more output buffering than the default ("interactive", about
  // 10 ms): measured glitches came from the audio thread missing its turn
  // while the voice maker was busy (docs/audio-qa). About 40 ms of extra
  // buffering absorbs that; a tap still sounds within about 100 ms.
  context = new Ctor({ latencyHint: "balanced" });
  return context;
}

/** Call from a tap: browsers only start audio in response to a user action. */
export function unlockAudio(): void {
  const ctx = audio();
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
}

export function stopClips(): void {
  for (const source of playing) {
    try {
      source.stop();
    } catch {
      // already finished
    }
  }
  playing = [];
}

/**
 * Where the sound in a clip starts and ends. Each clip carries some silence
 * (padding when it was made, and more from MP3 decoding); trimmed, joined
 * words follow each other closely, as in speech.
 */
export function soundSpan(samples: Float32Array, sampleRate: number): [number, number] {
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

/** A trimmed copy of the clip, faded in and out over 4 ms so it never clicks. */
function trimmed(ctx: AudioContext, samples: Float32Array, sampleRate: number): AudioBuffer | null {
  const [start, end] = soundSpan(samples, sampleRate);
  if (end <= start) return null;
  const out = samples.slice(start, end);
  const fade = Math.min(Math.round(sampleRate * 0.004), Math.floor(out.length / 2));
  for (let i = 0; i < fade; i++) {
    out[i]! *= i / fade;
    out[out.length - 1 - i]! *= i / fade;
  }
  // Clips made on the device are at 24 kHz. Left to the browser, Chrome
  // converts them to the speakers' rate by straight-line interpolation, which
  // measurably added grit and clicks (docs/audio-qa); a proper windowed-sinc
  // conversion here keeps them as clean as the built-in clips.
  const rate = ctx.sampleRate;
  const ready = convertRate(out, sampleRate, rate);
  const buffer = ctx.createBuffer(1, ready.length, rate);
  buffer.copyToChannel(ready as Float32Array<ArrayBuffer>, 0);
  return buffer;
}

function decode(ctx: AudioContext, id: VoicePackId, pack: Pack, key: string) {
  const name = `${id}:${key}`;
  let buffer = decoded.get(name);
  if (!buffer) {
    const [offset, length] = pack.index[key] ?? [0, 0];
    buffer = ctx
      .decodeAudioData(pack.data.slice(offset, offset + length))
      .then((full) => trimmed(ctx, full.getChannelData(0), full.sampleRate))
      .catch(() => null);
    decoded.set(name, buffer);
  }
  return buffer;
}

/** Device-made clips ready to play (trimmed, at the speakers' rate), most recent kept. */
const preparedClips = new Map<string, AudioBuffer>();
async function prepared(
  ctx: AudioContext,
  name: string,
  load: () => Promise<Float32Array | null>,
): Promise<AudioBuffer | null> {
  const hit = preparedClips.get(name);
  if (hit) return hit;
  const samples = await load();
  const buffer = samples ? trimmed(ctx, samples, wordSampleRate()) : null;
  if (buffer) {
    preparedClips.set(name, buffer);
    if (preparedClips.size > 60) preparedClips.delete(preparedClips.keys().next().value!);
  }
  return buffer;
}

/** How long to wait for the device to make a missing word before using the device voice. */
const MAKE_WAIT_MS = 5000;
/**
 * The longest Speak waits for a new sentence to be made in one go (ADR 0004,
 * Nov 27 update). A sentence is never said as flat, joined words while the
 * device can make it whole; only if it can't within this time (a struggling
 * device) are the words joined instead, and the sentence is still finished and
 * saved for next time.
 */
const WHOLE_WAIT_MS = 10000;

/** Sentences Speak is waiting on, so a second tap doesn't say it twice. */
const waitingFor = new Set<string>();

const within = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<false>((resolve) => window.setTimeout(() => resolve(false), ms)),
  ]);

let playingUntil = 0;
setPlaybackCheck(() => context !== null && context.currentTime < playingUntil);

function play(ctx: AudioContext, buffers: readonly AudioBuffer[]): "started" {
  stopClips();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  // Start times fall on whole samples. Between samples, the browser shifts
  // the whole clip by interpolation, which dulls it (measured: clips arrived
  // 24 dB different from themselves; docs/audio-qa).
  const frame = (t: number) => Math.round(t * ctx.sampleRate) / ctx.sampleRate;
  let at = frame(ctx.currentTime + 0.02);
  for (const buffer of buffers) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(at);
    playing.push(source);
    at = frame(at + buffer.duration + GAP_SECONDS);
  }
  playingUntil = at;
  return "started";
}

/**
 * Says the text in the child's voice. With `whole` (Speak, and sentences), a
 * sentence is said in one go when the device can make it (the voice maker is
 * downloaded), so it sounds like speech; a new sentence is waited for rather
 * than said as flat, joined words. Without the voice maker (or if it can't
 * make the sentence in time) it is joined from word clips: built-in ones from
 * the pack, and ones made on this device. "unavailable" means the caller
 * should use the device voice instead, for the whole message.
 */
export async function playPack(
  id: VoicePackId,
  text: string,
  whole = false,
): Promise<"started" | "unavailable"> {
  const ctx = audio();
  if (!ctx) return "unavailable";
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  const pack = await loadPack(id);
  if (!pack) return "unavailable";
  const has = (key: string) => Boolean(pack.index[key]) || hasWordClip(id, key);
  const missing = () => wordsOf(text).filter((word) => !has(clipKey(word)));
  let plan = planClips(has, text);

  // A sentence the pack doesn't have as one phrase: say it in one go if we can.
  const sentence = whole && wordsOf(text).length > 1 && !pack.index[clipKey(text)];
  if (sentence && (hasSentence(id, text) || modelStatus().state === "saved")) {
    const ready = hasSentence(id, text);
    const key = `${id}:${sentenceKey(text)}`;
    // Speak tapped again while this sentence is being made: it will be said once.
    if (!ready && waitingFor.has(key)) return "started";
    // Wait for the natural, whole sentence rather than saying the words flat.
    waitingFor.add(key);
    try {
      const made = makeSentence(id, text, "now", true);
      if (ready ? await made : await within(made, WHOLE_WAIT_MS)) {
        const buffer = await prepared(ctx, key, () => sentenceClip(id, text));
        if (buffer) return play(ctx, [buffer]);
      }
    } finally {
      waitingFor.delete(key);
    }
    if (!plan) {
      void makeClips(id, missing(), "later");
      return "unavailable";
    }
  }

  if (!plan && modelStatus().state === "saved") {
    if (await within(makeClips(id, missing()), MAKE_WAIT_MS)) plan = planClips(has, text);
  }
  if (!plan) return "unavailable";
  const buffers = await Promise.all(
    plan.map(async (key) => {
      if (pack.index[key]) return decode(ctx, id, pack, key);
      return prepared(ctx, `${id}:${key}`, () => wordClip(id, key));
    }),
  );
  if (buffers.some((buffer) => buffer === null)) return "unavailable";
  return play(ctx, buffers as AudioBuffer[]);
}
