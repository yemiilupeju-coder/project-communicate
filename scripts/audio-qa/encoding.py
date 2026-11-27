"""Encoding stage: what MP3 encoding does to the voice, apart from everything else.

  python3 -I scripts/audio-qa/encoding.py <voice-folder> [bitrates...]

Encodes each sentence exactly as scripts/voices/render.ts does (only the
bitrate varies), decodes it again, lines it up with the original and measures
the damage: signal-to-noise ratio, log-spectral distance, highest frequency
kept, padding added, and the DNSMOS change.
"""

from __future__ import annotations

import glob
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze import dnsmos, read  # noqa: E402


def encode_decode(x: np.ndarray, sr: int, bitrate: str) -> np.ndarray:
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    mp3 = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "s16le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
         "-b:a", bitrate, "-write_xing", "0", "-id3v2_version", "0", "-f", "mp3", "pipe:1"],
        input=pcm, capture_output=True, check=True).stdout
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "mp3", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", str(sr), "pipe:1"],
        input=mp3, capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).astype(np.float64), len(mp3)


def align(ref: np.ndarray, y: np.ndarray, max_lag: int = 4000) -> tuple[int, np.ndarray]:
    c = np.correlate(y[: len(ref) + max_lag], ref, mode="valid")
    lag = int(np.argmax(c[:max_lag]))
    return lag, y[lag : lag + len(ref)]


def lsd(a: np.ndarray, b: np.ndarray) -> float:
    def spec(x):
        f = np.abs(np.fft.rfft(np.lib.stride_tricks.sliding_window_view(x, 512)[::128] * np.hanning(512), axis=1)) ** 2
        return 10 * np.log10(f + 1e-10)
    A, B = spec(a)[:, 2:213], spec(b)[:, 2:213]  # about 100 Hz to 10 kHz at 24 kHz
    keep = A.max(axis=1) > A.max() - 50
    return float(np.mean(np.sqrt(np.mean((A[keep] - B[keep]) ** 2, axis=1))))


def bandwidth(x: np.ndarray, sr: int) -> float:
    s = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / sr)
    sm = np.convolve(s, np.ones(200) / 200, mode="same")
    db_ = 10 * np.log10(sm / sm.max() + 1e-12)
    return float(f[np.where(db_ > -60)[0].max()])


def main() -> None:
    folder = sys.argv[1]
    rates = sys.argv[2:] or ["48k", "64k", "96k", "128k"]
    files = sorted(glob.glob(os.path.join(folder, "*.wav")))
    orig = [read(f) for f in files]
    sr = orig[0][1]
    joined = np.concatenate([np.concatenate([x, np.zeros(int(0.3 * sr))]) for x, _ in orig])
    base = dnsmos(joined, sr)
    rows = {"source": {"dnsmos_ovrl": base["dnsmos_ovrl"], "dnsmos_sig": base["dnsmos_sig"], "bandwidth_hz": bandwidth(joined, sr)}}
    for rate in rates:
        snr, lsds, lags, outs, size = [], [], [], [], 0
        for x, _ in orig:
            y, n = encode_decode(x, sr, rate)
            size += n
            lag, ya = align(x, y)
            lags.append(lag)
            snr.append(10 * np.log10(np.sum(x**2) / (np.sum((x - ya) ** 2) + 1e-12)))
            lsds.append(lsd(x, ya))
            outs += [ya, np.zeros(int(0.3 * sr))]
        d = dnsmos(np.concatenate(outs), sr)
        rows[rate] = {
            "snr_db": float(np.mean(snr)),
            "log_spectral_distance_db": float(np.mean(lsds)),
            "bandwidth_hz": bandwidth(np.concatenate(outs), sr),
            "padding_ms": float(np.mean(lags) / sr * 1000),
            "dnsmos_ovrl": d["dnsmos_ovrl"],
            "dnsmos_sig": d["dnsmos_sig"],
            "kb_per_second": size / 1024 / (len(joined) / sr),
        }
    print(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
