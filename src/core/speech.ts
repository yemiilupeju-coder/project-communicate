/**
 * Speech output through the browser's built-in voices (Web Speech API).
 *
 * This is step 3 of the voice fallback ladder; recorded and pre-rendered clips
 * (steps 1–2) arrive in release 2. If speech is unavailable or fails, callers
 * show the message as large text instead (step 4), so the student is never
 * silenced without a visible alternative.
 */

export interface VoiceInfo {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}

export type SpeakResult = "started" | "unavailable" | "failed";

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Voices load asynchronously in some browsers; waits up to `timeoutMs`. */
export function listVoices(timeoutMs = 2000): Promise<VoiceInfo[]> {
  if (!speechAvailable()) return Promise.resolve([]);
  const read = (): VoiceInfo[] =>
    window.speechSynthesis.getVoices().map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      localService: v.localService,
    }));
  const now = read();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(read());
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

/** Offline-capable English voices first, then other offline voices, then the rest. */
export function sortVoices(voices: readonly VoiceInfo[], preferredLang = "en-CA"): VoiceInfo[] {
  const base = preferredLang.split("-")[0] ?? "en";
  const score = (v: VoiceInfo) =>
    (v.localService ? 0 : 10) + (v.lang === preferredLang ? 0 : v.lang.startsWith(base) ? 1 : 5);
  return [...voices].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}

export interface SpeakOptions {
  voiceURI: string | null;
  rate: number;
}

/**
 * Speaks `text`, stopping anything already being said (never two at once).
 * Must be called from a user gesture the first time on iOS.
 */
export function speak(text: string, options: SpeakOptions): Promise<SpeakResult> {
  if (!speechAvailable()) return Promise.resolve("unavailable");
  const synth = window.speechSynthesis;
  synth.cancel();
  if (text.trim().length === 0) return Promise.resolve("started");
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = options.voiceURI
    ? synth.getVoices().find((v) => v.voiceURI === options.voiceURI)
    : undefined;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "en-CA";
  }
  utterance.rate = options.rate;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: SpeakResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    // Some engines never fire `start` when they can't speak; don't wait forever.
    const timer = setTimeout(() => finish("failed"), 4000);
    utterance.onstart = () => finish("started");
    utterance.onerror = (event) => {
      // "interrupted"/"canceled" mean a newer word replaced this one: not a failure.
      if (event.error === "interrupted" || event.error === "canceled") finish("started");
      else finish("failed");
    };
    synth.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
