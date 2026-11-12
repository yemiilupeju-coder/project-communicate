/**
 * What a board looks like for one student: the built-in words, minus the ones
 * their team hid, plus the words their team added in empty places.
 */

import type { AddedWord, Profile } from "../../core/profile";
import { TOPIC_SYMBOLS } from "./topicSymbols";
import { TOPICS, TOPIC_COLS, TOPIC_ROWS, withSymbols, type TopicBoard } from "./topics";
import { HOME_BOARD, HOME_COLS, HOME_ROWS, type WordKind } from "./vocabulary";

export interface ShownCell {
  readonly id: string;
  readonly label: string;
  readonly spoken: string;
  readonly kind: WordKind;
  readonly row: number;
  readonly col: number;
  readonly symbol?: string;
  readonly photoId?: string;
  /** Built-in word hidden for this student (only visible in edit mode). */
  readonly hidden: boolean;
  /** Added by the student's team (editable); built-in words can only be hidden. */
  readonly added: boolean;
}

export interface BoardView {
  readonly id: string;
  readonly title: string;
  readonly rows: number;
  readonly cols: number;
  readonly cells: readonly ShownCell[];
}

export const HOME_ID = "home";

export const TOPIC_BOARDS: readonly TopicBoard[] = withSymbols(TOPICS, TOPIC_SYMBOLS);

interface BuiltIn {
  readonly id: string;
  readonly label: string;
  readonly spoken?: string;
  readonly kind: WordKind;
  readonly row: number;
  readonly col: number;
  readonly symbol?: string;
}

function builtIns(
  boardId: string,
): { title: string; rows: number; cols: number; cells: readonly BuiltIn[] } | null {
  if (boardId === HOME_ID)
    return { title: "Words", rows: HOME_ROWS, cols: HOME_COLS, cells: HOME_BOARD };
  const topic = TOPIC_BOARDS.find((t) => t.id === boardId);
  return topic
    ? { title: topic.title, rows: TOPIC_ROWS, cols: TOPIC_COLS, cells: topic.cells }
    : null;
}

/** Places on a board already taken by built-in words (hidden ones included). */
export function builtInPlaces(boardId: string): ReadonlySet<string> {
  return new Set((builtIns(boardId)?.cells ?? []).map((c) => `${c.row},${c.col}`));
}

const fromAdded = (w: AddedWord): ShownCell => ({
  id: w.id,
  label: w.label,
  spoken: w.spoken ?? w.label,
  kind: w.kind,
  row: w.row,
  col: w.col,
  hidden: false,
  added: true,
  ...(w.symbol ? { symbol: w.symbol } : {}),
  ...(w.photoId ? { photoId: w.photoId } : {}),
});

export function boardView(boardId: string, profile: Profile | null): BoardView | null {
  const base = builtIns(boardId);
  if (!base) return null;
  const hidden = new Set(profile?.hidden ?? []);
  const cells: ShownCell[] = base.cells.map((c) => ({
    id: c.id,
    label: c.label,
    spoken: c.spoken ?? c.label,
    kind: c.kind,
    row: c.row,
    col: c.col,
    hidden: hidden.has(c.id),
    added: false,
    ...(c.symbol ? { symbol: c.symbol } : {}),
  }));
  const taken = new Set(builtInPlaces(boardId));
  for (const word of profile?.added ?? []) {
    if (word.boardId !== boardId) continue;
    if (word.row >= base.rows || word.col >= base.cols) continue;
    if (taken.has(`${word.row},${word.col}`)) continue; // never covers a built-in word
    taken.add(`${word.row},${word.col}`);
    cells.push(fromAdded(word));
  }
  return { id: boardId, title: base.title, rows: base.rows, cols: base.cols, cells };
}

export function emptyPlaces(view: BoardView): { row: number; col: number }[] {
  const taken = new Set(view.cells.map((c) => `${c.row},${c.col}`));
  const out: { row: number; col: number }[] = [];
  for (let row = 0; row < view.rows; row++)
    for (let col = 0; col < view.cols; col++)
      if (!taken.has(`${row},${col}`)) out.push({ row, col });
  return out;
}

/** The Topics page: a fixed 3 × 5 grid. Order = TOPICS, then My sentences. */
export const TOPIC_INDEX_ROWS = 3;
export const TOPIC_INDEX_COLS = 5;
export const SENTENCES_ID = "sentences";

export interface Folder {
  readonly id: string;
  readonly title: string;
  readonly symbol: string;
  readonly row: number;
  readonly col: number;
}

export const FOLDERS: readonly Folder[] = [
  ...TOPIC_BOARDS.map((t) => ({ id: t.id, title: t.title, symbol: t.symbol })),
  { id: SENTENCES_ID, title: "My sentences", symbol: "1F4DD" },
].map((f, i) => ({ ...f, row: Math.floor(i / TOPIC_INDEX_COLS), col: i % TOPIC_INDEX_COLS }));
