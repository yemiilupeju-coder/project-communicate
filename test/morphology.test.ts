import { describe, expect, it } from "vitest";
import { pluralOf, wordForms } from "../src/core/morphology";

const texts = (word: string, kind: Parameters<typeof wordForms>[1]) =>
  wordForms(word, kind).map((f) => f.text);

describe("word endings", () => {
  it("offers irregular verb forms as whole words", () => {
    expect(texts("go", "verb")).toEqual(["goes", "going", "went", "gone"]);
    expect(texts("eat", "verb")).toEqual(["eats", "eating", "ate", "eaten"]);
    expect(texts("make", "verb")).toEqual(["makes", "making", "made"]);
  });

  it("follows English spelling rules for regular verbs", () => {
    expect(texts("stop", "verb")).toEqual(["stops", "stopping", "stopped"]);
    expect(texts("like", "verb")).toEqual(["likes", "liking", "liked"]);
    expect(texts("try", "verb")).toEqual(["tries", "trying", "tried"]);
    expect(texts("play", "verb")).toEqual(["plays", "playing", "played"]);
    expect(texts("open", "verb")).toEqual(["opens", "opening", "opened"]);
    expect(texts("wash", "verb")).toEqual(["washes", "washing", "washed"]);
    expect(texts("fix", "verb")).toEqual(["fixes", "fixing", "fixed"]);
    expect(texts("help", "verb")).toEqual(["helps", "helping", "helped"]);
  });

  it("handles be and can", () => {
    expect(texts("is", "verb")).toEqual(["am", "are", "was", "were", "be", "been", "being"]);
    expect(texts("can", "verb")).toEqual(["could", "can't"]);
  });

  it("makes plurals and possessives for nouns", () => {
    expect(texts("dog", "noun")).toEqual(["dogs", "dog's"]);
    expect(texts("bus", "noun")).toEqual(["buses", "bus's"]);
    expect(texts("baby", "noun")).toEqual(["babies", "baby's"]);
    expect(texts("tooth", "noun")).toEqual(["teeth", "tooth's"]);
    expect(pluralOf("Child")).toBe("Children");
    expect(texts("Maya", "noun")).toEqual(["Mayas", "Maya's"]);
  });

  it("compares describing words, regular and irregular", () => {
    expect(texts("big", "describer")).toEqual(["bigger", "biggest"]);
    expect(texts("funny", "describer")).toEqual(["funnier", "funniest"]);
    expect(texts("nice", "describer")).toEqual(["nicer", "nicest"]);
    expect(texts("good", "describer")).toEqual(["better", "best"]);
    expect(texts("bad", "describer")).toEqual(["worse", "worst"]);
    expect(texts("different", "describer")).toEqual([]);
  });

  it("offers pronoun forms", () => {
    expect(texts("I", "pronoun")).toEqual(["me", "my", "mine", "myself"]);
    expect(texts("they", "pronoun")).toEqual(["them", "their", "theirs"]);
  });

  it("offers every common ending for typed words", () => {
    const forms = texts("jump", "unknown");
    expect(forms).toEqual(expect.arrayContaining(["jumps", "jumping", "jumped", "jump's"]));
  });

  it("offers only the possessive for multi-word names", () => {
    expect(texts("Ms. Patel", "noun")).toEqual(["Ms. Patel's"]);
  });

  it("never offers forms for phrases or blanks", () => {
    expect(wordForms("thank you", "unknown")).toEqual([]);
    expect(wordForms("  ", "verb")).toEqual([]);
  });
});
