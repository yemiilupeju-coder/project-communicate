import { describe, expect, it } from "vitest";
import {
  canAddStudent,
  describeStatus,
  isLicensed,
  licenceStatus,
  normaliseCode,
  teamToolsAllowed,
  toBase64Url,
  verifyLicence,
  type LicencePayload,
} from "../src/core/licence";

// Same signing steps as giftedtech-licence/scripts/issue.mjs.
async function keys() {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
    "verify",
  ]);
}
async function sign(payload: unknown, key: CryptoKey) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, bytes),
  );
  return { payload: toBase64Url(bytes), signature: toBase64Url(sig) };
}
const base: LicencePayload = {
  v: 1,
  code: "GT-7KQ4-M2XD",
  customer: "Maple Elementary",
  tier: "school",
  seats: 30,
  starts: "2026-09-01",
  ends: "2027-08-31",
  graceDays: 30,
};
const at = (iso: string) => Date.parse(`${iso}T12:00:00`);

describe("licence files", () => {
  it("accepts a genuine licence and rejects tampering or another key", async () => {
    const pair = await keys();
    const file = await sign(base, pair.privateKey);
    expect(await verifyLicence(file, pair.publicKey)).toEqual(base);

    const forged = {
      ...file,
      payload: toBase64Url(new TextEncoder().encode(JSON.stringify({ ...base, seats: 9999 }))),
    };
    await expect(verifyLicence(forged, pair.publicKey)).rejects.toThrow("isn't genuine");

    const other = await keys();
    await expect(verifyLicence(file, other.publicKey)).rejects.toThrow("isn't genuine");
    await expect(verifyLicence({ nope: 1 }, pair.publicKey)).rejects.toThrow();
  });

  it("rejects well-signed but invalid contents", async () => {
    const pair = await keys();
    for (const bad of [
      { ...base, tier: "gold" },
      { ...base, code: "ABC" },
      { ...base, ends: "2026-01-01" },
      { ...base, seats: 0 },
      { ...base, v: 2 },
    ]) {
      await expect(
        verifyLicence(await sign(bad, pair.privateKey), pair.publicKey),
      ).rejects.toThrow();
    }
  });
});

describe("licence status", () => {
  it("is Family with no licence, and Demo in the demo", () => {
    expect(licenceStatus(null, at("2027-01-01")).kind).toBe("family");
    expect(licenceStatus(null, at("2027-01-01"), true).kind).toBe("demo");
  });

  it("runs from the start date through the whole last day, then 30 days of grace", () => {
    expect(licenceStatus(base, at("2026-08-31")).kind).toBe("not-yet");
    expect(licenceStatus(base, at("2026-09-01")).kind).toBe("active");
    expect(licenceStatus(base, at("2027-08-31")).kind).toBe("active");
    const grace = licenceStatus(base, at("2027-09-01"));
    expect(grace.kind).toBe("grace");
    expect(grace.kind === "grace" && grace.graceLeft).toBe(30);
    expect(licenceStatus(base, at("2027-09-30")).kind).toBe("grace");
    expect(licenceStatus(base, at("2027-10-01")).kind).toBe("expired");
  });

  it("explains every state in plain words", () => {
    for (const now of ["2026-08-01", "2027-01-01", "2027-09-05", "2028-01-01"]) {
      expect(describeStatus(licenceStatus(base, at(now)))).toContain("Maple Elementary");
    }
    expect(describeStatus(licenceStatus(null, 0))).toContain("Family");
  });
});

describe("what a licence unlocks", () => {
  it("never limits the first student, so Family is fully usable", () => {
    const family = licenceStatus(null, 0);
    expect(teamToolsAllowed(family, 0)).toBe(true);
    expect(canAddStudent(family, 0)).toBe(true);
  });

  it("needs a licence for more students and their team tools", () => {
    const family = licenceStatus(null, 0);
    expect(canAddStudent(family, 1)).toBe(false);
    expect(teamToolsAllowed(family, 1)).toBe(false);
    const active = licenceStatus(base, at("2027-01-01"));
    expect(isLicensed(active)).toBe(true);
    expect(canAddStudent(active, 12)).toBe(true);
    expect(teamToolsAllowed(active, 5)).toBe(true);
  });

  it("keeps team tools during grace and falls back to Family after", () => {
    expect(teamToolsAllowed(licenceStatus(base, at("2027-09-10")), 3)).toBe(true);
    const expired = licenceStatus(base, at("2028-01-01"));
    expect(teamToolsAllowed(expired, 3)).toBe(false);
    expect(teamToolsAllowed(expired, 0)).toBe(true);
  });
});

describe("licence codes", () => {
  it("accepts codes typed with spaces, lower case or look-alike letters", () => {
    expect(normaliseCode("gt 7kq4 m2xd")).toBe("GT-7KQ4-M2XD");
    expect(normaliseCode("7KQ4M2XD")).toBe("GT-7KQ4-M2XD");
    expect(normaliseCode("GT-7KQ4-M2XO")).toBe("GT-7KQ4-M2X0");
    expect(normaliseCode("GT-1LI4-0OAB")).toBe("GT-1114-00AB");
  });
});
