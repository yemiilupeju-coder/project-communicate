/**
 * Adult PIN (decision D6). The PIN keeps students from changing their own
 * setup by accident; it is not a security boundary for the data on the
 * device. Stored only as a salted PBKDF2-SHA-256 hash. After 5 wrong tries
 * the pad locks, for longer each time.
 */

export interface PinRecord {
  readonly salt: string;
  readonly hash: string;
  readonly iterations: number;
}

export interface LockState {
  readonly failures: number;
  readonly lockedUntil: number;
}

export const PIN_KEY = "adultPin";
export const LOCK_KEY = "adultPinLock";
export const ITERATIONS = 210_000;
export const FREE_TRIES = 5;

export const isValidPin = (pin: string) => /^\d{4,8}$/.test(pin);

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string, iterations = ITERATIONS): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new RangeError("A PIN is 4 to 8 digits");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toB64(salt), hash: toB64(await derive(pin, salt, iterations)), iterations };
}

export async function checkPin(pin: string, record: PinRecord): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const actual = await derive(pin, fromB64(record.salt), record.iterations);
  const expected = fromB64(record.hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}

export const NO_LOCK: LockState = { failures: 0, lockedUntil: 0 };

/** 5 free tries, then 30 s, 60 s, 120 s … up to 15 minutes. */
export function afterFailure(state: LockState, now: number): LockState {
  const failures = state.failures + 1;
  if (failures < FREE_TRIES) return { failures, lockedUntil: 0 };
  const seconds = Math.min(900, 30 * 2 ** (failures - FREE_TRIES));
  return { failures, lockedUntil: now + seconds * 1000 };
}

export const isLocked = (state: LockState, now: number) => state.lockedUntil > now;
