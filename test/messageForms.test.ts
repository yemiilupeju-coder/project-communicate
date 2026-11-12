import { describe, expect, it } from "vitest";
import {
  EMPTY_MESSAGE,
  addWord,
  lastWord,
  messageText,
  replaceLastWord,
  typeCharacter,
} from "../src/core/message";

describe("changing the last word's ending", () => {
  it("replaces only the last word and keeps its kind", () => {
    let m = addWord(EMPTY_MESSAGE, "I", "board", "pronoun");
    m = addWord(m, "go", "board", "verb");
    expect(lastWord(m)).toMatchObject({ text: "go", kind: "verb" });
    m = replaceLastWord(m, "went");
    expect(messageText(m)).toBe("I went");
    expect(m.tokens.at(-1)).toMatchObject({ text: "went", kind: "verb", source: "board" });
  });

  it("works on an unfinished typed word", () => {
    const m = [..."jump"].reduce((acc, c) => typeCharacter(acc, c), EMPTY_MESSAGE);
    expect(lastWord(m)?.text).toBe("jump");
    const changed = replaceLastWord(m, "jumping");
    expect(changed.draft).toBe("");
    expect(messageText(changed)).toBe("jumping");
  });

  it("ignores punctuation and empty messages", () => {
    const m = typeCharacter(addWord(EMPTY_MESSAGE, "go", "board", "verb"), "?");
    expect(lastWord(m)).toBeNull();
    expect(replaceLastWord(m, "went")).toBe(m);
    expect(lastWord(EMPTY_MESSAGE)).toBeNull();
  });
});
