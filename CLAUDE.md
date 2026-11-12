# CLAUDE.md

# Project Communicate — Engineering Instructions

## Project Overview

Project Communicate is an offline-first AAC communication application, built web-first as a
Progressive Web App (PWA) for iPads, Android tablets and Chromebooks.

It enables individuals to communicate using picture-based and text-based boards, sentence
construction, and speech output.

The application includes an adult-facing board editor, encrypted backup and sync between linked
devices, and optional AI-assisted vocabulary suggestions.

Approved direction (November 9, 2026): web-first, per
`docs/TECHNICAL_SPECIFICATION.md` and `docs/adr/0001-web-first-pwa.md`. A native shell
(Capacitor) is an optional deployment target, not the architecture.

## Mandatory Documentation

Before implementing any feature, read:

- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/TECHNICAL_SPECIFICATION.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/API_SPECIFICATION.md`
- `docs/SECURITY.md`
- `docs/TEST_PLAN.md`
- `docs/adr/` (architecture decisions)

If a document does not exist, create it from the approved technical specification before
proceeding with implementation.

## Current Phase

Release 1: the student communicator at the site root (`index.html`, `src/app`, `src/core`,
`src/features`), see `docs/adr/0007-release-1-student-communicator.md`. It is browser-only: no
native shell, no OS-specific code paths beyond feature detection.

Phase 0 device spikes remain at `/spikes/` until real-device results are in. Spike code is
throwaway-quality by design but must still be honest: never fall back silently, never report a
result that wasn't measured.

Communicator rules added in Release 1:

- Board positions are permanent. `test/communicatorVocabulary.test.ts` pins anchor words; changing
  a position is a product decision, not a refactor.
- Modeling never changes the student's message.
- If speech can't play, show the words large. Never fail silently on a whole-message speak.
- Pure logic lives in `src/core` with unit tests; components stay thin.

Release 2 (ADR 0008): topic boards, word endings, profiles, editor, PIN, backup.

- `test/vocabulary.lock.json` pins every released topic word and folder. Adding words is fine;
  editing the lock file is a product decision that must be called out in the commit message.
- Adults only add words in empty places or hide words. Code must never re-pack or re-sort cells.
- New vocabulary needs a research basis noted in `topics.ts` (`basis`) and ADR 0008.
- Symbols: exact OpenMoji name matches or a reviewed choice in `scripts/symbol-choices.json`;
  "-" (text only) beats a misleading picture. Private body-part words stay text-only.
- Everything personal stays behind `AppStore` (IndexedDB now, SQLite/OPFS later).

## Technology Stack

App:

- TypeScript (strict)
- React 19 (+ React Aria components for accessible primitives, from Phase 1)
- Vite + vite-plugin-pwa (Workbox service worker)
- SQLite WASM (`@sqlite.org/sqlite-wasm`, `opfs-sahpool` VFS) in a dedicated worker
- Web Audio for clip playback; Kokoro / Piper (ONNX Runtime Web) for rendering speech
- Web Crypto (AES-GCM) for end-to-end encrypted sync
- Vitest (unit), Playwright (browser), real-device testing

Backend (from Phase 4):

- ASP.NET Core, .NET 10
- Entity Framework Core
- PostgreSQL (Canada Central)
- Azure OpenAI, Regional Standard deployment in Canada

Do not change the approved technology stack without explaining the reason and requesting approval.

## Architecture Rules

- Feature-first folders under `src/features/` (from Phase 1).
- Separate presentation, application, domain, and data layers.
- Storage and voice sit behind interfaces (`BoardStore`, `VoiceOutput`) so the native shell can
  swap implementations.
- All database access happens in the database worker; UI code never touches SQLite directly.
- Implement versioned database migrations.
- The communicator screen must not import any network code. Only `src/features/sync` and
  `src/features/ai-assistant` may call `fetch`.
- Keep AI functionality separate from core communication functionality.
- Service worker updates are never applied automatically during communication.

## Non-Negotiable Product Rules

1. Core communication must work offline.
2. Existing vocabulary must never be automatically rearranged.
3. AI suggestions require human approval.
4. AI must never infer or speak on behalf of a communicator.
5. Communication configurations must persist locally.
6. Existing configurations must not be overwritten without confirmation.
7. Student personal information must not be sent to AI.
8. Core communication must not depend on authentication or cloud services.
9. No advertising or behavioural tracking.
10. Never claim a feature works unless it has been implemented and tested.
11. The app must always open to at least the built-in core board, even with no saved data.
12. The sync server only ever receives ciphertext.

## Code Quality

- `strict` TypeScript; no `any` unless explicitly justified in a comment.
- Prefer small, single-purpose modules.
- Use descriptive names.
- Avoid unnecessary abstractions.
- Do not duplicate business logic.
- Handle errors explicitly; never swallow them silently.
- Avoid hardcoded credentials. Keep secrets out of source control.
- Format with Prettier.

## Testing

Every new feature must include appropriate tests.

Before completing a task:

1. `npm run format:check`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. Browser smoke test of affected pages where possible.
6. Backend tests when applicable (`dotnet test`).
7. Report failures honestly, and say what was NOT verified (e.g. real-device behaviour).

Do not remove or weaken tests to make a build pass.

## Design Guidelines

The interface must be:

- Calm.
- Accessible.
- Predictable.
- Friendly.
- Simple.
- Consistent.

Communication buttons must have clear labels and touch targets of at least 48 px.

Avoid unnecessary animation, visual clutter, and unexpected changes. Respect
`prefers-reduced-motion`.

Preserve consistent vocabulary positions (explicit row/column; see ADR 0002).

## Privacy and Security

- Collect minimal data.
- Avoid logging personal information (labels, phrases, names, file names).
- Validate imported configurations.
- Keep API credentials on the backend.
- Never expose AI provider keys.
- Do not transmit student data without an approved privacy design.
- Do not use real student data during development.

## Git Practices

- Use descriptive branches.
- Make small, logical commits.
- Do not commit secrets.
- Do not force-push.
- Keep the main branch buildable.

## Working Method

Before writing code:

1. Read the relevant specifications.
2. Inspect the existing repository.
3. Identify the exact feature being implemented.
4. Describe the files that need to change.
5. Explain the implementation approach.
6. Identify potential regressions.
7. Identify required tests.

Implement one logical feature at a time.

Do not generate the entire application in one enormous implementation pass.

After implementation, report:

- Files created.
- Files modified.
- Features implemented.
- Tests executed.
- Test results.
- Outstanding issues.
- Next recommended task.

If a requirement is ambiguous, identify the ambiguity and propose a decision instead of silently
inventing a requirement.

## Final Rule

The quality of the communication experience is more important than the number of features
delivered.

Never compromise communication reliability, user autonomy, accessibility, or privacy to accelerate
development.
