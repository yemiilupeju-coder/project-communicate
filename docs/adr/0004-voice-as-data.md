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
  voice. An adult downloads the "voice maker" once (Adult menu → Voice, about 112 MB); after that,
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
