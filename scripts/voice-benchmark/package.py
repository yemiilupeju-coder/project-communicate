"""Prepares benchmark samples for listening: every file set to the same loudness
(-20 LUFS, ITU-R BS.1770) by gain alone, no compression or limiting, so each
voice keeps its own dynamics. Gain is lowered for a file only if its true peak
would pass -1 dBTP.

  python3 -I scripts/voice-benchmark/package.py <samples-dir> <out-dir>

Writes <out-dir>/<variant>/<item>.wav (16-bit, each voice's own sample rate).
"""

from __future__ import annotations

import os
import sys

import numpy as np
import pyloudnorm
from scipy.io import wavfile
from scipy.signal import resample_poly

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio-qa"))
from analyze import read  # noqa: E402

TARGET = -20.0
CEILING = -1.0


def match(x: np.ndarray, sr: int) -> np.ndarray:
    padded = np.concatenate([x, np.zeros(max(0, int(0.5 * sr) - len(x)))])
    lufs = pyloudnorm.Meter(sr, filter_class="DeMan").integrated_loudness(padded)
    gain = 10 ** ((TARGET - lufs) / 20) if np.isfinite(lufs) else 1.0
    tp = np.abs(resample_poly(x, 4, 1)).max() * gain
    if tp > 10 ** (CEILING / 20):
        gain *= 10 ** (CEILING / 20) / tp
    return x * gain


def main() -> None:
    src, out = sys.argv[1], sys.argv[2]
    for variant in sorted(os.listdir(src)):
        d = os.path.join(src, variant)
        if not os.path.isdir(d):
            continue
        os.makedirs(os.path.join(out, variant), exist_ok=True)
        for f in sorted(os.listdir(d)):
            if f.endswith(".wav"):
                x, sr = read(os.path.join(d, f))
                y = match(x, sr)
                wavfile.write(os.path.join(out, variant, f), sr, (np.clip(y, -1, 1) * 32767).astype(np.int16))
        print(variant)


if __name__ == "__main__":
    main()
