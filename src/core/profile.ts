/**
 * A student profile: their name (or a pseudonym), their settings, and how
 * their team has personalised the boards. Release 2.
 *
 * Personalisation never moves a released word (ADR 0002): adults can only
 * hide a word (its place stays empty) or add a word in an empty place.
 */

import { DEFAULT_SETTINGS, parseSettings, type Settings } from "./settings";

export type WordKindName =
  "pronoun" | "question" | "verb" | "describer" | "social" | "noun" | "little";

const KINDS: readonly WordKindName[] = [
  "pronoun",
  "question",
  "verb",
  "describer",
  "social",
  "noun",
  "little",
];

export interface AddedWord {
  readonly id: string;
  /** "home" or a topic board id. */
  readonly boardId: string;
  readonly row: number;
  readonly col: number;
  readonly label: string;
  readonly spoken?: string;
  readonly kind: WordKindName;
  /** OpenMoji hexcode from the shipped set. */
  readonly symbol?: string;
  /** Key of a photo in the media store. */
  readonly photoId?: string;
}

export interface SavedMessage {
  readonly id: string;
  readonly text: string;
  readonly createdAt: number;
}

export interface Profile {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly settings: Settings;
  /** Ids of built-in words hidden for this student. */
  readonly hidden: readonly string[];
  readonly added: readonly AddedWord[];
  readonly saved: readonly SavedMessage[];
}

export const MAX_NAME = 40;
export const MAX_LABEL = 40;
export const MAX_SPOKEN = 200;
export const MAX_SAVED = 100;
export const MAX_ADDED = 500;

export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function newProfile(name: string, settings: Settings = DEFAULT_SETTINGS): Profile {
  return {
    version: 1,
    id: newId("p"),
    name: cleanText(name, MAX_NAME) || "Student",
    createdAt: Date.now(),
    settings,
    hidden: [],
    added: [],
    saved: [],
  };
}

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Strip control characters; keep everything a person could type.
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9-]{1,80}$/i.test(v);

const isIndex = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < max;

function parseAdded(raw: unknown, rows: number, cols: number): AddedWord | null {
  if (!isRecord(raw)) return null;
  const label = cleanText(raw.label, MAX_LABEL);
  if (!isId(raw.id) || !isId(raw.boardId) || label.length === 0) return null;
  if (!isIndex(raw.row, rows) || !isIndex(raw.col, cols)) return null;
  const kind = KINDS.includes(raw.kind as WordKindName) ? (raw.kind as WordKindName) : "noun";
  const spoken = cleanText(raw.spoken, MAX_SPOKEN);
  const symbol =
    typeof raw.symbol === "string" && /^[0-9A-F-]{2,40}$/.test(raw.symbol) ? raw.symbol : "";
  const photoId = isId(raw.photoId) ? raw.photoId : "";
  return {
    id: raw.id,
    boardId: raw.boardId,
    row: raw.row,
    col: raw.col,
    label,
    kind,
    ...(spoken && spoken !== label ? { spoken } : {}),
    ...(symbol ? { symbol } : {}),
    ...(photoId ? { photoId } : {}),
  };
}

/**
 * Builds a valid profile from untrusted input (storage or a backup file).
 * Returns null if it can't be identified as a profile. Bad parts are dropped,
 * and two added words never share a place.
 */
export function parseProfile(raw: unknown, rows = 6, cols = 7): Profile | null {
  if (!isRecord(raw) || raw.version !== 1 || !isId(raw.id)) return null;
  const name = cleanText(raw.name, MAX_NAME) || "Student";
  const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : Date.now();
  const hidden = Array.isArray(raw.hidden) ? [...new Set(raw.hidden.filter(isId))] : [];
  const taken = new Set<string>();
  const added: AddedWord[] = [];
  for (const item of Array.isArray(raw.added) ? raw.added.slice(0, MAX_ADDED) : []) {
    const word = parseAdded(item, rows, cols);
    if (!word) continue;
    const spot = `${word.boardId}:${word.row},${word.col}`;
    if (taken.has(spot)) continue;
    taken.add(spot);
    added.push(word);
  }
  const saved: SavedMessage[] = [];
  for (const item of Array.isArray(raw.saved) ? raw.saved.slice(0, MAX_SAVED) : []) {
    if (!isRecord(item) || !isId(item.id)) continue;
    const text = cleanText(item.text, MAX_SPOKEN);
    if (!text) continue;
    saved.push({
      id: item.id,
      text,
      createdAt: typeof item.createdAt === "number" ? item.createdAt : 0,
    });
  }
  return {
    version: 1,
    id: raw.id,
    name,
    createdAt,
    settings: parseSettings(raw.settings),
    hidden,
    added,
    saved,
  };
}

// ── Edits (pure, so the rules are tested) ────────────────────────────────────

export function toggleHidden(profile: Profile, cellId: string): Profile {
  const hidden = profile.hidden.includes(cellId)
    ? profile.hidden.filter((id) => id !== cellId)
    : [...profile.hidden, cellId];
  return { ...profile, hidden };
}

export class PlaceTakenError extends Error {}

/**
 * Adds a word in an empty place. `occupied` is every place on that board that
 * already holds a built-in word (hidden or not) — hidden words keep their place.
 */
export function addWordAt(
  profile: Profile,
  word: Omit<AddedWord, "id">,
  occupied: ReadonlySet<string>,
): Profile {
  const spot = `${word.row},${word.col}`;
  const clash =
    occupied.has(spot) ||
    profile.added.some(
      (w) => w.boardId === word.boardId && w.row === word.row && w.col === word.col,
    );
  if (clash) throw new PlaceTakenError(`Place ${spot} on ${word.boardId} is taken`);
  const label = cleanText(word.label, MAX_LABEL);
  if (!label) throw new RangeError("A word needs a label");
  const spoken = cleanText(word.spoken, MAX_SPOKEN);
  const added: AddedWord = {
    id: newId("w"),
    boardId: word.boardId,
    row: word.row,
    col: word.col,
    label,
    kind: word.kind,
    ...(spoken && spoken !== label ? { spoken } : {}),
    ...(word.symbol ? { symbol: word.symbol } : {}),
    ...(word.photoId ? { photoId: word.photoId } : {}),
  };
  return { ...profile, added: [...profile.added, added] };
}

export function updateAddedWord(
  profile: Profile,
  id: string,
  change: Pick<AddedWord, "label" | "kind"> &
    Partial<Pick<AddedWord, "spoken" | "symbol" | "photoId">>,
): Profile {
  return {
    ...profile,
    added: profile.added.map((w) => {
      if (w.id !== id) return w;
      const label = cleanText(change.label, MAX_LABEL) || w.label;
      const spoken = cleanText(change.spoken, MAX_SPOKEN);
      const next: AddedWord = {
        id: w.id,
        boardId: w.boardId,
        row: w.row,
        col: w.col,
        label,
        kind: change.kind,
        ...(spoken && spoken !== label ? { spoken } : {}),
        ...(change.symbol ? { symbol: change.symbol } : {}),
        ...(change.photoId ? { photoId: change.photoId } : {}),
      };
      return next;
    }),
  };
}

export function removeAddedWord(profile: Profile, id: string): Profile {
  return { ...profile, added: profile.added.filter((w) => w.id !== id) };
}

export function saveMessage(profile: Profile, text: string, now = Date.now()): Profile {
  const clean = cleanText(text, MAX_SPOKEN);
  if (!clean || profile.saved.some((m) => m.text === clean)) return profile;
  const saved = [{ id: newId("m"), text: clean, createdAt: now }, ...profile.saved];
  return { ...profile, saved: saved.slice(0, MAX_SAVED) };
}

export function removeSavedMessage(profile: Profile, id: string): Profile {
  return { ...profile, saved: profile.saved.filter((m) => m.id !== id) };
}
