# ADR 0012 — Child voices: untouched style, pitch in the model, one even formant lift

- Status: Accepted (Nov 27, 2026), chosen by TD from the R&D report "AAC voice quality, clarity
  and naturalness" (`research/voice-clarity`)
- Supersedes ADR 0011's style-space move. ADR 0011's in-model pitch stays.

## Context

TD found that ADR 0011's voices sounded British and "like a hollow mask" on single words. The
voice-clarity programme traced each stage of the pipeline and found the cause in the style-space
move that raised the formants:

- it removed the American "r" (F3 no longer dips: r_dip 0.73 → 0.88 girl, 0.83 → 0.94 boy);
- it bent vowels unevenly (vowel shape 0.08–0.10, against 0.03 for an even lift), so vowels moved
  towards other accents;
- an offline recogniser got 27% of single words right, against 60–75% without it.

Trimming, fades, the limiter, the int8 model, MP3 encoding (apart from its usual low-pass at
11 kHz) and the browser's rate conversion were all measured clean.

## Decision

Each voice is made in three steps (`src/voice/childVoices.ts`):

1. **Kokoro with an untouched style.** Girl: af_heart exactly. Boy: af_heart's timbre (the
   decoder half of the table) with am_puck's delivery (the prosody half), so he sounds like a boy
   speaking, not a woman (`research/child-voice/export_voices_v2.py`).
2. **Pitch set in the model**, as in ADR 0011 (girl about 280 Hz with intonation ×1.1, boy about
   260 Hz, speed 0.9).
3. **One even formant lift** (`src/voice/envelopeLift.ts`): the spectral envelope (cepstral
   smoothing, 2.2 ms lifter) is stretched up the frequency axis by one factor, harmonics and phase
   kept, gain limited to ±15 dB and faded out above 9–10.5 kHz. Girl ×1.07, boy ×1.04 (tested
   ranges: girl 1.07–1.10, boy 1.00–1.07). An even lift keeps vowel identity and the "r".

Then trimming, fades and loudness as before. The model is unchanged; devices fetch the two new
522 KB tables and the new packs.

## Consequences

- American "r" and vowels are back; the voices are as child-like as before by pitch, and a
  little less by vocal-tract size (formants +7% / +4% instead of +14% / +27%). Listening decides
  whether to move along the tested ranges; each step is one number in `childVoices.ts`.
- DNSMOS (a clean-speech score trained on real voices) rates the girl lower than ADR 0011's
  voice (2.96 against 3.29). Most of that comes from the higher pitch itself (pitch alone: 3.07),
  and the style move that scored higher is what made the voice sound masked. The QA targets for
  naturalness measures now follow Kokoro's own untouched voice (see `docs/audio-qa/README.md`).
- The lift adds about 45 ms per second of speech on a device; clips are still made in a few
  seconds.
- New regression checks: `test/envelopeLift.test.ts` (the lift moves formants and keeps pitch),
  and `scripts/audio-qa/clarity.py` (American "r" and word recognition), with targets that fail
  ADR 0011's voices.
- No child recordings used; text-to-speech only.
