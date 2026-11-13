import { describe, expect, it } from "vitest";
import { demoProfile } from "../src/app/demoData";
import { parseProfile } from "../src/core/profile";

describe("demo student", () => {
  it("is a valid profile with made-up words in empty places and saved sentences", () => {
    const alex = demoProfile();
    expect(parseProfile(JSON.parse(JSON.stringify(alex)))).toEqual(alex);
    expect(alex.added.length).toBeGreaterThanOrEqual(5);
    expect(alex.saved.map((m) => m.text)).toContain("My name is Alex.");
    expect(alex.added.some((w) => w.photoId)).toBe(false); // no real photos in a public demo
  });
});
