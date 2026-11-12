import { describe, expect, it } from "vitest";
import {
  EMPTY_MESSAGE,
  addWord,
  backspace,
  clearMessage,
  deleteLastWord,
  isEmpty,
  messageText,
  typeCharacter,
  type Message,
} from "../src/core/message";

const type = (message: Message, text: string) =>
  [...text].reduce((current, ch) => typeCharacter(current, ch), message);

describe("message model", () => {
  it("builds a sentence from board words", () => {
    let m = addWord(EMPTY_MESSAGE, "I", "board");
    m = addWord(m, "want", "board");
    m = addWord(m, "more", "board");
    expect(messageText(m)).toBe("I want more");
  });

  it("ignores blank words", () => {
    expect(addWord(EMPTY_MESSAGE, "   ", "board")).toEqual(EMPTY_MESSAGE);
  });

  it("commits a typed word on space and attaches punctuation", () => {
    const m = type(addWord(EMPTY_MESSAGE, "I", "board"), "like pizza!");
    expect(m.tokens.map((t) => t.text)).toEqual(["I", "like", "pizza", "!"]);
    expect(messageText(m)).toBe("I like pizza!");
    expect(m.draft).toBe("");
  });

  it("keeps apostrophes inside words", () => {
    const m = type(EMPTY_MESSAGE, "don't");
    expect(m.draft).toBe("don't");
    expect(messageText(m)).toBe("don't");
  });

  it("includes the unfinished draft when speaking", () => {
    const m = type(addWord(EMPTY_MESSAGE, "go", "board"), "outsi");
    expect(messageText(m)).toBe("go outsi");
  });

  it("commits the draft before a board word is added", () => {
    let m = type(EMPTY_MESSAGE, "Sam");
    m = addWord(m, "help", "board");
    expect(m.tokens.map((t) => [t.text, t.source])).toEqual([
      ["Sam", "keyboard"],
      ["help", "board"],
    ]);
  });

  it("backspace removes a letter, then a whole word", () => {
    let m = type(addWord(EMPTY_MESSAGE, "I", "board"), "go");
    m = backspace(m);
    expect(m.draft).toBe("g");
    m = backspace(backspace(m));
    expect(m.tokens).toHaveLength(0);
  });

  it("delete word removes the draft first, then the last word", () => {
    let m = type(addWord(EMPTY_MESSAGE, "I", "board"), "go");
    m = deleteLastWord(m);
    expect(messageText(m)).toBe("I");
    m = deleteLastWord(m);
    expect(isEmpty(m)).toBe(true);
    expect(deleteLastWord(m)).toBe(m);
  });

  it("clear empties everything", () => {
    expect(isEmpty(clearMessage())).toBe(true);
  });

  it("rejects multi-character input to typeCharacter", () => {
    expect(() => typeCharacter(EMPTY_MESSAGE, "ab")).toThrow(RangeError);
  });
});
