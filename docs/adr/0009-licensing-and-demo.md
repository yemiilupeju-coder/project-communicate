# ADR 0009 — Licensing and the public demo

- Status: Accepted (TD, Nov 13, 2026), from the Licensing, Demo & District Sales Plan
- Builds on: ADR 0008

## Decision

**Billing never silences a student.** Every word, page, voice and the large-text fallback work on
every device, licensed or not.

| Tier                    | How a device gets it  | What it allows                                                                        |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| Family (free)           | Default, no licence   | Everything, with team tools (edit words, backups) for the first student on the device |
| Pilot, School, District | A signed licence file | More students per device, team tools for all of them                                  |
| Demo                    | `/demo/`              | Everything, with a made-up student; nothing is saved                                  |

An expired licence keeps team tools for 30 days of grace, then the device falls back to Family.
Nothing a student already has is removed: extra students keep all their words, only editing
them and backups lock.

**Licence files** are JSON payloads signed with ECDSA P-256 / SHA-256 (`src/core/licence.ts`):
`{ payload: base64url(JSON), signature: base64url(raw r‖s) }`. The payload holds the code,
customer (school or district name), tier, seats, start and end dates and grace days, never
student information. The app holds the public key (`src/core/licenceKey.ts`) and checks the
signature with Web Crypto, so a licence works offline. Seats are a contract term; devices can't
count each other offline.

**Activation:** an adult enters a code (`GT-XXXX-XXXX`) in Adults → Licence while online, or
loads a licence file, or device management opens `/?licence=GT-…`. The app fetches the signed
file from `licence.giftedtech.org` (repo `giftedtech-licence`), which only serves files TD
signed on his own computer; the private key never goes online.

**Demo:** `demo/index.html` sets `data-mode="demo"`. The app then boots a `MemoryStore` with a
sample student (`src/app/demoData.ts`), skips localStorage, shows a banner and treats the device
as licensed. It can't touch real data on the same origin.

## Consequences

- Until TD generates the key pair and pastes the public key, every device runs as Family and the
  adult menu says licences aren't set up yet.
- Licence checks are honest-user controls, as for most school software: a determined person
  could edit the app. Contracts are the real control.
- The licence service stores school/district names, codes and activation counts. No student data.
