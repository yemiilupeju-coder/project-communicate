# ADR 0005 — End-to-end encrypted sync with an operation log

- Status: Accepted (W3, W6, W8, Nov 9, 2026)

## Context

The web-first design treats the tablet as one replica. Copies must exist elsewhere, but cloud
copies of children's boards and family photos create privacy risk.

## Decision

- Every saved change is appended to a local operation log (per-field values with a hybrid logical
  clock). Conflicts resolve per field, last writer wins.
- Operation batches and media are encrypted on the device with a vault key (AES-GCM 256) and
  uploaded to an ASP.NET Core service with PostgreSQL in Canada Central. The server stores only
  ciphertext and metadata.
- Devices join by scanning a pairing QR from an existing device.
- A printed recovery code (family copy + school admin copy) can restore the vault key if every
  device is lost.

## Consequences

- Sync is in the MVP; the backend gains a database.
- Losing every device and every recovery code makes cloud data unrecoverable, by design.
- The privacy review is simpler: the vendor cannot read board content.
- A full CRDT library is not needed while only adults edit and edits are rare.
