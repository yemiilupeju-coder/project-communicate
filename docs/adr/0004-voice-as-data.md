# ADR 0004 — Voice as data: pre-rendered clips, neural voice, fallbacks

- Status: Accepted (W4, Nov 9, 2026); engine chosen after the voice spike

## Context

Safari's speech API exposes a changing and sometimes reduced set of voices, and each OS has
different voices, so the same board sounds different on each device. AAC vocabulary is known in
advance: every button's phrase is fixed when an adult saves the board.

## Decision

Render each phrase to an audio clip when the board is saved, on the adult's device, using an open
neural voice that runs in the browser (Kokoro-82M or Piper). Store clips with the board, sync them
like photos, and play them through Web Audio from decoded buffers. Family recordings are
first-class and take priority. Free-typed text uses the same neural voice live when the device
keeps up, else the system voice, else a large-text display.

## Consequences

- The communicator's voice is identical across iPad, Android and Chromebook.
- Adult devices download a 60–90 MB voice model once.
- Clips must be re-rendered when the phrase changes (tracked by a text hash).
- Voice licences: Kokoro is Apache 2.0; Piper voices vary by voice and must be checked per voice
  before shipping.

## Update — Nov 25, 2026: child voice packs for the built-in vocabulary

- Families asked for a child's voice. Device voices raised in pitch sounded artificial, so the
  built-in vocabulary (every word, phrase and word form; about 1,000 clips) is now pre-rendered in
  a girl's and a boy's voice and shipped as two packs (`public/voices/`).
- Each voice is an open Kokoro-82M voice reshaped into a child's: formants raised (a shorter vocal
  tract), a higher and livelier pitch, and a slightly slower pace (Praat "Change gender"). Chosen
  by TD from listening samples: girl from `af_bella`, boy from `am_michael`
  (`src/voice/childVoices.ts` holds the exact settings).
- A pack is downloaded once when an adult picks it, kept in cache storage, and works offline.
  Messages play as the longest known phrases; if any word has no clip, the whole message uses the
  device voice at a matching pitch, so the voice never switches mid-sentence.
- `test/voicePack.test.ts` fails if a built-in word has no clip, so new vocabulary can't ship
  silent: run `npm run voices:texts && npm run voices:render`.

## Update — Nov 25, 2026: the child voice on the device

- Words added for one student, and words typed on the keyboard, are now said in the same child
  voice. An adult downloads the "voice maker" once (Adult menu → Voice, about 114 MB); after that,
  each new word's clip is made on the device in a Web Worker, saved in cache storage, and works
  offline. Nothing is sent to a server, so no student data leaves the device.
- The build and the device run the same TypeScript (`src/voice/`): Kokoro-82M int8 through
  onnxruntime (node for the build, web for devices), then the reshaping (a port of Praat's
  "Change gender": pitch tracking, resampling and PSOLA). Built-in and on-device clips match.
- Pronunciation uses misaki's US English dictionaries (Apache 2.0, ~182,000 words, the ones
  Kokoro was trained with) and a port of misaki's rules (`src/voice/g2p.ts`); it matches
  misaki's own output on 1,001 of the 1,013 built-in phrases (the rest are words misaki can't
  say without a fallback). We do not use eSpeak NG: it is GPL-3.0, which we won't ship to
  schools' devices. Words in no dictionary (often names) get a pronunciation from spelling
  rules; an adult can fix one by typing how it sounds in the word's "Spoken as" box.
- The model is split into parts under 25 MB (the host's file limit). It is only downloaded when
  an adult asks; until it is saved, unknown words use the device voice as before.
- While a new word's clip is being made (a few seconds), the message waits up to 5 seconds, then
  falls back to the device voice; the clip is ready next time.
- Change `VOICE_VERSION` (`src/voice/childVoices.ts`) whenever the model, dictionary or reshaping
  changes: devices then make their clips again, and the build re-renders the packs.

## Update — Nov 26, 2026: whole sentences

- Joined word clips sound like a list: each word was said on its own, so each ends with a
  falling pitch. With the voice maker downloaded, a sentence is now said in one go, with the
  natural rise and fall of speech.
- Speak never waits long: if the whole sentence isn't ready within 0.5 s, the words play
  joined at once and the sentence is finished and saved for next time. While a student pauses
  building a sentence, it is made ahead of Speak (kept in memory unless said). Saved sentences
  are made in the background. Up to 300 said sentences are kept per device; the oldest go first.
- The voice maker does one thing at a time (`src/voice/jobQueue.ts`): Speak first, then the
  sentence being built (only the newest guess), then background work.
- Joined words are tighter for everyone, with or without the voice maker: the silence around
  each clip (padding, and MP3 decoding) is trimmed and the gap between words is 35 ms.

## Update — Nov 26, 2026 (later): seamless sentences, smoother voices

- Speak now waits up to 1.5 s for a new sentence when the device should have it ready by then
  (it learns how fast it is); only slower devices hear joined words first. Sentences being built
  are made after a 0.3 s pause.
- The voice maker stays loaded while the app is open (let go after 2 minutes in the
  background), and loads as soon as the app starts, so the first sentence isn't slowed by it.
- The site is cross-origin isolated (`public/_headers`: COOP `same-origin`, COEP
  `require-corp`), which lets the engine use up to 4 threads: about twice as fast. The engine's
  helper threads start from `voice-model/ort-wasm-simd-threaded.mjs` (precached). If the engine
  can't start with threads on a device, it starts again with one. The app loads nothing from
  other sites; the old voice spike pages that fetch models from other hosts may no longer work.
- Smoother child voices: pitch is measured between samples, its frame-to-frame wobble is
  smoothed (50 ms, in octaves), and the reshaped periods are placed between samples too. Jitter
  fell by about a quarter and the girl's harmonics-to-noise ratio rose from 14.7 to 16.2 dB.
  `VOICE_VERSION` is `k82m-int8-misaki-r2`, so devices make their clips again.

## Update — Nov 26, 2026 (evening): why the voices sounded choppy, and the fix

Measured on the same sentences (Praat: harmonics-to-noise ratio, cycle-to-cycle jitter, and
"flutter", the share of loudness changes at 30–150 Hz):

- The playback path was not the cause: whole sentences play as one clip, with no clicks or
  dropouts inside (now checked in `e2e/device-voice-smoke.mjs`).
- Root cause 1, the reshaping: to raise the pitch, PSOLA used the nearest original period for
  each new one, so some periods were repeated and others skipped. The bigger the pitch change,
  the stronger that repeat-skip pattern, heard as a rough, choppy flutter. Now each new period
  blends the two original periods around it, and breath and hiss (which have no periods) are
  taken from exactly where we are instead of repeating 10 ms pieces. Boy (same base voice):
  jitter 2.6% → 1.2%, flutter 0.136 → 0.089; girl: jitter 1.9% → 1.2%, HNR 14.2 → 16.9 dB.
- Root cause 2, the boy's base voice: `am_michael` is the roughest of Kokoro's US voices (jitter
  3.4%, HNR 8.9 dB, creaky) and, being low, needed the biggest change (pitch ×2.2). The boy now
  starts from `am_eric` (higher and smoother): flutter 0.019, jitter 1.15%, HNR 16.7 dB.
- Making clips leaves one processor core free and waits while audio plays, so it can't starve
  playback on a busy tablet.
- `VOICE_VERSION` is `k82m-int8-misaki-r3`; packs re-rendered. Devices that already have the
  voice maker fetch the new voice table (0.5 MB) by themselves.

## Update — Nov 26, 2026 (night): measured, not judged by ear

An independent audio-QA process now guides the voices (`docs/audio-qa/`, `scripts/audio-qa/`):
Praat voice measures, ITU-R BS.1770 loudness, Microsoft's DNSMOS (a neural predictor of human
quality ratings), and a capture of what the running app actually plays, sample by sample, to
separate generation, encoding, scheduling and browser-playback problems. Targets are in
`scripts/audio-qa/targets.json`; runs are compared before and after.

What the baseline found, and the fixes:

- Generation: neither voice sounded young enough (vocal-tract scale 1.15 girl, 1.09 boy,
  against 1.12–1.30 for children), the girl's base voice (`af_bella`) reshaped poorly (DNSMOS
  OVRL 2.9), and loudness varied by 1–1.6 LU between sentences and 1.3 LU between the voices.
  Now: girl from `af_nova` (formants +26%, 285 Hz), boy from `af_kore` (+16%, 250 Hz), the two
  Kokoro voices that measured cleanest after reshaping; every clip is set to −16 LUFS with a
  gentle peak limiter (`src/voice/loudness.ts`) instead of to a fixed peak.
- Encoding: 48 kbps MP3 cost 5 dB of SNR; packs are now 96 kbps.
- Playback: clips arrived bit-exact and on time, but three were glitched while the voice maker
  was making a sentence at the same moment (the processor was busy). The sentence is now made
  after the joined words finish playing, and the engine leaves two cores free.

## Update — Nov 26, 2026: child voices generated, not reshaped

- The reshaping above is replaced: the child voices are now generated inside Kokoro (pitch set in
  the model, vocal tract set by a learned style move). Girl from `af_heart`, boy from `am_puck`.
  See ADR 0011.

## Update — Nov 27, 2026: style move removed

- The learned style move made single words sound British and muffled. The voices now use
  untouched styles (girl `af_heart`; boy `af_heart`'s timbre with `am_puck`'s delivery), pitch set
  in the model, and one even formant lift (`src/voice/envelopeLift.ts`). See ADR 0012.

## Update — Nov 27, 2026 (later): sentences are never said flat

- Speak used to wait for a new sentence only when it expected it within 1.5 s; otherwise it said
  the words joined first, which sounds flat. That happened every time the app had just opened
  (before it had timed itself) and after each voice update (saved sentences are remade in the new
  voice). Now Speak always waits for the whole sentence when the device has the voice maker, up
  to 10 s; only a device that can't make it in that time hears joined words. A second tap while
  it is being made doesn't say it twice. Without the voice maker, sentences are still joined from
  word clips. Tested in `e2e/device-voice-smoke.mjs`, including right after the app opens.
