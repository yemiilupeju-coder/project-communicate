# Audio quality assurance

The child voices are judged by measurements from independent tools rather than by the code
that made them or by anyone's impression. Each run measures every stage audio passes through,
so a problem is traced to the stage that causes it. The runs are kept in `runs/` for before-and-after
comparison.

## The stages, and what measures each

| Stage                                                      | What can go wrong                                                                                 | Measured by                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Generation** (Kokoro, in-model child voice, `src/voice`) | roughness, buzz, noise, unnatural sound, wrong age, uneven loudness, lost accent or unclear words | `samples.ts` makes a fixed set of 8 sentences, plus 55 single words and 8 short sentences, with the app's own code; `analyze.py` and `clarity.py` measure them                       |
| **Encoding** (MP3 packs for built-in words)                | compression damage, padding, clipping after encoding                                              | `encoding.py` encodes and decodes the same sentences exactly as `scripts/voices/render.ts` does and compares with the original                                                       |
| **Storage and loading** (Cache Storage, pack download)     | corrupted or truncated clips                                                                      | `pipeline.py`: each clip the app plays is compared with what reached the speakers                                                                                                    |
| **Chunk scheduling** (`src/core/clipPlayer.ts`)            | gaps, overlaps, timing drift between joined clips                                                 | `capture.mjs` records when each clip was scheduled; `pipeline.py` finds it in the output and measures the error and the silence at each join                                         |
| **Browser playback** (Web Audio)                           | dropouts, clicks, glitches when the processor is busy, latency                                    | `capture.mjs` records the final mix sample by sample (an AudioWorklet in front of the speakers); `pipeline.py` checks each clip arrived unchanged, and measures tap-to-sound latency |
| **Fallback** (device voice)                                | the voice changing mid-session                                                                    | `capture.mjs` counts every use of `speechSynthesis`                                                                                                                                  |

## The tools

- **Praat** (via parselmouth): pitch, harmonics-to-noise ratio (HNR), jitter, shimmer. The
  standard tools of voice science.
- **ITU-R BS.1770-4 loudness** (pyloudnorm, ITU-exact filters) and 4× oversampled true peak.
- **DNSMOS** (Microsoft, CC BY 4.0): neural networks trained on many thousands of human ratings
  that predict how listeners would score speech: signal quality (SIG), background noise (BAK),
  overall (OVRL), and ITU P.808 MOS. This is the closest thing to an independent listener that
  runs offline. Download with `scripts/audio-qa/get-models.sh`.
- **Vocal-tract scale**: how far a voice's resonances sit above an adult woman's, found by
  lining up the spectral envelopes of the same sentence (vocal-tract length normalisation).
  Children aged about 7 to 10 have resonances roughly 12–30% above adult women's.
- Our own detectors, documented in `analyze.py`: clicks (lone spikes in curvature), dropouts
  (holes inside sound), flutter (loudness wobble at 30–150 Hz, heard as roughness or choppiness).

### AudioLab MCP (investigated)

[AudioLab](https://audiolab.tools) offers an MCP server (`@audiolabtools/mcp-server`) with
loudness, true-peak, voice and signal analysis. It is a thin client for a hosted API: audio is
uploaded to audiolab.tools, a key is needed (free tier: 1,000 calls a month), and it cannot be
reached from the build sandbox. Its measures overlap with ours (loudness, true peak, clipping,
speech SNR), so it is useful as a second opinion, not a replacement. To use it from Claude
Code on your own computer:

```
claude mcp add audiolab -e AUDIOLAB_API_KEY=al_live_yourkey -- npx -y @audiolabtools/mcp-server
```

then ask for `check_qc` / `analyze_voice` on the sample WAVs from `samples.ts` or on a
capture's `output.wav`. **Only ever send generated test speech. Never send recordings of
students.**

## Targets

In `scripts/audio-qa/targets.json`. The reasoning:

- **DNSMOS OVRL ≥ 3.25, SIG ≥ 3.5, BAK ≥ 3.95 (boy); OVRL ≥ 2.9, SIG ≥ 3.35, BAK ≥ 3.6 (girl)**:
  close to the adult Kokoro voices the children come from (3.07–3.41 OVRL). The girl's are lower
  since Nov 27, 2026 (ADR 0012): DNSMOS, trained on real voices, scores her higher pitch lower
  (pitch alone takes af_heart from 3.41 to 3.07), and ADR 0011's voice, which scored 3.29, is the
  one that sounded masked. Girl and boy may differ by up to 0.55 OVRL for the same reason.
- **HNR 8–17 dB, jitter 1.2–2.8%, shimmer ≤ 9%, flutter ≤ 0.1**: the texture of Kokoro's own
  untouched voice (af_heart: HNR 9 dB, shimmer 7.9%, flutter 0.07). ADR 0011's style move made
  the voices measure smoother (HNR 12–13 dB) and is the change that made them sound masked, so
  these follow the untouched voice since Nov 27, 2026. Before Nov 26 they were "smoother than
  the source" targets, which rewarded over-smoothing.
- **No clicks, dropouts or clipped samples; true peak ≤ −1 dBTP**: nothing broken, and room so
  MP3 encoding can't clip.
- **Loudness −16 LUFS ±1, spread across sentences ≤ 0.75 LU, girl and boy within 0.5 LU**:
  every word and sentence, in either voice, equally loud (−16 LUFS is the usual target for
  speech on mobile devices).
- **Child-likeness**: pitch 245–290 Hz (girl), 235–270 Hz (boy), typical of children aged about
  8 to 10. Vocal-tract scale against the voice's own table at its natural pitch (that is, the
  even lift and any change the pitch brings): 1.04–1.12 (girl), 1.00–1.08 (boy), the ranges
  tested in `research/voice-clarity`, with the boy's 1–9% below the girl's. Measures guide;
  listening decides (ADR 0012).
- **Clarity** (`clarity.py`, ADR 0012): American "r" (r_dip ≤ 0.82: F3 falls in "r" words), an
  offline recogniser picks ≥ 50% of 55 single words correctly, and sentence word error ≤ 40%.
  The recogniser is adult-trained, so the numbers are for catching regressions: ADR 0011's
  voices scored r_dip 0.88 / 0.94, 35% / 16% of words, 56% / 85% sentence error and fail all
  three; the current voices score 0.76 / 0.75, 58% / 73%, 29% / 32%.
- **Encoding**: SNR ≥ 24 dB and no measurable DNSMOS loss.
- **Playback**: no capture gaps, no device-voice fallbacks, no clicks or dropouts in the output,
  scheduling within 1 ms, every clip arriving unchanged (residual ≤ −25 dB, the floor set by the
  browser's resampling), tap-to-sound latency ≤ 100 ms (in the app; the device adds its own
  output latency), clip loudness spread ≤ 1 LU.

## Running it

```
sh scripts/audio-qa/get-models.sh
pip install -r scripts/audio-qa/requirements.txt
npm run audio-qa:samples -- /tmp/qa/run app            # the voices the app uses now
python3 -I scripts/audio-qa/encoding.py /tmp/qa/run/girl 96k > /tmp/qa/enc.json
npm run build && npx vite preview --port 4173            # in another terminal
node scripts/audio-qa/capture.mjs /tmp/qa/capture
python3 -I scripts/audio-qa/pipeline.py /tmp/qa/capture
python3 -I scripts/audio-qa/report.py <label> --samples /tmp/qa/run --encoding /tmp/qa/enc.json \
  --capture /tmp/qa/capture --compare baseline
```

(`encoding.py` output needs `"_chosen": "96k"` added, naming the bitrate in use.)

## Limits

- The capture runs in headless Chrome. It measures everything the app controls (decoding,
  scheduling, the Web Audio mix), but not a tablet's speaker or its output latency. Listening on
  a real iPad remains the last check.
- Clarity uses pocketsphinx, an older recogniser trained on adults: good at telling a regression,
  not at grading a child's voice.
- Child-likeness is measured by pitch and vocal-tract size, the two strongest cues of a child's
  voice, not by a model of perceived age (none runs offline).
- DNSMOS was trained on real and noisy speech; it is a strong proxy for how natural and clean
  speech sounds, not a certainty.
