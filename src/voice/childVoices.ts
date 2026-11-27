/**
 * The girl's and boy's voices (ADR 0012). Kokoro generates each one from an
 * untouched style, with the child's pitch set inside the model (its pitch
 * inputs); then one even formant lift makes the vocal tract sound smaller
 * without bending vowels or losing the American "r"; then trim, fades and
 * loudness. The build script and devices both use these, so every clip
 * matches. Chosen by TD, Nov 27, 2026, from the voice clarity R&D
 * (research/voice-clarity); the earlier style-space move (ADR 0011) bent
 * vowels and weakened consonants.
 */

import type { VoicePackId } from "../core/voicePack";
import { envelopeLift } from "./envelopeLift";
import type { Lexicon } from "./g2p";
import { synthesize, SAMPLE_RATE, type KokoroInputs, type KokoroRun } from "./kokoro";
import { finish } from "./reshape";

export interface ChildVoice {
  /** The style table, named by its content (made by research/child-voice/export_voices_v2.py). */
  readonly table: string;
  readonly inputs: KokoroInputs;
  /** How much higher the formants sit after the even lift (1.07 = 7%). */
  readonly lift: number;
  /** How it was made, for the record. */
  readonly from: { readonly timbre: string; readonly prosody: string };
}

export const CHILD_VOICES: Readonly<Record<VoicePackId, ChildVoice>> = {
  // af_heart (Kokoro's best-graded voice) as it is: pitch about 262 Hz,
  // intonation 10% livelier, formants 7% higher.
  girl: {
    table: "voice-model/child-girl-8f2d0ce5.bin",
    inputs: { speed: 0.9, f0Scale: 1.41232, f0Range: 1.1, f0Ref: 185.51022 },
    lift: 1.07,
    from: { timbre: "af_heart", prosody: "af_heart" },
  },
  // af_heart's clear timbre with am_puck's delivery (rhythm, intonation):
  // pitch about 244 Hz, formants 4% higher, a little below the girl's.
  boy: {
    table: "voice-model/child-boy-f14368ce.bin",
    inputs: { speed: 0.9, f0Scale: 2.10049, f0Range: 1, f0Ref: 116.16351 },
    lift: 1.04,
    from: { timbre: "af_heart", prosody: "am_puck" },
  },
};

/**
 * Change this when the model, voices, pronunciation or processing change, so
 * saved clips are made again.
 */
export const VOICE_VERSION = "k82m-int8-f0-lift-misaki-r6";

export async function renderChildVoice(
  run: KokoroRun,
  voiceTable: Float32Array,
  lexicon: Lexicon,
  id: VoicePackId,
  text: string,
): Promise<Float32Array> {
  const voice = CHILD_VOICES[id];
  const raw = await synthesize(run, voiceTable, lexicon, text, voice.inputs);
  if (raw.length === 0) return raw;
  // Raise the formants evenly, then trim, fade the ends and set every clip to
  // the same loudness. Nothing else.
  return finish(envelopeLift(raw, SAMPLE_RATE, voice.lift), SAMPLE_RATE);
}
