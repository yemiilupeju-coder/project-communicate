# ADR 0011 — Child voices generated inside the model, not reshaped

- Status: Accepted (Nov 26, 2026), after TD's blind listening of experiments 1–6. The style move
  ("Vocal tract" below) is superseded by ADR 0012 (Nov 27, 2026); the in-model pitch stays.
- Supersedes the reshaping described in ADR 0004's Nov 25 update

## Context

The girl and boy voices were adult Kokoro voices reshaped afterwards (PSOLA pitch shift and
resampled formants). Listeners found them over-processed, artificially pitched up and dull. The
R&D programme (`research/child-voice`, report: "Synthetic child voices: R&D report") compared
six approaches on one script and the same source voices: PSOLA, the WORLD vocoder, the
Childrenize method, neural voice conversion (not runnable: no licensed child target, weights
blocked), age-conditioned generation inside Kokoro, and a hybrid. Experiment 5 won.

## Decision

Generate the child voices with Kokoro's own neural decoder and nothing after it except trimming,
fades and loudness:

- **Pitch** is set inside the model. The app's model is Kokoro-82M int8 with ten added graph
  operations (`research/child-voice/make_pitch_model.py`) that rescale the predicted pitch curve
  (`f0_scale`, `f0_range`, `f0_ref`) before the decoder uses it.
- **Vocal tract** is set by the voice's style table: the timbre is moved along a direction learned
  from Kokoro's 54 voices that raises the formants, with brightness held by a second direction.
- **Each voice** is a 522 KB style table plus four numbers (`src/voice/childVoices.ts`),
  calibrated by measurement on the int8 model (`research/child-voice/export_voices.py`):
  - girl: af_heart, formants +14%, about 262 Hz, intonation range ×1.1, speed 0.9;
  - boy: am_puck (a man's voice), formants +27%, about 244 Hz, speed 0.9.
- Model parts and voice tables are named by their content hash, so devices fetch changes.

## Consequences

- No reshaping step: clips are generated as fast as before, and consonants are not smeared.
- Built-in packs, on-device words, typed text and whole sentences all come from the same
  generator, so they sound the same, offline.
- Devices that downloaded the old model fetch the new one (≈ 92 MB) automatically when online;
  old files are deleted afterwards.
- Every model run must pass the pitch inputs (`kokoroFeeds` in `src/voice/kokoro.ts`).
- No child recordings were used; everything derives from Apache-2.0 Kokoro. The capability stays
  text-to-speech only: no live speech-to-child-voice conversion.
- Output is 24 kHz (Kokoro's rate). More crispness would need a different decoder.
- Regression: `test/childVoiceModel.test.ts` checks pitch, determinism, loudness and closeness
  to reference samples (`test/fixtures/child-voices`). A deliberate voice change means remaking
  the references (see the test's header) and listening to them first.
