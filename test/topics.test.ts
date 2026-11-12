import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FOLDERS,
  TOPIC_BOARDS,
  TOPIC_INDEX_COLS,
  TOPIC_INDEX_ROWS,
} from "../src/features/communicator/boards";
import { TOPIC_COLS, TOPIC_ROWS } from "../src/features/communicator/topics";
import { SYMBOL_NAMES, TOPIC_SYMBOLS } from "../src/features/communicator/topicSymbols";

const lock = JSON.parse(readFileSync("test/vocabulary.lock.json", "utf8")) as {
  boards: Record<string, Record<string, [number, number]>>;
  folders: Record<string, [number, number]>;
};

describe("topic boards", () => {
  it("every word has a unique id and a unique, in-bounds place", () => {
    const ids = new Set<string>();
    for (const board of TOPIC_BOARDS) {
      const places = new Set<string>();
      for (const cell of board.cells) {
        expect(ids.has(cell.id), cell.id).toBe(false);
        ids.add(cell.id);
        expect(cell.row).toBeLessThan(TOPIC_ROWS);
        expect(cell.col).toBeLessThan(TOPIC_COLS);
        const spot = `${cell.row},${cell.col}`;
        expect(places.has(spot), `${board.id} ${spot}`).toBe(false);
        places.add(spot);
      }
    }
  });

  // Motor planning (ADR 0002): a released word never moves or disappears.
  it("no released word has moved", () => {
    for (const [boardId, cells] of Object.entries(lock.boards)) {
      const board = TOPIC_BOARDS.find((b) => b.id === boardId);
      expect(board, boardId).toBeDefined();
      for (const [id, [row, col]] of Object.entries(cells)) {
        const cell = board!.cells.find((c) => c.id === id);
        expect(cell, `${id} was removed`).toBeDefined();
        expect([cell!.row, cell!.col], `${id} moved`).toEqual([row, col]);
      }
    }
    for (const [id, [row, col]] of Object.entries(lock.folders)) {
      const folder = FOLDERS.find((f) => f.id === id);
      expect([folder?.row, folder?.col], `folder ${id} moved`).toEqual([row, col]);
    }
  });

  it("leaves room on personal pages for the student's own words", () => {
    for (const id of ["people", "places", "food", "play"]) {
      const board = TOPIC_BOARDS.find((b) => b.id === id)!;
      expect(TOPIC_ROWS * TOPIC_COLS - board.cells.length, id).toBeGreaterThanOrEqual(7);
    }
  });

  it("includes the words students need to stay safe and well", () => {
    const body = TOPIC_BOARDS.find((b) => b.id === "body")!.cells.map((c) => c.label);
    expect(body).toEqual(
      expect.arrayContaining([
        "hurt",
        "sick",
        "bathroom",
        "pain",
        "don't touch",
        "not safe",
        "tell",
        "private",
      ]),
    );
  });

  it("fits every folder on the Topics page", () => {
    expect(FOLDERS.length).toBeLessThanOrEqual(TOPIC_INDEX_ROWS * TOPIC_INDEX_COLS);
    expect(FOLDERS.map((f) => f.id)).toContain("sentences");
  });

  it("only uses symbols that ship with the app, and lists them for the picker", () => {
    const used = [...Object.values(TOPIC_SYMBOLS), ...FOLDERS.map((f) => f.symbol)];
    for (const hex of used) {
      expect(existsSync(`public/symbols/openmoji/${hex}.svg`), hex).toBe(true);
      expect(SYMBOL_NAMES[hex], hex).toBeDefined();
    }
    for (const hex of Object.keys(SYMBOL_NAMES)) {
      expect(existsSync(`public/symbols/openmoji/${hex}.svg`), hex).toBe(true);
    }
  });

  it("gives private body words no picture", () => {
    for (const id of ["body-penis", "body-vulva", "body-bottom", "body-chest"]) {
      expect(TOPIC_SYMBOLS[id], id).toBeUndefined();
    }
  });
});
