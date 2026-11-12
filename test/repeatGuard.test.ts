import { describe, expect, it } from "vitest";
import { RepeatGuard } from "../src/core/repeatGuard";

describe("RepeatGuard", () => {
  it("blocks a second tap on the same button inside the window", () => {
    const guard = new RepeatGuard(300);
    expect(guard.allow("more", 1000)).toBe(true);
    expect(guard.allow("more", 1200)).toBe(false);
    expect(guard.allow("more", 1300)).toBe(true);
  });

  it("never blocks different buttons", () => {
    const guard = new RepeatGuard(300);
    expect(guard.allow("I", 1000)).toBe(true);
    expect(guard.allow("want", 1010)).toBe(true);
  });

  it("is off at zero and adjustable", () => {
    const guard = new RepeatGuard(0);
    expect(guard.allow("go", 1)).toBe(true);
    expect(guard.allow("go", 1)).toBe(true);
    guard.setWindow(1000);
    expect(guard.allow("go", 500)).toBe(false);
    guard.setWindow(-5);
    expect(guard.allow("go", 500)).toBe(true);
  });
});
