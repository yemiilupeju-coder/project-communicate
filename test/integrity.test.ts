import { describe, expect, it } from "vitest";
import {
  expectedBlob,
  expectedPayload,
  integrityOk,
  mulberry32,
  sha256Hex,
} from "../src/spikes/storage/integrity";

describe("expectedPayload", () => {
  it("is deterministic, 512 characters, and differs between ids", () => {
    expect(expectedPayload(7)).toBe(expectedPayload(7));
    expect(expectedPayload(7)).toHaveLength(512);
    expect(expectedPayload(7)).not.toBe(expectedPayload(8));
    expect(expectedPayload(7).startsWith("record-7 ")).toBe(true);
  });

  it("rejects invalid ids", () => {
    expect(() => expectedPayload(-1)).toThrow(RangeError);
    expect(() => expectedPayload(1.5)).toThrow(RangeError);
  });
});

describe("expectedBlob", () => {
  it("reproduces the same bytes from the same seed", () => {
    const a = expectedBlob(42, 4096);
    const b = expectedBlob(42, 4096);
    expect(a).toEqual(b);
    expect(expectedBlob(43, 4096)).not.toEqual(a);
  });

  it("produces bytes across the whole range", () => {
    const bytes = expectedBlob(1, 10_000);
    expect(Math.min(...bytes)).toBeLessThan(10);
    expect(Math.max(...bytes)).toBeGreaterThan(245);
  });

  it("rejects invalid sizes", () => {
    expect(() => expectedBlob(1, -1)).toThrow(RangeError);
  });
});

describe("mulberry32", () => {
  it("returns values in [0, 1)", () => {
    const next = mulberry32(99);
    for (let i = 0; i < 1000; i += 1) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("sha256Hex", () => {
  it("matches the known digest of 'abc'", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes strings and their UTF-8 bytes identically", async () => {
    const text = "I need a break.";
    expect(await sha256Hex(text)).toBe(await sha256Hex(new TextEncoder().encode(text)));
  });
});

describe("integrityOk", () => {
  it("is true only with no bad records or blobs", () => {
    const base = { recordsChecked: 3, blobsChecked: 1, durationMs: 1 };
    expect(integrityOk({ ...base, recordsBad: [], blobsBad: [] })).toBe(true);
    expect(integrityOk({ ...base, recordsBad: [2], blobsBad: [] })).toBe(false);
    expect(integrityOk({ ...base, recordsBad: [], blobsBad: [1] })).toBe(false);
  });
});
