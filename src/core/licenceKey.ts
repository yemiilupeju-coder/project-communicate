/**
 * GiftedTech's public licence key. Generate the key pair once with the
 * giftedtech-licence repo (`node scripts/keygen.mjs`), then paste the PUBLIC
 * key it prints in place of `null` below. The private key never goes in this
 * repository or online.
 *
 * While this is null, every device runs as Family (free) and the adult menu
 * says licences aren't set up yet.
 */
const PUBLIC_KEY: JsonWebKey | null = null;

// Test builds can point at a local key and licence service.
const testKey = import.meta.env.VITE_LICENCE_PUBLIC_KEY as string | undefined;
const testService = import.meta.env.VITE_LICENCE_SERVICE as string | undefined;

export const LICENCE_PUBLIC_KEY: JsonWebKey | null = testKey
  ? (JSON.parse(testKey) as JsonWebKey)
  : PUBLIC_KEY;

/** Where the app swaps a licence code for its signed file. */
export const LICENCE_SERVICE = testService ?? "https://licence.giftedtech.org/v1/licences/";
