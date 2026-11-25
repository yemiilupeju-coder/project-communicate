/**
 * Everything the built-in vocabulary can say: each word and phrase as it is
 * spoken, plus the other forms a student can pick (goes, went, apples, mine…).
 *
 * The voice packs (ADR 0004, "voice as data") hold one clip for each of these,
 * and a test checks every one has a clip, so a new word can't ship silent.
 */

import { wordForms, type FormKind } from "../../core/morphology";
import { TOPIC_BOARDS } from "./boards";
import { HOME_BOARD, VOICE_STRIP, type WordKind } from "./vocabulary";

/** Played when an adult chooses a voice in the adult menu. */
export const VOICE_SAMPLE = "Hi! This is my voice.";

function formKindOf(kind: WordKind): FormKind | null {
  return kind === "verb" || kind === "noun" || kind === "describer" || kind === "pronoun"
    ? kind
    : null;
}

/** What these words say: each word as spoken, and the forms a student can pick. */
export function wordTexts(
  words: readonly { label: string; spoken?: string; kind: WordKind }[],
): string[] {
  const out: string[] = [];
  for (const word of words) {
    const text = word.spoken?.trim() || word.label;
    out.push(text);
    const kind = formKindOf(word.kind);
    if (kind) for (const form of wordForms(text, kind)) out.push(form.text);
  }
  return out;
}

export function speakableTexts(): string[] {
  return [
    VOICE_SAMPLE,
    ...wordTexts([...HOME_BOARD, ...TOPIC_BOARDS.flatMap((board) => board.cells)]),
    ...VOICE_STRIP.map((phrase) => phrase.label),
  ];
}
