/**
 * Deterministic test data so a later launch can prove that what it reads back
 * is exactly what an earlier launch wrote, without keeping a second copy.
 */

const WORDS = ["help", "more", "stop", "go", "want", "like", "break", "yes", "no", "finished"];

/** The text stored in record `id`. Always ~512 bytes and fully determined by `id`. */
export function expectedPayload(id: number): string {
  if (!Number.isInteger(id) || id < 0) throw new RangeError(`invalid record id ${id}`);
  const parts: string[] = [`record-${id}`];
  let i = id;
  while (parts.join(" ").length < 512) {
    parts.push(WORDS[i % WORDS.length] as string);
    i = (i * 31 + 7) % 1_000_003;
  }
  return parts.join(" ").slice(0, 512);
}

/** Small, fast, seedable PRNG (mulberry32). Same seed → same sequence. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `size` pseudo-random bytes fully determined by `seed`. */
export function expectedBlob(seed: number, size: number): Uint8Array {
  if (!Number.isInteger(size) || size < 0) throw new RangeError(`invalid blob size ${size}`);
  const next = mulberry32(seed);
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = Math.floor(next() * 256);
  return bytes;
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  // Copy into a fresh ArrayBuffer so SharedArrayBuffer-backed views are accepted.
  const buffer = new Uint8Array(bytes).buffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface IntegrityResult {
  recordsChecked: number;
  recordsBad: number[];
  blobsChecked: number;
  blobsBad: number[];
  durationMs: number;
}

export function integrityOk(result: IntegrityResult): boolean {
  return result.recordsBad.length === 0 && result.blobsBad.length === 0;
}
