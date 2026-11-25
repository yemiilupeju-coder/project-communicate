import { describe, expect, it } from "vitest";
import { CHILD_PITCH, childVoice, guessGender } from "../src/core/childVoice";
import type { VoiceInfo } from "../src/core/speech";

const v = (name: string, lang = "en-US", localService = true): VoiceInfo => ({
  voiceURI: name,
  name,
  lang,
  localService,
});

describe("child voices", () => {
  it("recognises common device voices", () => {
    expect(guessGender("Samantha")).toBe("female");
    expect(guessGender("Microsoft Aria Online (Natural) - English (United States)")).toBe("female");
    expect(guessGender("Google UK English Female")).toBe("female");
    expect(guessGender("Google UK English Male")).toBe("male");
    expect(guessGender("Google US English")).toBe("female");
    expect(guessGender("Daniel (Enhanced)")).toBe("male");
    expect(guessGender("Microsoft Guy Online (Natural)")).toBe("male");
    expect(guessGender("English United States")).toBeNull();
  });

  it("picks a woman's voice, raised, for a young girl", () => {
    const choice = childVoice("girl", [v("Daniel"), v("Samantha")]);
    expect(choice).toEqual({ voiceURI: "Samantha", pitch: CHILD_PITCH.girl.female });
  });

  it("picks a man's voice, raised, for a young boy", () => {
    const choice = childVoice("boy", [v("Samantha"), v("Daniel")]);
    expect(choice).toEqual({ voiceURI: "Daniel", pitch: CHILD_PITCH.boy.male });
  });

  it("uses the other kind of voice, pitched to suit, when the wanted kind is missing", () => {
    expect(childVoice("boy", [v("Samantha")])).toEqual({
      voiceURI: "Samantha",
      pitch: CHILD_PITCH.boy.female,
    });
  });

  it("prefers English voices and keeps the best-sorted one first", () => {
    const choice = childVoice("girl", [
      v("Amélie", "fr-CA"),
      v("Karen", "en-AU"),
      v("Moira", "en-IE"),
    ]);
    expect(choice.voiceURI).toBe("Karen");
  });

  it("keeps the device default voice when no voice name says what it is", () => {
    expect(childVoice("girl", [v("English United States")])).toEqual({
      voiceURI: null,
      pitch: CHILD_PITCH.girl.unknown,
    });
    expect(childVoice("boy", [])).toEqual({ voiceURI: null, pitch: CHILD_PITCH.boy.unknown });
  });

  it("keeps every preset pitch within the range the settings allow", () => {
    for (const preset of Object.values(CHILD_PITCH))
      for (const pitch of Object.values(preset)) {
        expect(pitch).toBeGreaterThanOrEqual(0.5);
        expect(pitch).toBeLessThanOrEqual(2);
      }
  });
});
