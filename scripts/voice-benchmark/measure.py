"""Objective measures for every variant in a benchmark folder.

  python3 -I scripts/voice-benchmark/measure.py <samples-dir> > measures.json

Per variant: DNSMOS (all items joined), Praat voice measures on the narration
(where they are valid: long voiced stretches), pitch and how far it was moved,
bandwidth and high-frequency content (crispness), speaking rate, loudness, peaks.
These describe; they don't decide. The listening test decides.
"""

from __future__ import annotations

import glob
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio-qa"))
from analyze import clicks, db, dnsmos, read, signal_metrics, voice_metrics  # noqa: E402

NARRATION_WORDS = len(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "script.json")))["narration"].split())


def spectrum_measures(x: np.ndarray, sr: int) -> dict:
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / sr)
    total = spec.sum()
    cum = np.cumsum(spec) / total
    band = lambda lo, hi: float(spec[(f >= lo) & (f < hi)].sum() / total)  # noqa: E731
    # Highest frequency with content within 50 dB of the strongest (smoothed)
    sm = np.convolve(spec, np.ones(400) / 400, mode="same")
    sm_db = 10 * np.log10(sm / sm.max() + 1e-20)
    top = float(f[np.where(sm_db > -50)[0].max()])
    return {
        "rolloff_99_hz": float(f[np.searchsorted(cum, 0.99)]),
        "bandwidth_hz": top,
        "energy_4_8k_pct": 100 * band(4000, 8000),
        "energy_8k_up_pct": 100 * band(8000, sr / 2),
        "spectral_centroid_hz": float((f * spec).sum() / total),
    }


def measure(folder: str) -> dict:
    files = sorted(glob.glob(os.path.join(folder, "*.wav")))
    items = [f for f in files if "assembled" not in f]
    xs = []
    sr = 24000
    for f in items:
        x, sr = read(f)
        xs += [x, np.zeros(int(0.3 * sr))]
    allx = np.concatenate(xs)
    narr = os.path.join(folder, "4-narration.wav")
    nx, nsr = read(narr)
    v = voice_metrics(narr)
    s = signal_metrics(nx, nsr)
    settings = json.load(open(os.path.join(folder, "settings.json"))) if os.path.exists(os.path.join(folder, "settings.json")) else {}
    applied = settings.get("applied") or {}
    src = settings.get("sourceF0")
    out = {
        **dnsmos(allx, sr),
        "hnr_db": v["hnr_db"],
        "jitter_pct": v["jitter_pct"],
        "shimmer_pct": v["shimmer_pct"],
        "f0_median_hz": v["f0_median_hz"],
        "f0_range_st": v["f0_range_st"],
        "pitch_raised_st": float(12 * np.log2(applied["median"] / src)) if applied and src else 0.0,
        "resonance_raised_pct": float(100 * (applied.get("formant", 1) - 1)) if applied else 0.0,
        "narration_s": len(nx) / nsr,
        "words_per_min": NARRATION_WORDS / (len(nx) / nsr) * 60,
        "flutter": s["flutter"],
        "lufs": s["lufs"],
        "true_peak_dbtp": s["true_peak_dbtp"],
        "clicks": int(sum(clicks(read(f)[0], sr) for f in files)),
        **spectrum_measures(nx, nsr),
    }
    return out


def main() -> None:
    root = sys.argv[1]
    result = {}
    for name in sorted(os.listdir(root)):
        d = os.path.join(root, name)
        if os.path.isdir(d):
            result[name] = measure(d)
            print(name, file=sys.stderr)
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
