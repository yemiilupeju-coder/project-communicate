import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clipKey, planClips, VOICE_PACK_IDS, wordsOf, type ClipIndex } from "../src/core/voicePack";
import { VOICE_PACK_FILES } from "../src/core/voicePacks.generated";
import { speakableTexts, VOICE_SAMPLE } from "../src/features/communicator/speakable";

const index = (...keys: string[]) => {
  const set = new Set(keys);
  return (key: string) => set.has(key);
};

describe("voice pack lookups", () => {
  it("keys phrases by their words, ignoring case and punctuation", () => {
    expect(clipKey("Hi! This is my voice.")).toBe("hi this is my voice");
    expect(clipKey("wait, I’m talking")).toBe("wait i'm talking");
    expect(clipKey("  I   want ")).toBe("i want");
  });

  it("plays a known phrase as one clip", () => {
    expect(planClips(index("i need a break", "i", "need"), "I need a break")).toEqual([
      "i need a break",
    ]);
  });

  it("builds a sentence from the longest phrases that have clips", () => {
    const idx = index("i", "want", "more", "snack", "help me");
    expect(planClips(idx, "I want more snack")).toEqual(["i", "want", "more", "snack"]);
    expect(planClips(idx, "help me I want more")).toEqual(["help me", "i", "want", "more"]);
  });

  it("splits a message into words to make, without punctuation", () => {
    expect(wordsOf("Biscuit, come here!")).toEqual(["Biscuit", "come", "here"]);
    expect(wordsOf("  I'm  ... ok ")).toEqual(["I'm", "ok"]);
  });

  it("gives up (so the device voice says it all) when a word has no clip", () => {
    expect(planClips(index("i", "want"), "I want Biscuit")).toBeNull();
    expect(planClips(index("i"), "   ")).toBeNull();
  });
});

describe("the voice packs in the app", () => {
  const packs = VOICE_PACK_IDS.map((id) => {
    const files = VOICE_PACK_FILES[id];
    const indexPath = new URL(`../public/${files.index}`, import.meta.url);
    const audioPath = new URL(`../public/${files.audio}`, import.meta.url);
    return { id, files, indexPath, audioPath };
  });

  it("exist on disk as listed", () => {
    for (const pack of packs) {
      expect(existsSync(pack.indexPath), `${pack.id} index`).toBe(true);
      expect(existsSync(pack.audioPath), `${pack.id} audio`).toBe(true);
    }
  });

  it("have a clip for every built-in word, phrase and word form", () => {
    const needed = [...new Set(speakableTexts().map(clipKey))];
    expect(needed).toContain(clipKey(VOICE_SAMPLE));
    for (const pack of packs) {
      const idx = JSON.parse(readFileSync(pack.indexPath, "utf8")) as ClipIndex;
      const missing = needed.filter((key) => !idx[key]);
      expect(
        missing,
        `${pack.id} voice is missing clips. Run: npm run voices:texts && python -I scripts/voices/render.py`,
      ).toEqual([]);
      const size = readFileSync(pack.audioPath).length;
      for (const [offset, length] of Object.values(idx))
        expect(offset + length).toBeLessThanOrEqual(size);
    }
  });
});
