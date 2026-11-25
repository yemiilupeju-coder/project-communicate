/**
 * Child-like voices from the device's own voices.
 *
 * Phones and tablets don't ship children's voices, so a "young" voice is an
 * ordinary device voice spoken at a higher pitch. These presets choose a
 * suitable voice and pitch as a starting point; adults then fine-tune the
 * pitch by ear, because every device's voices sound a little different.
 */
import type { VoiceInfo } from "./speech";

export type VoiceGender = "female" | "male";
export type ChildPresetId = "girl" | "boy";

// Common built-in voice names on Apple, Google, Microsoft and Amazon devices.
const FEMALE = new Set(
  "samantha karen moira tessa fiona victoria allison ava susan zoe nicky kate serena martha catherine joanna aria jenny zira hazel linda heera clara sonia libby natasha michelle emma olivia amy salli kimberly ivy kendra nora shelley sandy flo grandma veena isha".split(
    " ",
  ),
);
const MALE = new Set(
  "daniel alex fred tom aaron arthur gordon oliver rishi guy davis david mark george ryan liam matthew justin joey brian russell eddy reed rocko grandpa ralph albert lee".split(
    " ",
  ),
);

/** Best guess from a voice's name; null when the name doesn't say. */
export function guessGender(name: string): VoiceGender | null {
  const lower = name.toLowerCase();
  if (/\bfemale\b/.test(lower)) return "female";
  if (/\bmale\b/.test(lower)) return "male";
  // Chrome's "Google US English" voice is a woman's voice.
  if (/^google us english\b/.test(lower)) return "female";
  const words = lower.split(/[^a-z]+/);
  if (words.some((w) => FEMALE.has(w))) return "female";
  if (words.some((w) => MALE.has(w))) return "male";
  return null;
}

/** Starting pitch for each preset, by the kind of voice it ends up using. */
export const CHILD_PITCH = {
  girl: { female: 1.5, male: 1.8, unknown: 1.5 },
  boy: { male: 1.6, female: 1.25, unknown: 1.4 },
} as const;

export interface VoiceChoice {
  /** null keeps the device's default voice. */
  voiceURI: string | null;
  pitch: number;
}

/**
 * Picks a voice and pitch for a child preset from voices already sorted best
 * first (offline English voices first; see sortVoices). Prefers an English
 * voice of the matching kind; otherwise falls back sensibly.
 */
export function childVoice(preset: ChildPresetId, voices: readonly VoiceInfo[]): VoiceChoice {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;
  const want: VoiceGender = preset === "girl" ? "female" : "male";
  const other: VoiceGender = want === "female" ? "male" : "female";
  const match = pool.find((v) => guessGender(v.name) === want);
  if (match) return { voiceURI: match.voiceURI, pitch: CHILD_PITCH[preset][want] };
  const fallback = pool.find((v) => guessGender(v.name) === other);
  if (fallback) return { voiceURI: fallback.voiceURI, pitch: CHILD_PITCH[preset][other] };
  return { voiceURI: null, pitch: CHILD_PITCH[preset].unknown };
}
