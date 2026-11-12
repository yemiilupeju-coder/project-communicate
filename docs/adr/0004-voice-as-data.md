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
