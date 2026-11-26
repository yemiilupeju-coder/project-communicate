/**
 * Voice packs: the built-in vocabulary pre-rendered as clips in a child's
 * voice (ADR 0004). Pure helpers here; playback is in clipPlayer.ts.
 */

export type VoicePackId = "girl" | "boy";
export const VOICE_PACK_IDS: readonly VoicePackId[] = ["girl", "boy"];

/** byte offset and length of one clip inside a pack's audio file */
export type ClipIndex = Readonly<Record<string, readonly [number, number]>>;

/** The lookup key for a phrase: lower case, words only, apostrophes kept. */
export function clipKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** How a sentence ends, which changes how it is said ("you're done." / "you're done?"). */
function ending(text: string): "" | "?" | "!" {
  const last = text.trim().slice(-1);
  return last === "?" ? "?" : last === "!" ? "!" : "";
}

/**
 * Key for a whole sentence said in one go (made on the device), kept apart
 * from word keys.
 */
export function sentenceKey(text: string): string {
  return `sentence:${clipKey(text)}${ending(text)}`;
}

/** The text the voice maker says for a sentence: ends with a full stop if it has no ending. */
export function sentenceText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Splits a message into the longest phrases that have clips, so "I need a
 * break" plays as one natural phrase and "I want more snack" as four words.
 * Returns null when any word has no clip: then the whole message uses the
 * device voice, rather than switching voices halfway through.
 */
export function planClips(
  has: (key: string) => boolean,
  text: string,
  longest = 6,
): string[] | null {
  const whole = clipKey(text);
  if (whole.length === 0) return null;
  if (has(whole)) return [whole];
  const words = whole.split(" ");
  const plan: string[] = [];
  for (let i = 0; i < words.length;) {
    let taken = 0;
    for (let n = Math.min(longest, words.length - i); n >= 1; n--) {
      const key = words.slice(i, i + n).join(" ");
      if (has(key)) {
        plan.push(key);
        taken = n;
        break;
      }
    }
    if (taken === 0) return null;
    i += taken;
  }
  return plan;
}

/** The words of a message as they should be spoken one at a time (punctuation removed). */
export function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ""))
    .filter((word) => clipKey(word).length > 0);
}
