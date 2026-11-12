# Project Communicate — Technical Specification (web-first)

**Version:** 2.1
**Date:** November 11, 2026
**Status:** Approved direction (W1–W8 approved Nov 9, 2026; browser-only reaffirmed Nov 11, 2026,
ADR 0007); Release 1 (student communicator) built
**Supersedes:** Technical Specification 1.0 (Flutter native), retained in project history
**Related:** `PRODUCT_REQUIREMENTS.md`, `adr/0001`–`0007`, the review docs
"MVP Architecture Review & Implementation Plan" and "Web-first Architecture Concepts"

---

## 1. Objective

Build an offline-first AAC MVP as a web application installed to the Home Screen (PWA), that:

- lets a communicator open boards, select words and phrases, hear them, build sentences and
  navigate categories, with no network;
- lets authorised adults build and edit boards, add photos and recorded or rendered speech;
- keeps boards in several places at once (tablet, encrypted cloud copy, linked caregiver devices,
  paper) so that losing one copy never silences the communicator;
- offers optional AI vocabulary suggestions that an adult must approve.

The product rules in `CLAUDE.md` (Non-Negotiable Product Rules) apply to every section below.

## 2. Design principles

1. **No single point of silence.** Every layer that can fail has a next step down; the lowest step
   needs only the app itself.
2. **The tablet is a replica, not the record.** Boards are replicated, encrypted, to the cloud and
   linked devices, and printable as a paper twin.
3. **The voice belongs to the communicator.** Button speech is rendered once into audio clips that
   travel with the board.
4. **Any browser, any device.** One web codebase that runs in current Safari, Chrome, Edge and
   Firefox; no native shell and no OS-specific features beyond detection (ADR 0007).

### Fallback ladders

| Layer   | 1st                                  | 2nd                                | 3rd                      | Last (always works)           |
| ------- | ------------------------------------ | ---------------------------------- | ------------------------ | ----------------------------- |
| Storage | SQLite in OPFS on the tablet         | Encrypted cloud + caregiver copies | Paper twin QR (offline)  | Core board built into the app |
| Voice   | Pre-rendered clip / family recording | On-device neural voice (live)      | System `speechSynthesis` | Large-text display            |

## 3. Platforms and minimum versions

| Platform                                     | Minimum          | Notes                                                  |
| -------------------------------------------- | ---------------- | ------------------------------------------------------ |
| iPadOS (Safari / Home Screen web app)        | 17               | OPFS + `opfs-sahpool` reliable from 17; WebGPU from 26 |
| Android tablets (Chrome)                     | Chrome current-2 | Installed PWA                                          |
| Chromebooks / desktop (Chrome, Edge, Safari) | current-2        | Adult Board Builder; also communicator                 |

Final device list is decision D18. Real-device testing is required on at least one iPad and one
Android tablet.

## 4. Technology stack

| Layer                  | Choice                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Language               | TypeScript, `strict`                                                               |
| UI                     | React 19; React Aria components for accessible primitives                          |
| Build / offline        | Vite; vite-plugin-pwa (Workbox `generateSW`)                                       |
| Local database         | `@sqlite.org/sqlite-wasm`, `opfs-sahpool` VFS, in a dedicated worker               |
| Typed SQL / migrations | Kysely or Drizzle (choose in Phase 1 ADR) with versioned migrations                |
| Media                  | Images: OPFS files via the DB worker; resized with `OffscreenCanvas`               |
| Speech rendering       | Kokoro-82M (kokoro-js) and/or Piper (ONNX Runtime Web), decided by the voice spike |
| Speech playback        | Web Audio API from decoded `AudioBuffer`s held in memory                           |
| Fallback speech        | `speechSynthesis` (local voices only by default)                                   |
| Sync crypto            | Web Crypto: AES-GCM 256 content keys; keys wrapped per device                      |
| Backend                | ASP.NET Core on .NET 10 (LTS to Nov 2028), EF Core, PostgreSQL                     |
| AI                     | Azure OpenAI, Canada Central or East, Regional Standard deployment only            |
| Hosting                | App shell on a static host/CDN (no student data in it); API + DB in Canada Central |
| Interchange            | Open Board Format (`.obz`) plus a namespaced extension for app-specific fields     |
| Tests                  | Vitest; Playwright (WebKit + Chromium); real devices                               |

## 5. Application structure

```text
project-communicate/
├── CLAUDE.md, README.md, package.json, vite.config.ts, tsconfig.json
├── docs/                       # this spec, schema, API, security, test plan, ADRs
├── index.html                  # Phase 0: spike hub. Phase 1: the app
├── spikes/                     # Phase 0 device spikes (removed after Phase 0)
├── public/                     # icons, core board assets (precached)
├── src/
│   ├── app/                    # shell, routing, update staging, readiness check
│   ├── core/
│   │   ├── db/                 # worker, migrations, BoardStore interface + OPFS impl
│   │   ├── voice/              # VoiceOutput interface, clip player, renderers, fallbacks
│   │   ├── crypto/             # key management, envelope encryption
│   │   └── platform/           # environment, storage status, persistence request
│   ├── features/
│   │   ├── communicator/       # grid, sentence bar, navigation (NO network imports)
│   │   ├── board-builder/      # editing sessions, cell editor, render-on-save
│   │   ├── vocabulary/
│   │   ├── profiles/
│   │   ├── admin/              # PIN gate
│   │   ├── settings/
│   │   ├── versioning/         # snapshots, restore
│   │   ├── transfer/           # .obz import/export, paper twin
│   │   ├── sync/               # op log, pairing, recovery code
│   │   └── ai-assistant/
│   ├── shared/
│   └── spikes/                 # Phase 0 only
├── test/                       # Vitest
├── e2e/                        # Playwright (from Phase 1)
└── backend/                    # ASP.NET Core solution (from Phase 4)
```

## 6. Screens and navigation

Two shells, as in the native review (section 7): a communicator shell with no admin controls,
and an admin shell entered by a 3-second hold on a fixed corner control plus a PIN.

| Route (hash or path)                                                   | Shell        | Screen                                           |
| ---------------------------------------------------------------------- | ------------ | ------------------------------------------------ |
| `/`                                                                    | —            | Start-up: open DB, readiness self-test, redirect |
| `/c` , `/c/board/:id`                                                  | Communicator | Board grid + sentence bar                        |
| `/admin/unlock`                                                        | —            | PIN                                              |
| `/admin`                                                               | Admin        | Home: profiles, boards, readiness status         |
| `/admin/boards`, `/admin/boards/:id/edit`, `/admin/boards/:id/preview` | Admin        | Board Builder                                    |
| `/admin/vocabulary`                                                    | Admin        | Library                                          |
| `/admin/voice`                                                         | Admin        | Voice, rendering status, recordings              |
| `/admin/devices`                                                       | Admin        | Linked devices, pairing QR, recovery code        |
| `/admin/versions`                                                      | Admin        | Snapshots and restore                            |
| `/admin/transfer`                                                      | Admin        | `.obz` import/export, print paper twin           |
| `/admin/ai`                                                            | Admin        | AI suggestions (hidden unless enabled)           |
| `/admin/settings/*`                                                    | Admin        | Speech, accessibility, display, privacy          |
| `/about`, `/about/licences`                                            | Admin        | Attribution                                      |

The communicator never shows network messages or modal dialogs.

## 7. Data

See `DATABASE_SCHEMA.md`. Key decisions:

- Explicit `row`/`col` per cell; never reflow (ADR 0002).
- All writes through the DB worker; one transaction per saved edit session.
- Every saved change is also appended to `op_log` for sync (ADR 0005).
- Audio clips are media assets linked to vocabulary items with a hash of the text they speak, so a
  clip is re-rendered automatically when the phrase changes.

## 8. Start-up and durability

1. Service worker serves the app shell (precached). The built-in core board and its clips are part
   of the precache.
2. Open the DB worker. If OPFS is unavailable or the DB can't open, show the core board and an
   adult-visible recovery prompt — never a blank screen, never a silent in-memory fallback.
3. Run migrations (copy the DB file first), then `PRAGMA quick_check`.
4. Request persistent storage once (after install); record the result.
5. Readiness self-test daily and on admin entry: persistence, last successful sync, clip coverage,
   shell cached, free space.
6. Service worker updates are staged; applied only on admin entry or when idle on the home board.
   The previous version remains available for rollback; the server can pin a version.

## 9. Voice

- **Render on save:** when an adult saves a board, every new or changed phrase is rendered on the
  adult's device with the communicator's chosen voice and stored as a clip.
- **Playback:** clips are decoded into memory when a board opens; the board's neighbours are
  preloaded. A tap schedules playback immediately; sentences are clips played back to back.
- **Live speech** (free-typed text): on-device neural voice if the device keeps up, else system
  voice, else large-text display.
- **Recorded clips:** adults may record a phrase in a family member's voice (MediaRecorder);
  recordings take priority over rendered clips.
- **Audio session:** request `navigator.audioSession.type = "playback"` where supported.
- **Targets:** tap feedback < 100 ms; tap-to-sound < 150 ms for clips on reference devices
  (verified by the Phase 0 voice spike and by external measurement).

## 10. Sync and recovery

See ADR 0005 and `API_SPECIFICATION.md`.

- A **vault** holds one communicator's encrypted operation log and encrypted media.
- The **vault key** (AES-GCM 256) is generated on the first adult device; the server never sees it.
- **Pairing:** an existing device shows a QR containing the vault id, a one-time device token and
  the vault key, wrapped; the new device scans it. Works on the same Wi-Fi or offline-to-online.
- **Recovery code:** a printed code (in the paper twin pack) that unwraps the vault key; held by the
  family, with a second copy held by the school admin (W6).
- **Conflict rule:** per-field last-writer-wins using a hybrid logical clock; edits are adult-only
  and rarely concurrent. Layout cells are fields, so two adults editing different cells never
  conflict.
- History and drafts are never synced.

## 11. Paper twin

Each board prints as a PDF with the same grid, symbols and labels. Each page carries a QR code
containing that board's layout and labels (compressed); scanning it restores the board offline.

## 12. AI

As the native spec section 11, with these changes:

- MVP uses the Azure endpoint only (W7); on-device AI is a post-pilot experiment.
- Phrase suggestions send starter-library words only, plus words the adult explicitly ticks (D16).
- Free-text context is screened on the device against known names before sending.
- Endpoint access uses a per-school pilot key (D14) and per-device rate limits.

## 13. Accessibility

As the native spec section 14. Web specifics: real `<button>` elements, React Aria for complex
widgets, visible focus, `prefers-reduced-motion`, no essential information by colour alone,
VoiceOver/TalkBack/Switch Control testing on devices. In-app switch scanning is not in the MVP and
is not advertised.

## 14. Security

See `SECURITY.md`.

## 15. Performance targets

| Operation                                     | Target                 | Verified by                        |
| --------------------------------------------- | ---------------------- | ---------------------------------- |
| App start (cached) to usable board            | < 2 s                  | Device test                        |
| Tap visual feedback                           | < 100 ms               | Device test                        |
| Tap to sound (clip)                           | < 150 ms               | Voice spike + external measurement |
| Board navigation                              | < 200 ms               | Device test                        |
| Board save incl. render of 10 changed phrases | < 30 s on adult device | Device test                        |

Simulated or headless-browser numbers are never reported as device performance.

## 16. Implementation sequence

0. **Phase 0** — storage and voice spikes on real devices; repo, CI, docs. _Gate 0: spikes pass._
   **Release 1 (built Nov 11, 2026, ADR 0007)** — student communicator usable with no setup:
   Universal Core home board, keyboard, "My voice" strip, modeling mode, system-voice speech
   with large-text fallback, adult menu. Settings only; no student data. Released ahead of
   Phases 1–2 so teachers and students can use it while the data layer is built.
1. **Phase 1** — app shell, offline cache, DB worker + migrations, core board.
2. **Phase 2** — communicator: grid, sentence bar, clip playback, navigation.
   _Gate A: offline communication on iPad and Android._
3. **Phase 3** — Board Builder with render-on-save, photos, recordings, versions, PIN.
4. **Phase 4** — backend; encrypted sync, pairing, recovery code, readiness check.
   _Gate B: a cleared tablet fully recovers._
5. **Phase 5** — paper twin; `.obz` import/export.
6. **Phase 6** — AI suggestions (Azure, Canada).
7. **Phase 7** — hardening, accessibility, device testing. _Gate C: pilot candidate._

The product is browser-only (ADR 0007). If Gate 0 fails for storage on a platform, the response is
more frequent encrypted backup and the paper twin on that platform, not a native shell; a native
shell would need a new decision from TD.

## 17. Outstanding decisions

D2 (repository), D9 (commercial intent), D18 (reference devices), plus the Phase 1 choice of typed
SQL library (Kysely vs Drizzle), recorded as an ADR.
