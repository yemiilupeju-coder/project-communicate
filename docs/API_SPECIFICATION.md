# API Specification

**Base:** `https://<api-host>/api/v1` · ASP.NET Core on .NET 10 · JSON · HTTPS only
**Status:** Planned for Phases 4 (sync) and 6 (AI). Not implemented in Phase 0.

The communicator never calls this API. Only the sync and AI features do, and every call is
optional: failure must never affect communication.

## Authentication

| Caller                 | Credential                                                                            | Used for  |
| ---------------------- | ------------------------------------------------------------------------------------- | --------- |
| Device in a sync vault | `Authorization: Bearer <device token>` (256-bit random, issued at pairing, revocable) | `/sync/*` |
| School pilot           | `X-Pilot-Key: <key>` issued per school (D14), stored on the device after admin entry  | `/ai/*`   |

No user accounts in the MVP. Entra External ID may replace pilot keys later (OIDC; no custom
`/auth/login` endpoint).

## Health

`GET /health` → `200 {"status":"ok","version":"<build>"}`. No infrastructure details.

## Sync (Phase 4)

The server stores opaque ciphertext. It can see vault ids, device ids, sizes and timestamps; it
cannot read boards, labels, photos or audio.

| Method | Path                                                     | Body / result                                                                           |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/sync/vaults`                                           | Create vault → `{vaultId, deviceId, deviceToken}`                                       |
| POST   | `/sync/vaults/{vaultId}/devices`                         | Register a paired device using a one-time pairing token → `{deviceId, deviceToken}`     |
| DELETE | `/sync/vaults/{vaultId}/devices/{deviceId}`              | Revoke a device                                                                         |
| POST   | `/sync/vaults/{vaultId}/ops`                             | `{batches:[{batchId, ciphertext, nonce}]}` → `{serverSeqs:[…]}` (idempotent on batchId) |
| GET    | `/sync/vaults/{vaultId}/ops?after={serverSeq}&limit=500` | `{batches:[…], nextAfter}`                                                              |
| PUT    | `/sync/vaults/{vaultId}/blobs/{blobId}`                  | Encrypted media (≤ 10 MB), content-addressed by hash of ciphertext                      |
| GET    | `/sync/vaults/{vaultId}/blobs/{blobId}`                  | Encrypted media                                                                         |
| DELETE | `/sync/vaults/{vaultId}`                                 | Delete everything for the vault (documented data deletion)                              |

Limits: 60 requests/min/device; 500 MB per vault (configurable). Errors use RFC 9457 problem
details. Request bodies are never logged.

## AI (Phase 6)

As Technical Specification 1.0 section 12, unchanged in shape:

- `POST /ai/vocabulary-suggestions` `{context, locale, categories[]}` →
  `{suggestions:[{label, spokenText, category}]}`
- `POST /ai/phrase-suggestions` `{locale, existingVocabulary[], context}` →
  `{suggestions:[{label, spokenText, category}]}`

Rules: model output validated against a strict schema; max 30 suggestions; 15 s timeout; per-key
and per-device rate limits; Azure OpenAI Regional Standard deployment in Canada only; no request
bodies logged; nothing used for training.
