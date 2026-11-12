import { describe, expect, it } from "vitest";
import { afterFailure, checkPin, hashPin, isLocked, isValidPin, NO_LOCK } from "../src/core/pin";

describe("adult PIN", () => {
  it("accepts only 4–8 digits", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345678")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });

  it("stores a salted hash, never the PIN", async () => {
    const a = await hashPin("2468", 1000);
    const b = await hashPin("2468", 1000);
    expect(JSON.stringify(a)).not.toContain("2468");
    expect(a.salt).not.toBe(b.salt);
    expect(await checkPin("2468", a)).toBe(true);
    expect(await checkPin("1357", a)).toBe(false);
    expect(await checkPin("abc", a)).toBe(false);
  });

  it("locks after 5 wrong tries, for longer each time", () => {
    let s = NO_LOCK;
    for (let i = 0; i < 4; i++) s = afterFailure(s, 0);
    expect(isLocked(s, 0)).toBe(false);
    s = afterFailure(s, 0);
    expect(s.lockedUntil).toBe(30_000);
    expect(isLocked(s, 29_999)).toBe(true);
    expect(isLocked(s, 30_000)).toBe(false);
    s = afterFailure(s, 30_000);
    expect(s.lockedUntil).toBe(30_000 + 60_000);
    for (let i = 0; i < 10; i++) s = afterFailure(s, 0);
    expect(s.lockedUntil).toBe(900_000);
  });
});
