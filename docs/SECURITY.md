# Security and Privacy

Applies to all phases. Privacy obligations for Alberta public schools fall under the Protection
of Privacy Act (POPA) and each school authority's policies; this document describes the vendor
side and is not legal advice.

## Data inventory

| Data                               | Where                                                                 | Encrypted                           | Leaves the device?                               |
| ---------------------------------- | --------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Boards, vocabulary, layout         | SQLite in OPFS                                                        | OS-level (device passcode required) | Only as ciphertext to the sync vault             |
| Photos, recordings, rendered clips | OPFS files                                                            | OS-level                            | Only as ciphertext                               |
| Admin PIN                          | `device_settings`, PBKDF2 hash                                        | Hashed                              | Never                                            |
| Vault key                          | IndexedDB, non-extractable `CryptoKey`; wrapped copy on recovery card | Yes                                 | Never in plaintext                               |
| Communication history (optional)   | SQLite                                                                | OS-level                            | Never                                            |
| AI request text                    | In transit to Azure (Canada)                                          | TLS                                 | Yes, after name screening; no profile data       |
| Spike reports (Phase 0)            | Exported JSON                                                         | —                                   | Only when the tester shares it; no personal data |

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

## Phase 0

Spikes use synthetic data only. The voice spike downloads public models from Hugging Face and
runtime files from jsDelivr / cdnjs; nothing is uploaded.
