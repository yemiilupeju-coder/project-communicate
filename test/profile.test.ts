import { describe, expect, it } from "vitest";
import {
  PlaceTakenError,
  addWordAt,
  newProfile,
  parseProfile,
  removeAddedWord,
  saveMessage,
  toggleHidden,
  updateAddedWord,
} from "../src/core/profile";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { boardView, builtInPlaces, emptyPlaces } from "../src/features/communicator/boards";

describe("student profiles", () => {
  it("starts empty and named", () => {
    const p = newProfile("  Sam  ");
    expect(p.name).toBe("Sam");
    expect(p.settings).toEqual(DEFAULT_SETTINGS);
    expect(newProfile("").name).toBe("Student");
  });

  it("adds a word only in an empty place, never over a built-in word", () => {
    const p = newProfile("Sam");
    const taken = builtInPlaces("home");
    expect(() =>
      addWordAt(p, { boardId: "home", row: 0, col: 0, label: "Max", kind: "noun" }, taken),
    ).toThrow(PlaceTakenError);
    const withWord = addWordAt(
      p,
      { boardId: "home", row: 4, col: 3, label: "Max", kind: "noun" },
      taken,
    );
    expect(withWord.added).toHaveLength(1);
    expect(() =>
      addWordAt(withWord, { boardId: "home", row: 4, col: 3, label: "Ava", kind: "noun" }, taken),
    ).toThrow(PlaceTakenError);
  });

  it("hiding keeps the word's place, so nothing else moves", () => {
    const p = toggleHidden(newProfile("Sam"), "core-want");
    const view = boardView("home", p);
    const want = view?.cells.find((c) => c.id === "core-want");
    expect(want).toMatchObject({ hidden: true, row: 0, col: 2 });
    expect(() =>
      addWordAt(
        p,
        { boardId: "home", row: 0, col: 2, label: "x", kind: "noun" },
        builtInPlaces("home"),
      ),
    ).toThrow(PlaceTakenError);
    expect(toggleHidden(p, "core-want").hidden).toEqual([]);
  });

  it("shows added words on their board and fills empty places", () => {
    let p = newProfile("Sam");
    const before = emptyPlaces(boardView("people", p)!).length;
    p = addWordAt(
      p,
      { boardId: "people", row: 3, col: 0, label: "Ms. Patel", kind: "noun" },
      builtInPlaces("people"),
    );
    const view = boardView("people", p)!;
    expect(view.cells.find((c) => c.label === "Ms. Patel")).toMatchObject({ added: true });
    expect(emptyPlaces(view)).toHaveLength(before - 1);
  });

  it("edits and removes added words", () => {
    let p = addWordAt(
      newProfile("Sam"),
      { boardId: "food", row: 5, col: 0, label: "jollof", kind: "noun" },
      builtInPlaces("food"),
    );
    const id = p.added[0]!.id;
    p = updateAddedWord(p, id, {
      label: "jollof rice",
      kind: "noun",
      spoken: "jollof rice please",
    });
    expect(p.added[0]).toMatchObject({
      label: "jollof rice",
      spoken: "jollof rice please",
      row: 5,
      col: 0,
    });
    expect(removeAddedWord(p, id).added).toEqual([]);
  });

  it("saves sentences once each, newest first", () => {
    let p = saveMessage(newProfile("Sam"), "I want to go outside", 1);
    p = saveMessage(p, "my name is Sam", 2);
    p = saveMessage(p, "I want to go outside", 3);
    expect(p.saved.map((m) => m.text)).toEqual(["my name is Sam", "I want to go outside"]);
  });

  it("rebuilds a valid profile from untrusted data", () => {
    const good = newProfile("Sam");
    expect(parseProfile(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(parseProfile({ version: 2, id: "x" })).toBeNull();
    expect(parseProfile("nope")).toBeNull();
    const messy = parseProfile({
      version: 1,
      id: "p-1",
      name: "A\u0000very long name that goes on and on beyond forty characters",
      settings: { rate: 99 },
      hidden: ["core-go", "core-go", 5, "bad id!"],
      added: [
        { id: "w-1", boardId: "home", row: 4, col: 3, label: "Max", kind: "noun" },
        { id: "w-2", boardId: "home", row: 4, col: 3, label: "Same place", kind: "noun" },
        { id: "w-3", boardId: "home", row: 99, col: 0, label: "Off grid", kind: "noun" },
        { id: "w-4", boardId: "home", row: 4, col: 4, label: "", kind: "noun" },
        { id: "w-5", boardId: "home", row: 5, col: 2, label: "Odd", kind: "weird" },
      ],
      saved: [
        { id: "m-1", text: "hello", createdAt: 1 },
        { id: "m-2", text: "" },
      ],
    })!;
    expect(messy.name.length).toBeLessThanOrEqual(40);
    expect(messy.name).not.toContain("\u0000");
    expect(messy.settings.rate).toBe(1.5);
    expect(messy.hidden).toEqual(["core-go"]);
    expect(messy.added.map((w) => w.id)).toEqual(["w-1", "w-5"]);
    expect(messy.added[1]?.kind).toBe("noun");
    expect(messy.saved.map((m) => m.text)).toEqual(["hello"]);
  });
});
