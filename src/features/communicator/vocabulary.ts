/**
 * Release 1 vocabulary and layouts.
 *
 * Home board: the 36 Universal Core words (Center for Literacy and Disability
 * Studies, UNC Chapel Hill; CC BY 4.0), placed by word type in a fixed 6 × 7
 * grid. Positions are permanent (ADR 0002): new words go into the empty cells
 * or onto topic boards; existing words never move.
 *
 * Symbols: OpenMoji (CC BY-SA 4.0), only where a symbol genuinely helps.
 * Abstract words (it, get, do, all, some, in, on, different) are text only
 * rather than given a misleading picture.
 */

import type { WordKindName } from "../../core/profile";

/** Word type; sets the button colour (Modified Fitzgerald Key) and word endings. */
export type WordKind = WordKindName;

export interface Cell {
  readonly id: string;
  readonly label: string;
  /** What is spoken and added to the message; defaults to the label. */
  readonly spoken?: string;
  readonly kind: WordKind;
  readonly row: number;
  readonly col: number;
  /** OpenMoji hexcode, e.g. "1F44D" → /symbols/openmoji/1F44D.svg */
  readonly symbol?: string;
}

export const HOME_ROWS = 6;
export const HOME_COLS = 7;

const cell = (label: string, kind: WordKind, row: number, col: number, symbol?: string): Cell => ({
  id: `core-${label}`,
  label,
  kind,
  row,
  col,
  ...(symbol ? { symbol } : {}),
});

// prettier-ignore
export const HOME_BOARD: readonly Cell[] = [
  // Column 0: people and pointing
  cell("I", "pronoun", 0, 0, "1F64B"),
  cell("you", "pronoun", 1, 0, "1FAF5"),
  cell("he", "pronoun", 2, 0, "1F468"),
  cell("she", "pronoun", 3, 0, "1F469"),
  cell("it", "pronoun", 4, 0),
  cell("that", "pronoun", 5, 0, "1F449"),
  // Column 1: questions and place
  cell("what", "question", 0, 1, "2753"),
  cell("where", "question", 1, 1, "1F4CD"),
  cell("who", "question", 2, 1, "1F464"),
  cell("when", "question", 3, 1, "1F552"),
  cell("why", "question", 4, 1, "1F914"),
  cell("here", "question", 5, 1, "2B07"),
  // Columns 2–4: actions (empty cells reserved for growth)
  cell("want", "verb", 0, 2, "1F932"),
  cell("get", "verb", 1, 2),
  cell("put", "verb", 2, 2, "1F4E5"),
  cell("do", "verb", 3, 2),
  cell("can", "verb", 4, 2, "1F4AA"),
  cell("like", "verb", 0, 3, "1F44D"),
  cell("make", "verb", 1, 3, "1F528"),
  cell("turn", "verb", 2, 3, "1F504"),
  cell("help", "verb", 3, 3, "1F91D"),
  cell("go", "verb", 0, 4, "1F6B6"),
  cell("look", "verb", 1, 4, "1F440"),
  cell("open", "verb", 2, 4, "1F513"),
  cell("stop", "verb", 3, 4, "270B"),
  // Columns 5–6: describing words
  cell("more", "describer", 0, 5, "2795"),
  cell("all", "describer", 1, 5),
  cell("good", "describer", 2, 5, "2B50"),
  cell("same", "describer", 3, 5, "1F7F0"),
  cell("in", "describer", 4, 5),
  cell("up", "describer", 5, 5, "2B06"),
  cell("not", "describer", 0, 6, "1F6AB"),
  cell("some", "describer", 1, 6),
  cell("different", "describer", 2, 6),
  cell("finished", "describer", 3, 6, "2705"),
  cell("on", "describer", 4, 6),
];

/**
 * "My voice": always on screen. Refusal, protest and being heard come first,
 * reflecting the Communication Bill of Rights (right to refuse, to express
 * feelings, to be responded to).
 */
export interface StripPhrase {
  readonly id: string;
  readonly label: string;
  readonly symbol?: string;
}

// prettier-ignore
export const VOICE_STRIP: readonly StripPhrase[] = [
  { id: "strip-no", label: "no", symbol: "274C" },
  { id: "strip-yes", label: "yes", symbol: "2714" },
  { id: "strip-stop-that", label: "stop that", symbol: "270B" },
  { id: "strip-dont-like", label: "I don't like that", symbol: "1F44E" },
  { id: "strip-wait", label: "wait, I'm talking", symbol: "1F5E3" },
  { id: "strip-help-me", label: "help me", symbol: "1F91D" },
  { id: "strip-break", label: "I need a break", symbol: "23F8" },
];

export type KeyKind = "char" | "space" | "backspace";

export interface Key {
  readonly id: string;
  readonly label: string;
  readonly kind: KeyKind;
  /** The character typed (for "char" keys). */
  readonly value?: string;
  readonly row: number;
  readonly col: number;
  readonly colSpan?: number;
}

export const KEYBOARD_ROWS = 4;
export const KEYBOARD_COLS = 10;

function lettersToKeys(rows: readonly string[]): Key[] {
  const keys: Key[] = [];
  rows.forEach((letters, row) => {
    [...letters].forEach((letter, col) => {
      keys.push({ id: `key-${letter}`, label: letter, kind: "char", value: letter, row, col });
    });
  });
  return keys;
}

function commonKeys(): Key[] {
  return [
    { id: "key-backspace", label: "⌫", kind: "backspace", row: 1, col: 9 },
    { id: "key-comma", label: ",", kind: "char", value: ",", row: 2, col: 7 },
    { id: "key-period", label: ".", kind: "char", value: ".", row: 2, col: 8 },
    { id: "key-question", label: "?", kind: "char", value: "?", row: 2, col: 9 },
    { id: "key-space", label: "space", kind: "space", row: 3, col: 0, colSpan: 7 },
    { id: "key-apostrophe", label: "'", kind: "char", value: "'", row: 3, col: 7 },
    { id: "key-exclaim", label: "!", kind: "char", value: "!", row: 3, col: 8 },
  ];
}

export const KEYBOARD_QWERTY: readonly Key[] = [
  ...lettersToKeys(["qwertyuiop", "asdfghjkl", "zxcvbnm"]),
  ...commonKeys(),
];

export const KEYBOARD_ABC: readonly Key[] = [
  ...lettersToKeys(["abcdefghij", "klmnopqrs", "tuvwxyz"]),
  ...commonKeys(),
];

export function symbolUrl(hexcode: string): string {
  return `${import.meta.env.BASE_URL}symbols/openmoji/${hexcode}.svg`;
}

export const ATTRIBUTIONS = [
  {
    work: "Universal Core vocabulary",
    by: "Center for Literacy and Disability Studies, University of North Carolina at Chapel Hill",
    license: "CC BY 4.0",
    url: "https://www.med.unc.edu/ahs/clds/universal-core-vocabulary/",
  },
  {
    work: "OpenMoji symbols",
    by: "OpenMoji (HfG Schwäbisch Gmünd)",
    license: "CC BY-SA 4.0",
    url: "https://openmoji.org/",
  },
] as const;
