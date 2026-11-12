/** The browser's built-in speechSynthesis, measured for comparison. */

export interface SystemVoiceInfo {
  name: string;
  lang: string;
  localService: boolean;
  voiceURI: string;
}

export function systemSpeechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Voices load asynchronously in some browsers; wait up to `timeoutMs`. */
export function listSystemVoices(timeoutMs = 2000): Promise<SystemVoiceInfo[]> {
  if (!systemSpeechAvailable()) return Promise.resolve([]);
  const read = () =>
    window.speechSynthesis.getVoices().map((v) => ({
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      voiceURI: v.voiceURI,
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

/**
 * Speaks `text` and resolves with milliseconds from the tap to the engine's
 * `start` event, or null if speech never started within 5 s.
 */
export function speakAndMeasure(
  text: string,
  voiceURI: string | null,
  eventTimeStamp: number,
): Promise<number | null> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voiceURI ? synth.getVoices().find((v) => v.voiceURI === voiceURI) : undefined;
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    const timer = setTimeout(() => resolve(null), 5000);
    utterance.onstart = () => {
      clearTimeout(timer);
      resolve(performance.now() - eventTimeStamp);
    };
    utterance.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    synth.speak(utterance);
  });
}
