/**
 * School and district licences (see the Licensing, Demo & District Sales Plan).
 *
 * A licence is a small JSON file signed by GiftedTech with ECDSA P-256. The
 * app checks the signature on the device with Web Crypto, so it works offline
 * and needs no accounts. A licence names the school or district, never a
 * student.
 *
 * The rule that matters most: billing never silences a student. Without a
 * licence the device runs as Family (free): every word, page and voice works,
 * and team tools work for the first student. A licence adds more students per
 * device. An expired licence gets 30 days of grace, then falls back to Family;
 * nothing a student already has is ever removed.
 */

export type Tier = "pilot" | "classroom" | "school" | "district";

export interface LicencePayload {
  readonly v: 1;
  /** Short code an adult types, e.g. GT-7KQ4-M2XD. */
  readonly code: string;
  /** School or district name, shown in the adult menu. */
  readonly customer: string;
  readonly tier: Tier;
  /** Students covered by the contract (counted across devices by the contract). */
  readonly seats: number;
  /** ISO dates, inclusive. */
  readonly starts: string;
  readonly ends: string;
  readonly graceDays: number;
}

export interface SignedLicence {
  /** base64url of the payload's JSON bytes, exactly as signed. */
  readonly payload: string;
  /** base64url of the raw (IEEE P1363) ECDSA P-256 / SHA-256 signature. */
  readonly signature: string;
}

export type LicenceStatus =
  | { readonly kind: "family" }
  | { readonly kind: "demo" }
  | { readonly kind: "not-yet"; readonly licence: LicencePayload }
  | { readonly kind: "active"; readonly licence: LicencePayload; readonly daysLeft: number }
  | { readonly kind: "grace"; readonly licence: LicencePayload; readonly graceLeft: number }
  | { readonly kind: "expired"; readonly licence: LicencePayload };

export const LICENCE_KEY = "licence";
export const CODE_PATTERN = /^GT-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export class LicenceError extends Error {}

// ── Encoding ──

export function toBase64Url(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new LicenceError("Not base64url");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function normaliseCode(input: string): string {
  let clean = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (clean.length === 10 && clean.startsWith("GT")) clean = clean.slice(2);
  // Codes never use I, L, O or U, so read look-alikes as the digits people meant.
  clean = clean.replace(/O/g, "0").replace(/[IL]/g, "1");
  return clean.length === 8
    ? `GT-${clean.slice(0, 4)}-${clean.slice(4)}`
    : input.trim().toUpperCase();
}

// ── Validation ──

const isDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function parsePayload(raw: unknown): LicencePayload {
  const r = raw as Partial<LicencePayload> | null;
  if (!r || typeof r !== "object" || r.v !== 1) throw new LicenceError("Unknown licence format");
  if (typeof r.code !== "string" || !CODE_PATTERN.test(r.code)) throw new LicenceError("Bad code");
  if (typeof r.customer !== "string" || r.customer.trim() === "" || r.customer.length > 120)
    throw new LicenceError("Bad customer");
  const tiers: readonly Tier[] = ["pilot", "classroom", "school", "district"];
  const tier = tiers.find((t) => t === r.tier);
  if (!tier) throw new LicenceError("Bad tier");
  if (typeof r.seats !== "number" || !Number.isInteger(r.seats) || r.seats < 1 || r.seats > 1e6)
    throw new LicenceError("Bad seats");
  if (!isDate(r.starts) || !isDate(r.ends) || r.ends < r.starts)
    throw new LicenceError("Bad dates");
  const graceDays =
    typeof r.graceDays === "number" && Number.isInteger(r.graceDays) && r.graceDays >= 0
      ? Math.min(r.graceDays, 90)
      : 30;
  return {
    v: 1,
    code: r.code,
    customer: r.customer.trim(),
    tier,
    seats: r.seats,
    starts: r.starts,
    ends: r.ends,
    graceDays,
  };
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "verify",
  ]);
}

/** Checks the signature and contents. Throws LicenceError if it isn't genuine. */
export async function verifyLicence(file: unknown, key: CryptoKey): Promise<LicencePayload> {
  const f = file as Partial<SignedLicence> | null;
  if (!f || typeof f.payload !== "string" || typeof f.signature !== "string")
    throw new LicenceError("This isn't a GiftedTech licence.");
  if (f.payload.length > 4096 || f.signature.length > 200)
    throw new LicenceError("This isn't a GiftedTech licence.");
  const bytes = fromBase64Url(f.payload);
  const signature = fromBase64Url(f.signature);
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signature as BufferSource,
    bytes as BufferSource,
  );
  if (!ok) throw new LicenceError("This licence isn't genuine.");
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new LicenceError("This licence is damaged.");
  }
  return parsePayload(json);
}

// ── Status ──

const DAY = 86_400_000;
const dayStart = (iso: string) => Date.parse(`${iso}T00:00:00`);

export function licenceStatus(
  licence: LicencePayload | null,
  now: number,
  demo = false,
): LicenceStatus {
  if (demo) return { kind: "demo" };
  if (!licence) return { kind: "family" };
  if (now < dayStart(licence.starts)) return { kind: "not-yet", licence };
  const endOfLastDay = dayStart(licence.ends) + DAY;
  if (now < endOfLastDay) {
    return { kind: "active", licence, daysLeft: Math.ceil((endOfLastDay - now) / DAY) };
  }
  const graceEnd = endOfLastDay + licence.graceDays * DAY;
  if (now < graceEnd)
    return { kind: "grace", licence, graceLeft: Math.ceil((graceEnd - now) / DAY) };
  return { kind: "expired", licence };
}

/** Licensed devices may hold several students and use team tools for each. */
export const isLicensed = (status: LicenceStatus) =>
  status.kind === "active" || status.kind === "grace" || status.kind === "demo";

/**
 * Team tools (edit words, backups) for one student. Family covers the first
 * student on the device; a licence covers everyone. Communication itself is
 * never behind this check.
 */
export function teamToolsAllowed(status: LicenceStatus, profileIndex: number): boolean {
  return isLicensed(status) || profileIndex === 0;
}

/** Adding another student needs a licence once one student exists. */
export function canAddStudent(status: LicenceStatus, studentCount: number): boolean {
  return isLicensed(status) || studentCount === 0;
}

export function describeStatus(status: LicenceStatus): string {
  switch (status.kind) {
    case "demo":
      return "Demo: every feature is on.";
    case "family":
      return "Family (free, for home use): every word and voice, and team tools for one student. Schools need a school licence.";
    case "not-yet":
      return `${status.licence.customer}: licence starts ${status.licence.starts}.`;
    case "active":
      return `${status.licence.customer}: ${tierName(status.licence.tier)} licence until ${status.licence.ends}.`;
    case "grace":
      return `${status.licence.customer}: licence ended ${status.licence.ends}. Team tools keep working for ${status.graceLeft} more days. Contact GiftedTech to renew.`;
    case "expired":
      return `${status.licence.customer}: licence ended ${status.licence.ends}. Students keep all their words. Renew to add students or edit words for more than one student.`;
  }
}

export const tierName = (tier: Tier) =>
  ({ pilot: "pilot", classroom: "classroom", school: "school", district: "district" })[tier];
