# ADR 0003 — SQLite WASM in OPFS with the `opfs-sahpool` VFS

- Status: Accepted for Phase 0; confirmed or revised after Gate 0

## Context

The app needs a relational, transactional local store that survives restarts, works offline and
is the same on iPad, Android and desktop browsers.

## Decision

Use the official `@sqlite.org/sqlite-wasm` build in a dedicated worker with the `opfs-sahpool`
VFS. It works on Safari 16.4+ (reliably 17+), needs no COOP/COEP headers (so static hosting works)
and is the fastest OPFS option. One connection at a time is acceptable: the app runs in one window.

Never fall back silently to an in-memory database. If OPFS can't be opened, show the built-in
core board and an adult-visible recovery prompt.

## Consequences

- Multi-tab use of the same profile is not supported (second tab shows "already open").
- The Phase 0 storage spike measures whether this data survives on real iPads.
- Media files live in OPFS next to the database, written by the same worker.
