/**
 * Display and speech settings, stored on this device only. Every field is
 * validated on load, so a damaged or old value falls back to its default
 * instead of breaking the app.
 */

export type KeyboardLayout = "qwerty" | "abc";

export interface Settings {
  readonly version: 1;
  /** Speak each word as it is tapped (the message can always be spoken in full). */
  readonly speakOnSelect: boolean;
  /** Chosen system voice; null = the browser's default voice. */
  readonly voiceURI: string | null;
  /** Speech rate, 0.5 (slow) to 1.5 (fast). */
  readonly rate: number;
  readonly highContrast: boolean;
  readonly showSymbols: boolean;
  readonly keyboardLayout: KeyboardLayout;
  /** Ignore a repeat tap of the same button within this many ms. */
  readonly repeatGuardMs: number;
  /** After a word on a topic page, go back to the Words page (off by default). */
  readonly returnToWords: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  speakOnSelect: true,
  voiceURI: null,
  rate: 1,
  highContrast: false,
  showSymbols: true,
  keyboardLayout: "qwerty",
  repeatGuardMs: 300,
  returnToWords: false,
};

export const SETTINGS_KEY = "communicate.settings.v1";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Builds valid settings from untrusted input, field by field. */
export function parseSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS;
  const input = raw as Record<string, unknown>;
  const bool = (key: keyof Settings, fallback: boolean) =>
    typeof input[key] === "boolean" ? (input[key] as boolean) : fallback;
  const num = (key: keyof Settings, fallback: number, min: number, max: number) =>
    typeof input[key] === "number" && Number.isFinite(input[key])
      ? clamp(input[key] as number, min, max)
      : fallback;
  return {
    version: 1,
    speakOnSelect: bool("speakOnSelect", DEFAULT_SETTINGS.speakOnSelect),
    voiceURI:
      typeof input.voiceURI === "string" && input.voiceURI.length > 0 ? input.voiceURI : null,
    rate: num("rate", DEFAULT_SETTINGS.rate, 0.5, 1.5),
    highContrast: bool("highContrast", DEFAULT_SETTINGS.highContrast),
    showSymbols: bool("showSymbols", DEFAULT_SETTINGS.showSymbols),
    keyboardLayout: input.keyboardLayout === "abc" ? "abc" : "qwerty",
    repeatGuardMs: Math.round(num("repeatGuardMs", DEFAULT_SETTINGS.repeatGuardMs, 0, 2000)),
    returnToWords: bool("returnToWords", DEFAULT_SETTINGS.returnToWords),
  };
}

type ReadableStore = Pick<Storage, "getItem">;
type WritableStore = Pick<Storage, "setItem">;

export function loadSettings(store: ReadableStore | null): Settings {
  if (!store) return DEFAULT_SETTINGS;
  try {
    const text = store.getItem(SETTINGS_KEY);
    return text ? parseSettings(JSON.parse(text)) : DEFAULT_SETTINGS;
  } catch {
    // Unreadable storage or corrupt JSON: defaults keep the student talking.
    return DEFAULT_SETTINGS;
  }
}

/** Returns false if the settings could not be saved (e.g. storage blocked). */
export function saveSettings(store: WritableStore | null, settings: Settings): boolean {
  if (!store) return false;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
