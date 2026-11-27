# Child voices: diagnostic report, Nov 26, 2026

How the girl's and boy's voices were measured, what was wrong, at which stage, what was
changed, and the result. Method and targets: [README.md](README.md). Raw runs: [runs/](runs/).

**Result: 18 of 35 voice and encoding targets met before, 35 of 35 after; playback 6 of 10
before, 10 of 10 after (45 of 45 in all).**

## 1. Generation (the voice maker)

| Measure                                   | Target                        | Girl before | Girl after | Boy before | Boy after |
| ----------------------------------------- | ----------------------------- | ----------- | ---------- | ---------- | --------- |
| DNSMOS overall (predicted listener score) | ≥ 3.25                        | 2.90        | 3.37       | 3.17       | 3.37      |
| DNSMOS speech signal                      | ≥ 3.5                         | 3.25        | 3.65       | 3.42       | 3.63      |
| DNSMOS background (noise)                 | ≥ 3.95                        | 3.83        | 4.07       | 4.04       | 4.11      |
| Harmonics-to-noise ratio (dB)             | ≥ 16                          | 15.0        | 17.4       | 16.5       | 17.5      |
| Jitter (%)                                | ≤ 1.5                         | 1.58        | 1.25       | 1.47       | 1.44      |
| Shimmer (%)                               | ≤ 6                           | 6.58        | 4.09       | 5.37       | 5.21      |
| Loudness (LUFS)                           | −17 to −15                    | −16.7       | −16.2      | −15.4      | −16.1     |
| Loudness spread between sentences (LU)    | ≤ 0.75                        | 1.58        | 0.22       | 1.04       | 0.14      |
| True peak (dBTP)                          | ≤ −1                          | −0.78       | −1.86      | −0.82      | −2.41     |
| Pitch (Hz)                                | girl 260–300, boy 230–265     | 284         | 284        | 251        | 251       |
| Vocal-tract scale (vs adult woman)        | girl 1.18–1.30, boy 1.12–1.22 | 1.15        | 1.26       | 1.09       | 1.15      |

Girl and boy together: loudness difference 1.27 → 0.18 LU (target ≤ 0.5); quality difference
0.26 → 0.005 (≤ 0.15); boy's resonances 5.6% → 8.5% below the girl's (2–9%).

**Diagnosis.**

1. _Not young enough._ The pitch was child-like, but the resonances (vocal-tract size) were
   not: the boy measured 1.09× an adult woman's, an adult woman's or teenager's, and the girl
   1.15×, at the edge. The boy was made from a man's voice, which needs a very large change to
   reach a child's.
2. _The girl's base voice reshapes poorly._ Of 20 Kokoro US voices measured raw and reshaped,
   `af_bella` scored lowest after reshaping (DNSMOS 2.95–2.98 at any setting). `af_nova` and
   `af_kore` scored highest (3.3–3.4).
3. _Uneven loudness._ Clips were set to the same peak, not the same loudness, so loudness
   varied 1–1.6 LU between sentences and the boy was 1.3 LU louder than the girl.

**Fixes.** Girl from `af_nova`, resonances +26%, 285 Hz; boy from `af_kore`, +16%, 250 Hz
(boys' vocal tracts are slightly longer than girls'; before puberty their voices otherwise
differ little). Every clip is set to −16 LUFS (ITU-R BS.1770, verified against pyloudnorm
to 0.01 LU) with a 3 ms look-ahead peak limiter at −1.5 dBTP (`src/voice/loudness.ts`).

## 2. Encoding (MP3 packs of built-in words)

| Measure                     | Target  | 48 kbps (before) | 96 kbps (after) |
| --------------------------- | ------- | ---------------- | --------------- |
| Signal-to-noise vs original | ≥ 24 dB | 21.0             | 25.8            |
| DNSMOS lost to encoding     | ≤ 0.05  | none             | none            |

48 kbps was the weakest link in the chain for built-in words. 96 kbps is where gains level off
(128 kbps: 25.9 dB). Packs are 9.1 MB (girl) and 7.7 MB (boy).

## 3. Scheduling, buffering and browser playback

Captured sample by sample from the running app (61 s: words tapped one by one, Speak twice,
a phrase, a typed sentence, in both voices; 26 clips).

| Measure                                   | Target   | Before   | After    |
| ----------------------------------------- | -------- | -------- | -------- |
| Clips arriving unchanged (worst residual) | ≤ −25 dB | −19.5 dB | −222 dB  |
| Clicks in the output                      | 0        | 1        | 0        |
| Dropouts                                  | 0        | 0        | 0        |
| Scheduling error                          | ≤ 1 ms   | 0.02 ms  | 0 ms     |
| Tap-to-sound latency (in the app)         | ≤ 100 ms | 22–37 ms | 22–37 ms |
| Loudness spread between clips             | ≤ 1 LU   | 1.96     | 0.73     |
| Girl/boy loudness difference              | ≤ 0.5 LU | 2.22     | 0.31     |
| Device voice used                         | 0        | 0        | 0        |

**Diagnosis.** Scheduling and buffering were sound (no gaps, no dropouts, timing exact). Two
browser-playback problems changed the sound:

1. _Clips made on the device (24 kHz) were converted to the speakers' rate by the browser._
   Chrome does this by straight-line interpolation; the same clip rendered offline by Chrome
   showed the same artefacts (so: deterministic, not a timing glitch), and our detector found
   clicks in 3 of 3 whole sentences. **Fix:** the app converts them itself with a windowed-sinc
   polyphase filter (`src/core/rateConvert.ts`, > 60 dB SNR in tests).
2. _Joined clips were started between samples_ (35 ms gaps are 1,543.5 samples at 44.1 kHz), so
   the browser shifted each one by interpolation, dulling it (residual −19.5 to −27 dB, every
   time, in the same clips). **Fix:** start times are rounded to whole samples.

Along the way, a hypothesis that the voice maker's processor load glitched playback was tested
and **rejected**: the evidence turned out to be the two deterministic problems above, and the
mitigation tried for it (stopping background work during playback) made whole sentences rarer
without measurable benefit, so it was removed. The AudioContext now asks for "balanced" latency
(a little more buffering), which costs nothing measurable.

## What the measurements can't yet say

- The capture runs in headless Chrome on a 2-core machine. It covers decoding, conversion,
  scheduling and the Web Audio mix, but not an iPad's speaker or Safari's own resampling. One
  listen on a school iPad is still worth doing.
- On this machine a brand-new sentence was still said as joined words the first time (the
  voice maker takes about 2 s here; Speak waits at most 1.5 s), then whole after that. Faster
  devices will hear whole sentences the first time more often.
- "Sounds like a child" is measured by pitch and vocal-tract size; no offline model of
  perceived age exists to check it independently.
