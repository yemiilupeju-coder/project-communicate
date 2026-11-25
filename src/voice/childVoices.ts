/**
 * The girl's and boy's voices: which Kokoro voice each starts from and how it
 * is reshaped into a child's (chosen by TD from listening samples, Nov 25, 2026).
 * The build script and devices both use these, so every clip matches.
 */

import type { VoicePackId } from "../core/voicePack";
import type { Lexicon } from "./g2p";
import { synthesize, SAMPLE_RATE, type KokoroRun } from "./kokoro";
import { finish, reshape, type ReshapeSettings } from "./reshape";

export const CHILD_VOICES: Readonly<
  Record<VoicePackId, { kokoro: string; reshape: ReshapeSettings }>
> = {
  girl: { kokoro: "af_bella", reshape: { formant: 1.16, median: 285, range: 1.3, duration: 1.06 } },
  boy: {
    kokoro: "am_michael",
    reshape: { formant: 1.3, median: 255, range: 1.25, duration: 1.06 },
  },
};

/**
 * Change this when the model, voices, pronunciation or reshaping change, so
 * saved clips are made again.
 */
export const VOICE_VERSION = "k82m-int8-misaki-r1";

export async function renderChildVoice(
  run: KokoroRun,
  voiceTable: Float32Array,
  lexicon: Lexicon,
  id: VoicePackId,
  text: string,
): Promise<Float32Array> {
  const raw = await synthesize(run, voiceTable, lexicon, text);
  if (raw.length === 0) return raw;
  return finish(reshape(raw, SAMPLE_RATE, CHILD_VOICES[id].reshape), SAMPLE_RATE);
}
