# Security and Privacy

Applies to all phases. Privacy obligations for Alberta public schools fall under the Protection
of Privacy Act (POPA) and each school authority's policies; this document describes the vendor
side and is not legal advice.

## Data inventory

| Data                                                                                   | Where                                                                                | Encrypted                           | Leaves the device?                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------- |
| Boards, vocabulary, layout                                                             | SQLite in OPFS                                                                       | OS-level (device passcode required) | Only as ciphertext to the sync vault                    |
| Photos, recordings, rendered clips                                                     | OPFS files                                                                           | OS-level                            | Only as ciphertext                                      |
| Admin PIN                                                                              | `device_settings`, PBKDF2 hash                                                       | Hashed                              | Never                                                   |
| **Release 2 (interim):** student name/nickname, settings, added words, saved sentences | IndexedDB `communicate` → `profiles`                                                 | OS-level                            | Only in a backup file an adult downloads                |
| **Release 2:** photos on added words                                                   | IndexedDB → `media` (JPEG, ≤ 320 px, metadata stripped by re-encoding)               | OS-level                            | Only in a backup file                                   |
| **Release 2:** adult PIN                                                               | IndexedDB → `meta`, PBKDF2-SHA-256, 210,000 iterations, 16-byte salt; lock-out state | Hashed                              | Never                                                   |
| **Release 2:** backup file                                                             | Wherever the adult saves it                                                          | **No** (JSON)                       | Yes — adult's choice; the menu warns to keep it private |
| Vault key                                                                              | IndexedDB, non-extractable `CryptoKey`; wrapped copy on recovery card                | Yes                                 | Never in plaintext                                      |
| Communication history (optional)                                                       | SQLite                                                                               | OS-level                            | Never                                                   |
| AI request text                                                                        | In transit to Azure (Canada)                                                         | TLS                                 | Yes, after name screening; no profile data              |
| Spike reports (Phase 0)                                                                | Exported JSON                                                                        | —                                   | Only when the tester shares it; no personal data        |

## Threats and controls

| Threat                           | Control                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Lost or stolen tablet            | Device passcode (pilot requirement); admin PIN; vault device can be revoked                                                          |
| Sync server breach               | End-to-end encryption; server holds ciphertext only                                                                                  |
| Malicious import file (.obz)     | Validate before extraction: path traversal, entry count, size and image dimension limits, schema validation; no execution of content |
| Malicious/compromised dependency | Pinned versions, lockfile, `npm audit` in CI, minimal dependency set                                                                 |
| Script injection via labels      | React escaping; no `dangerouslySetInnerHTML`; strict CSP from Phase 1                                                                |
| AI misuse / cost abuse           | Pilot keys, rate limits, schema-validated output, adult approval                                                                     |
| Third-party model hosts (voice)  | Models fetched only in admin flows; pinned model ids; cached; integrity hashes recorded in Phase 1                                   |
| Logging personal data            | Logs record operation names and error types only                                                                                     |

## Required before real student data

Privacy policy, data processing agreement, data inventory + flow diagram, security overview,
retention and deletion procedure, subprocessor and hosting disclosure (static host, Azure Canada),
PIA support, AI data-use disclosure, incident response procedure, accessibility statement
(PRD section 11).

## Licensing (ADR 0009)

- Licence files hold a school or district name, tier, seats and dates — no student data — and
  are verified on the device with ECDSA P-256. The private signing key stays on TD's computer
  (`~/giftedtech-licensing`), backed up in a password manager, never in a repo or online.
- `licence.giftedtech.org` serves pre-signed files by code and counts activations. Codes are
  8 random characters from a 32-letter alphabet (about 10^12 combinations).
- The demo runs entirely in memory with made-up data and never writes to storage.

## Release 2 notes

- The PIN stops students changing their setup by accident. It is not a data-protection control;
  device passcodes and school device management are.
- Backup files are validated before anything is written: format and version, 25 MB cap, profile
  re-parsed field by field, photos limited to JPEG/PNG/WebP and 2 MB each; restore always creates
  a new profile with new ids.
- "Said today" messages are kept in memory only and vanish when the app closes (D22).
- Encrypted backups replace plain files when Phase 4 sync lands.

## Phase 0

Spikes use synthetic data only. The voice spike downloads public models from Hugging Face and
runtime files from jsDelivr / cdnjs; nothing is uploaded.
