import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  parseSettings,
  saveSettings,
} from "../src/core/settings";

const memoryStore = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

describe("settings", () => {
  it("round-trips through storage", () => {
    const store = memoryStore();
    const changed = {
      ...DEFAULT_SETTINGS,
      rate: 0.8,
      highContrast: true,
      keyboardLayout: "abc" as const,
    };
    expect(saveSettings(store, changed)).toBe(true);
    expect(loadSettings(store)).toEqual(changed);
  });

  it("falls back to defaults for missing, corrupt or blocked storage", () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    const corrupt = { getItem: () => "{not json" };
    expect(loadSettings(corrupt)).toEqual(DEFAULT_SETTINGS);
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
  });

  it("reports when saving fails", () => {
    expect(saveSettings(null, DEFAULT_SETTINGS)).toBe(false);
    const full = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(saveSettings(full, DEFAULT_SETTINGS)).toBe(false);
  });

  it("validates every field independently", () => {
    const parsed = parseSettings({
      speakOnSelect: "yes",
      voiceURI: 42,
      rate: 9,
      highContrast: true,
      showSymbols: null,
      keyboardLayout: "dvorak",
      repeatGuardMs: -50,
    });
    expect(parsed).toEqual({
      ...DEFAULT_SETTINGS,
      rate: 1.5,
      highContrast: true,
      repeatGuardMs: 0,
    });
  });

  it("rejects non-object input", () => {
    expect(parseSettings("hello")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("uses a versioned key", () => {
    expect(SETTINGS_KEY).toMatch(/v1$/);
  });
});
