"""Measurements for the child-voice experiments (reuses the app's audio-QA code)."""
import os
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts", "audio-qa"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts", "voice-benchmark"))
import analyze  # noqa: E402
from measure import spectrum_measures  # noqa: E402

SR = 24000


def envelope_of(x, sr=SR):
    path = "/tmp/_env.wav"
    sf.write(path, x, sr)
    return analyze.envelope(path)


def vt_scale(x, ref, sr=SR):
    """Resonance scale of x relative to ref (same sentence). 1.15 = 15% higher."""
    return analyze.warp_factor(envelope_of(x, sr), envelope_of(ref, sr))


def voice(x, sr=SR):
    path = "/tmp/_v.wav"
    sf.write(path, x, sr)
    return analyze.voice_metrics(path)


def dns(x, sr=SR):
    return analyze.dnsmos(x, sr)


def spectrum(x, sr=SR):
    return spectrum_measures(x, sr)


def join(xs, gap=0.3, sr=SR):
    out = []
    for x in xs:
        out += [x, np.zeros(int(gap * sr), np.float32)]
    return np.concatenate(out)


def formant_tracks(x, sr=SR, ceiling=5500.0):
    import parselmouth
    s = parselmouth.Sound(x.astype(np.float64), sr)
    fm = s.to_formant_burg(0.005, 5, ceiling, 0.025, 50)
    pitch = s.to_pitch_ac(0.005, 75, 700)
    t = np.arange(0.02, s.duration - 0.02, 0.005)
    f0 = np.array([pitch.get_value_at_time(tt) for tt in t])
    F = np.array([[fm.get_value_at_time(k, tt) for k in (1, 2, 3)] for tt in t])
    return t, f0, F


def vt_aligned(x, ref, sr=SR, ceiling=5500.0):
    """Median formant ratio x/ref over frames voiced in both. Only valid when
    the two have identical timing (same text, same prosody style)."""
    n = min(len(x), len(ref))
    _, f0a, Fa = formant_tracks(x[:n], sr, ceiling)
    _, f0b, Fb = formant_tracks(ref[:n], sr, ceiling)
    ok = (f0a > 0) & (f0b > 0) & ~np.isnan(f0a) & ~np.isnan(f0b)
    out = {}
    for k in range(3):
        r = Fa[ok, k] / Fb[ok, k]
        r = r[np.isfinite(r)]
        out[f"F{k+1}"] = float(np.median(r)) if len(r) else float("nan")
    out["vt"] = float(np.exp(np.mean(np.log([out["F2"], out["F3"]]))))
    return out
