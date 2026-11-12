# ADR 0001 — Build web-first (PWA) instead of native Flutter

- Status: Accepted (W1, Nov 9, 2026), subject to Gate 0 spikes
- Supersedes: the Flutter / Riverpod / Drift stack in Technical Specification 1.0

## Context

The MVP must let a communicator use their boards offline at all times. A native Flutter app meets
that directly but needs a Mac, App Store distribution, a permanent app ID and per-platform voices.
A plain PWA is easier to build and distribute but depends on browser storage and browser voices,
both of which iOS can change or clear.

## Decision

Build one TypeScript web app, installed to the Home Screen, designed so no single layer is
trusted: storage is replicated (tablet, encrypted cloud, linked devices, paper twin), voice is
pre-rendered audio that travels with the board, and a core board is built into the app. Storage
and voice sit behind interfaces so a Capacitor shell can replace them without a rewrite.

## Consequences

- Encrypted sync moves into the MVP (W3).
- No Mac or Apple Developer account is needed for the pilot; schools deploy via MDM web clips.
- Two residual risks: iOS can still clear web app data; a new or cleared device needs a network
  once. Gate 0 measures the first. If it fails, the tablet ships in the Capacitor shell.
- Accessibility relies on web semantics; tested with VoiceOver, TalkBack and Switch Control.
