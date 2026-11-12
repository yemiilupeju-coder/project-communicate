# Test Plan

## Levels

| Level   | Tool                               | Runs where                   | What                                                            |
| ------- | ---------------------------------- | ---------------------------- | --------------------------------------------------------------- |
| Unit    | Vitest                             | CI, any machine              | Pure logic: integrity, stats, schemas, op-log merge, validators |
| Browser | Playwright (Chromium + WebKit)     | CI from Phase 1              | Pages, DB worker, service worker, offline reload                |
| Device  | Manual protocol + exported reports | Real iPad and Android tablet | Storage durability, audio latency, accessibility, install       |

Headless or simulator numbers are never reported as device performance.

## Phase 0 — Gate 0

### Storage spike (`/spikes/storage/`)

Pass when, on a real iPad (iPadOS 17+) opened from the Home Screen, every launch row shows
integrity OK and no drop in record count across:

1. App swiped away and reopened.
2. Device restart.
3. Offline launch (Airplane Mode) — the page itself must load.
4. 8+ days without opening the app while Safari is used normally.
5. Device storage under 1 GB free, then reopened.
6. An iPadOS update.

Also record: whether `persist()` was granted, and whether localStorage / IndexedDB / Cache
canaries survived (to learn what the browser clears). Repeat steps 1–3 on an Android tablet.

**Fail** = any launch with fewer records than the previous launch, or integrity FAILED, without
the user having cleared website data. A failure triggers the Capacitor-shell fallback for the
tablet (spec section 16).

### Voice spike (`/spikes/voice/`)

1. Load Kokoro (and Piper) on a laptop and on the iPad; record load time and backend.
2. Render all 200 phrases; record render time per clip (median, p95) on each device.
3. On the iPad: tap 30 single clips and 10 sentences online; then Airplane Mode, swipe away,
   reopen, repeat.
4. Compare the system voice on the same phrases.
5. External check: film 10 taps at 240 fps; count frames from finger contact to the start of the
   audio waveform (use the video's audio track). This is the ground-truth latency.

**Pass:** clips play offline after relaunch; external tap-to-sound median < 150 ms; quality judged
acceptable by at least one SLP and one AAC user (or family) listening blind to Kokoro, Piper and
the system voice.

The in-app latency figure is an estimate (event-to-schedule time plus the browser's reported
output latency); Safari may report 0 output latency, so the external check is required.

## Phase 1+ (outline)

Carried over from Technical Specification 1.0 section 17 (unit, widget→component, integration,
security, platform matrix), adapted: component tests with Vitest + Testing Library; offline and
persistence flows in Playwright; the platform matrix covers iPad (Safari web app), Android
(Chrome PWA), Chromebook.

## Verified so far (Phase 0, Nov 9, 2026)

- Unit tests: 22 passing (integrity, stats, vocabulary, report format, progress parsing).
- Headless Chrome 153 smoke test: storage spike opens SQLite 3.54.1 in OPFS (`opfs-sahpool`),
  writes 500 records + 1 MB, verifies every byte, survives reload with launch history; voice spike
  stores and plays synthetic clips, plays a four-clip sentence, reloads offline from the service
  worker and plays again.
- **Not yet verified:** anything on a real iPad or Android tablet; Kokoro/Piper model download and
  rendering (model hosts are not reachable from the build workspace).

## Release 1 — student communicator

Automated (CI): `test/message.test.ts`, `settings.test.ts`, `repeatGuard.test.ts`,
`communicatorVocabulary.test.ts` (36 Universal Core words, unique in-bounds positions, pinned
anchor words, symbols present, keyboards with all letters and no overlapping keys, shared keys in
the same place on both layouts).

Real-device checks (each on iPad Safari home-screen app, Chromebook Chrome, Android Chrome):

1. Install, open once online, then turn on airplane mode and relaunch: the board appears.
2. Tap I → want → more: each word speaks; Speak says "I want more".
3. Turn the ring/silent switch on (iPad): speech still plays.
4. Tap the same word twice fast: it is added once.
5. Keyboard: type "cookie?" and Speak; space speaks the finished word.
6. "My voice" strip phrases speak at once and don't change the message.
7. Hold "Adults" 1 s: nothing. Hold 3 s: menu opens. With a keyboard or switch, hold Enter.
8. Modeling mode: tapped words light up and speak; the message doesn't change.
9. Change voice, speed, high contrast, symbols, ABC layout; relaunch: all kept.
10. Rotate the device: no board word changes place.
11. VoiceOver / TalkBack: every button reads its word; the message reads as one phrase.
12. A student or AAC user and an SLP try it and say what's missing (record, don't fix on the spot).

## Verified so far (Release 1, Nov 11, 2026)

- Unit tests: 50 passing (Phase 0's 22 plus 28 for Release 1).
- Headless Chrome smoke test under `/project-communicate/`: 36 words and their symbols render;
  "I want more" builds; repeat guard drops a double tap; keyboard typing with punctuation;
  rail buttons keep their place between pages; whole-message speak shows the large-text fallback
  when the browser has no voices; 1-second hold doesn't open the adult menu, 3-second hold does;
  high contrast, modeling and ABC layout work and persist across reload; the app and symbols load
  offline; no console errors or failed requests.
- **Not yet verified:** real speech output (the test browser has no voices), any real device,
  screen readers, switch access.
