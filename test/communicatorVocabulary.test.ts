import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HOME_BOARD,
  HOME_COLS,
  HOME_ROWS,
  KEYBOARD_ABC,
  KEYBOARD_COLS,
  KEYBOARD_QWERTY,
  KEYBOARD_ROWS,
  VOICE_STRIP,
  type Key,
} from "../src/features/communicator/vocabulary";

// Universal Core vocabulary (UNC CLDS), the 36 words.
const UNIVERSAL_CORE = [
  "all",
  "can",
  "different",
  "do",
  "finished",
  "get",
  "go",
  "good",
  "he",
  "help",
  "here",
  "I",
  "in",
  "it",
  "like",
  "look",
  "make",
  "more",
  "not",
  "on",
  "open",
  "put",
  "same",
  "she",
  "some",
  "stop",
  "that",
  "turn",
  "up",
  "want",
  "what",
  "when",
  "where",
  "who",
  "why",
  "you",
];

const symbolFile = (hex: string) => `public/symbols/openmoji/${hex}.svg`;

describe("home board", () => {
  it("contains exactly the 36 Universal Core words", () => {
    expect(HOME_BOARD.map((c) => c.label).sort()).toEqual([...UNIVERSAL_CORE].sort());
  });

  it("gives every word a unique, in-bounds position", () => {
    const seen = new Set<string>();
    for (const cell of HOME_BOARD) {
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(HOME_ROWS);
      expect(cell.col).toBeGreaterThanOrEqual(0);
      expect(cell.col).toBeLessThan(HOME_COLS);
      const spot = `${cell.row},${cell.col}`;
      expect(seen.has(spot), `two words at ${spot}`).toBe(false);
      seen.add(spot);
    }
    expect(new Set(HOME_BOARD.map((c) => c.id)).size).toBe(HOME_BOARD.length);
  });

  it("leaves room to grow without moving words", () => {
    expect(HOME_ROWS * HOME_COLS - HOME_BOARD.length).toBeGreaterThanOrEqual(6);
  });

  // Motor-planning guard: changing a position here is a deliberate decision.
  it("keeps anchor words in their permanent places", () => {
    const at = (label: string) => HOME_BOARD.find((c) => c.label === label);
    expect(at("I")).toMatchObject({ row: 0, col: 0 });
    expect(at("want")).toMatchObject({ row: 0, col: 2 });
    expect(at("more")).toMatchObject({ row: 0, col: 5 });
    expect(at("not")).toMatchObject({ row: 0, col: 6 });
    expect(at("stop")).toMatchObject({ row: 3, col: 4 });
  });

  it("only references symbols that ship with the app", () => {
    for (const item of [...HOME_BOARD, ...VOICE_STRIP]) {
      if (item.symbol) expect(existsSync(symbolFile(item.symbol)), item.symbol).toBe(true);
    }
  });
});

describe("my voice strip", () => {
  it("always offers refusal, agreement and help", () => {
    const labels = VOICE_STRIP.map((p) => p.label);
    expect(labels).toEqual(expect.arrayContaining(["no", "yes", "help me", "stop that"]));
    expect(new Set(VOICE_STRIP.map((p) => p.id)).size).toBe(VOICE_STRIP.length);
  });
});

function occupied(keys: readonly Key[]): Set<string> {
  const cells = new Set<string>();
  for (const key of keys) {
    for (let c = key.col; c < key.col + (key.colSpan ?? 1); c++) {
      const spot = `${key.row},${c}`;
      expect(cells.has(spot), `${key.id} overlaps at ${spot}`).toBe(false);
      expect(key.row).toBeLessThan(KEYBOARD_ROWS);
      expect(c).toBeLessThan(KEYBOARD_COLS);
      cells.add(spot);
    }
  }
  return cells;
}

describe("keyboards", () => {
  for (const [name, keys] of [
    ["qwerty", KEYBOARD_QWERTY],
    ["abc", KEYBOARD_ABC],
  ] as const) {
    it(`${name}: has all 26 letters and no overlapping keys`, () => {
      occupied(keys);
      const letters = keys.filter((k) => k.kind === "char" && /^[a-z]$/.test(k.value ?? ""));
      expect(
        letters
          .map((k) => k.value)
          .sort()
          .join(""),
      ).toBe("abcdefghijklmnopqrstuvwxyz");
    });
  }

  it("puts space, backspace and punctuation in the same place on both layouts", () => {
    const fixed = (keys: readonly Key[]) =>
      keys.filter((k) => k.kind !== "char" || !/^[a-z]$/.test(k.value ?? ""));
    expect(fixed(KEYBOARD_ABC)).toEqual(fixed(KEYBOARD_QWERTY));
  });
});
