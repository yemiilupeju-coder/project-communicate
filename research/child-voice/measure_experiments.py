"""Objective measurements for every experiment folder.

    python3 measure_experiments.py out/ > measures.json

Resonance (F1-F3) change is measured against the profile's own E1 (same
text, same timing), frame by frame, after aligning the two by envelope.
"""
import glob
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

import measures as M

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts", "audio-qa"))
import analyze  # noqa: E402

ROOT = sys.argv[1]
SR = 24000
NARR_WORDS = 116


def load(folder, pattern):
    return [sf.read(f, dtype="float32")[0] for f in sorted(glob.glob(os.path.join(folder, pattern)))]


def align(x, ref):
    """Shift x to line up with ref (envelope cross-correlation, +-80 ms)."""
    hop = 120
    e = lambda s: np.sqrt(np.convolve(s**2, np.ones(hop) / hop, mode="same")[::hop])  # noqa: E731
    a, b = e(x), e(ref)
    n = min(len(a), len(b))
    best, lag = -1, 0
    for L in range(-16, 17):
        if L >= 0:
            c = np.dot(a[L:n], b[: n - L])
        else:
            c = np.dot(a[: n + L], b[-L:n])
        if c > best:
            best, lag = c, L
    s = lag * hop
    return x[s:] if s >= 0 else np.concatenate([np.zeros(-s, np.float32), x])


def mp3_loss(x):
    """Log-spectral distance (dB) after a 96 kbps MP3 round trip, as the app ships."""
    sf.write("/tmp/_m.wav", x, SR)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", "/tmp/_m.wav", "-b:a", "96k", "/tmp/_m.mp3"], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", "/tmp/_m.mp3", "-ar", str(SR), "/tmp/_m2.wav"], check=True)
    y = sf.read("/tmp/_m2.wav", dtype="float32")[0]
    y = align(y, x)[: len(x)]
    import librosa

    A = np.abs(librosa.stft(x[: len(y)], n_fft=1024, hop_length=256)) + 1e-6
    B = np.abs(librosa.stft(y, n_fft=1024, hop_length=256)) + 1e-6
    keep = 20 * np.log10(A).max(axis=0) > 20 * np.log10(A).max() - 50
    d = 20 * np.log10(A[:, keep]) - 20 * np.log10(B[:, keep])
    return float(np.mean(np.sqrt(np.mean(d**2, axis=0))))


def measure(folder, e1):
    short = load(folder, "[123]-*.wav")
    narr = load(folder, "4-narr-*.wav")
    allx = M.join(short)
    nx = M.join(narr, gap=0.35)
    d = M.dns(allx)
    v = M.voice(nx)
    s = M.spectrum(nx)
    sig = analyze.signal_metrics(nx, SR)
    out = {
        **{k: round(val, 3) for k, val in d.items()},
        "f0_median_hz": round(v["f0_median_hz"], 1),
        "f0_range_st": round(v["f0_range_st"], 2),
        "hnr_db": round(v["hnr_db"], 2),
        "jitter_pct": round(v["jitter_pct"], 2),
        "shimmer_pct": round(v["shimmer_pct"], 2),
        "energy_8k_up_pct": round(s["energy_8k_up_pct"], 2),
        "spectral_centroid_hz": round(s["spectral_centroid_hz"]),
        "words_per_min": round(NARR_WORDS / (sum(len(x) for x in narr) / SR + 0.35 * (len(narr) - 1)) * 60),
        "peak": round(float(max(np.abs(x).max() for x in short + narr)), 3),
        "clipped_samples": int(sum((np.abs(x) >= 0.999).sum() for x in short + narr)),
        "clicks": int(sum(analyze.clicks(x, SR) for x in short + narr)),
        "lufs": round(sig["lufs"], 1),
        "mp3_96k_lsd_db": round(mp3_loss(nx), 2),
    }
    if e1:
        rs = []
        for f in sorted(glob.glob(os.path.join(folder, "[24]-*.wav"))):
            r = os.path.join(e1, os.path.basename(f))
            x = sf.read(f, dtype="float32")[0]
            ref = sf.read(r, dtype="float32")[0]
            rs.append(M.vt_aligned(align(x, ref), ref, ceiling=6000.0))
        for k in ("F1", "F2", "F3", "vt"):
            out[f"{k}_vs_e1"] = round(float(np.nanmedian([r[k] for r in rs])), 3)
    return out


result = {}
for folder in sorted(glob.glob(os.path.join(ROOT, "*-*"))):
    if not os.path.isdir(folder):
        continue
    name = os.path.basename(folder)
    prof = name.split("-")[0]
    e1 = os.path.join(ROOT, f"{prof}-e1-original")
    # frame-aligned resonance needs E1's timing: the shipped voices and
    # Childrenize (which stretches vowels) do not have it
    has_timing = name.split("-")[1] not in ("shipped", "e3b")
    result[name] = measure(folder, e1 if has_timing else None)
    print(name, json.dumps(result[name]), file=sys.stderr, flush=True)
print(json.dumps(result, indent=1))
