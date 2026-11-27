"""Independent audio analysis engine for Communicate's voices.

Measures audio with established, external tools rather than by ear or by
the code that made it:
  - Praat (via parselmouth): pitch, harmonics-to-noise, jitter, shimmer, formants
  - ITU-R BS.1770-4 loudness (pyloudnorm) and 4x-oversampled true peak
  - DNSMOS P.835 / P.808 (Microsoft): a neural network trained on human
    ratings that predicts speech quality (SIG), noise (BAK), overall (OVRL)
  - signal checks: clipping, clicks, dropouts, DC offset, noise floor, flutter

Usage (as a library, from report.py):  analyze_voice(dir_of_wavs) -> dict
"""

from __future__ import annotations

import glob
import os

import numpy as np
import onnxruntime as ort
import parselmouth
import pyloudnorm
import librosa
from parselmouth.praat import call
from scipy.io import wavfile
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "models")


def read(path: str) -> tuple[np.ndarray, int]:
    sr, x = wavfile.read(path)
    if x.dtype == np.int16:
        x = x.astype(np.float64) / 32768.0
    elif x.dtype == np.int32:
        x = x.astype(np.float64) / 2147483648.0
    else:
        x = x.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    return x, sr


def db(v: float) -> float:
    return float(20 * np.log10(max(v, 1e-12)))


# ── Signal integrity ──


def clicks(x: np.ndarray, sr: int) -> int:
    """Lone spikes in curvature, far above the local curvature (speech isn't lone)."""
    peak = np.abs(x).max() or 1.0
    d2 = np.abs(np.diff(x / peak, 2))
    w = max(3, int(0.005 * sr))
    local = np.sqrt(np.convolve(d2**2, np.ones(w) / w, mode="same"))
    return int(np.sum(d2 > 6 * local + 0.02))


def dropouts(x: np.ndarray, sr: int) -> list[float]:
    """Holes inside active sound: >= 5 ms of near-digital silence with loud
    sound within 10 ms on both sides. Returns their start times (s)."""
    quiet = np.abs(x) < 1e-4
    w10 = int(0.010 * sr)
    out, i, n = [], 0, len(x)
    while i < n:
        if not quiet[i]:
            i += 1
            continue
        j = i
        while j < n and quiet[j]:
            j += 1
        if j - i >= int(0.005 * sr) and i > w10 and j + w10 < n:
            before = np.sqrt(np.mean(x[i - w10 : i] ** 2))
            after = np.sqrt(np.mean(x[j : j + w10] ** 2))
            if db(before) > -35 and db(after) > -35:
                out.append(i / sr)
        i = j
    return out


def flutter(x: np.ndarray, sr: int) -> float:
    """Share of loudness fluctuation at 30-150 Hz (roughness/choppiness) vs 1-30 Hz (syllables)."""
    w = int(sr / 1000)
    n = len(x) // w
    e = np.sqrt(np.mean(x[: n * w].reshape(n, w) ** 2, axis=1))
    e = e - e.mean()
    spec = np.abs(np.fft.rfft(e * np.hanning(len(e)))) ** 2
    f = np.fft.rfftfreq(len(e), w / sr)
    return float(spec[(f >= 30) & (f < 150)].sum() / spec[(f >= 1) & (f < 30)].sum())


def signal_metrics(x: np.ndarray, sr: int) -> dict:
    peak = float(np.abs(x).max())
    tp = float(np.abs(resample_poly(x, 4, 1)).max())
    frame = int(0.02 * sr)
    n = len(x) // frame
    rms = np.sqrt(np.mean(x[: n * frame].reshape(n, frame) ** 2, axis=1)) if n else np.array([0.0])
    speech = rms[rms > np.percentile(rms, 60)]
    floor = np.percentile(rms, 5)
    padded = np.concatenate([x, np.zeros(max(0, int(0.5 * sr) - len(x)))])
    lufs = pyloudnorm.Meter(sr, filter_class="DeMan").integrated_loudness(padded)  # ITU-exact
    return {
        "duration_s": len(x) / sr,
        "peak_dbfs": db(peak),
        "true_peak_dbtp": db(tp),
        "clipped_samples": int(np.sum(np.abs(x) >= 0.999)),
        "dc_offset": float(np.mean(x)),
        "lufs": float(lufs),
        "noise_floor_dbfs": db(floor),
        "snr_db": db(float(np.median(speech))) - db(floor),
        "clicks": clicks(x, sr),
        "dropouts": len(dropouts(x, sr)),
        "flutter": flutter(x, sr),
    }


# ── Voice (Praat) ──


def voice_metrics(path: str) -> dict:
    s = parselmouth.Sound(path)
    pitch = s.to_pitch_ac(0.01, 75, 600)
    f0 = pitch.selected_array["frequency"]
    f0 = f0[f0 > 0]
    pp = call(s, "To PointProcess (periodic, cc)", 75, 600)
    # Same formant settings for every voice (adult or child), so formant
    # positions can be compared directly between voices.
    formant = s.to_formant_burg(0.01, 5, 8000, 0.025, 50)
    times = [pitch.get_time_from_frame_number(i + 1) for i in range(pitch.get_number_of_frames())]
    voiced = [t for t, v in zip(times, pitch.selected_array["frequency"]) if v > 0]
    fs = {k: [] for k in (1, 2, 3)}
    for t in voiced:
        for k in fs:
            v = formant.get_value_at_time(k, t)
            if v == v:  # not NaN
                fs[k].append(v)
    return {
        "f0_median_hz": float(np.median(f0)) if len(f0) else 0.0,
        "f0_range_st": float(12 * np.log2(np.percentile(f0, 90) / np.percentile(f0, 10))) if len(f0) else 0.0,
        "hnr_db": float(call(s.to_harmonicity_cc(0.01, 75, 0.1, 1.0), "Get mean", 0, 0)),
        "jitter_pct": float(call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3) * 100),
        "shimmer_pct": float(call([s, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6) * 100),
        "f1_hz": float(np.median(fs[1])) if fs[1] else 0.0,
        "f2_hz": float(np.median(fs[2])) if fs[2] else 0.0,
        "f3_hz": float(np.median(fs[3])) if fs[3] else 0.0,
        "voiced_s": len(voiced) * 0.01,
    }


# ── DNSMOS (neural MOS predictor) ──

_dns = None


def dnsmos(x: np.ndarray, sr: int) -> dict:
    global _dns
    if _dns is None:
        _dns = (
            ort.InferenceSession(os.path.join(MODELS, "sig_bak_ovr.onnx")),
            ort.InferenceSession(os.path.join(MODELS, "model_v8.onnx")),
        )
    a = librosa.resample(x.astype(np.float32), orig_sr=sr, target_sr=16000)
    need = int(9.01 * 16000)
    while len(a) < need:
        a = np.concatenate([a, a])
    hops = int(np.floor(len(a) / 16000) - 9.01) + 1
    sig, bak, ovr, p808 = [], [], [], []
    p_ovr = np.poly1d([-0.06766283, 1.11546468, 0.04602535])
    p_sig = np.poly1d([-0.08397278, 1.22083953, 0.0052439])
    p_bak = np.poly1d([-0.13166888, 1.60915514, -0.39604546])
    for h in range(hops):
        seg = a[h * 16000 : h * 16000 + need]
        if len(seg) < need:
            continue
        mel = librosa.feature.melspectrogram(y=seg[:-160], sr=16000, n_fft=321, hop_length=160, n_mels=120)
        mel = ((librosa.power_to_db(mel, ref=np.max) + 40) / 40).T
        p808.append(_dns[1].run(None, {"input_1": mel[np.newaxis].astype(np.float32)})[0][0][0])
        s_, b_, o_ = _dns[0].run(None, {"input_1": seg[np.newaxis].astype(np.float32)})[0][0]
        sig.append(p_sig(s_))
        bak.append(p_bak(b_))
        ovr.append(p_ovr(o_))
    return {
        "dnsmos_sig": float(np.mean(sig)),
        "dnsmos_bak": float(np.mean(bak)),
        "dnsmos_ovrl": float(np.mean(ovr)),
        "dnsmos_p808": float(np.mean(p808)),
    }


# ── A whole voice (a folder of sentence WAVs) ──


def analyze_voice(folder: str) -> dict:
    files = sorted(glob.glob(os.path.join(folder, "*.wav")))
    per = []
    joined, sr = [], None
    for f in files:
        x, sr = read(f)
        m = signal_metrics(x, sr) | voice_metrics(f)
        m["file"] = os.path.basename(f)
        per.append(m)
        joined += [x, np.zeros(int(0.3 * sr))]
    allx = np.concatenate(joined)
    keys = [k for k in per[0] if k != "file"]
    summary = {k: float(np.mean([p[k] for p in per])) for k in keys}
    summary["clicks"] = int(sum(p["clicks"] for p in per))
    summary["dropouts"] = int(sum(p["dropouts"] for p in per))
    summary["clipped_samples"] = int(sum(p["clipped_samples"] for p in per))
    summary["true_peak_dbtp"] = float(max(p["true_peak_dbtp"] for p in per))
    # Consistency across sentences
    f0s = [p["f0_median_hz"] for p in per if p["f0_median_hz"] > 0]
    summary["f0_spread_st"] = float(np.std(12 * np.log2(np.array(f0s) / np.mean(f0s))))
    summary["lufs_spread_lu"] = float(np.std([p["lufs"] for p in per]))
    summary |= dnsmos(allx, sr)
    return {"summary": summary, "sentences": per, "files": files}


def plot(folder: str, png: str, title: str) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    files = sorted(glob.glob(os.path.join(folder, "*.wav")))[:3]
    xs, sr = [], 24000
    for f in files:
        x, sr = read(f)
        xs += [x, np.zeros(int(0.2 * sr))]
    x = np.concatenate(xs)
    fig, (a, b) = plt.subplots(2, 1, figsize=(11, 5), sharex=True)
    t = np.arange(len(x)) / sr
    a.plot(t, x, lw=0.4, color="#13294B")
    a.set_ylim(-1, 1)
    a.set_title(title)
    a.set_ylabel("waveform")
    S = librosa.amplitude_to_db(np.abs(librosa.stft(x.astype(np.float32), n_fft=1024, hop_length=128)), ref=np.max)
    b.imshow(S, origin="lower", aspect="auto", extent=[0, len(x) / sr, 0, sr / 2], vmin=-80, vmax=0, cmap="magma")
    b.set_ylabel("Hz")
    b.set_xlabel("seconds")
    fig.tight_layout()
    fig.savefig(png, dpi=110)
    plt.close(fig)


# ── Vocal-tract size (how child-like the voice is) ──


def envelope(path: str, sr_out: int = 16000) -> np.ndarray:
    """Average spectral envelope (dB) of the voiced parts of a sentence, by LPC,
    which follows the vocal tract's resonances and not the pitch."""
    n_fft = 1024
    acc = np.zeros(n_fft // 2 + 1)
    count = 0
    x, sr = read(path)
    x = librosa.resample(x, orig_sr=sr, target_sr=sr_out)
    x = np.append(x[0], x[1:] - 0.97 * x[:-1])  # pre-emphasis
    frame, hop = int(0.03 * sr_out), int(0.01 * sr_out)
    rms_all = np.sqrt(np.mean(x**2))
    for i in range(0, len(x) - frame, hop):
        seg = x[i : i + frame] * np.hanning(frame)
        if np.sqrt(np.mean(seg**2)) < 0.5 * rms_all:
            continue
        try:
            a = librosa.lpc(seg, order=18)
        except Exception:
            continue
        h = 1 / np.abs(np.fft.rfft(a, n_fft))
        acc += 20 * np.log10(h / h.max() + 1e-9)
        count += 1
    return acc / max(count, 1)


def vocal_tract_scale(folder: str, references: list[str]) -> float:
    """How much higher this voice's resonances sit than the reference voices',
    comparing the same sentence said by each (so the sounds match). 1.15 means
    15% higher, as from a vocal tract 15% shorter: a child's."""
    out = []
    for f in sorted(glob.glob(os.path.join(folder, "*.wav"))):
        env = envelope(f)
        for ref in references:
            r = os.path.join(ref, os.path.basename(f))
            if os.path.exists(r):
                out.append(warp_factor(env, envelope(r)))
    return float(np.median(out)) if out else 0.0


def warp_factor(env: np.ndarray, ref: np.ndarray, sr: int = 16000) -> float:
    """The frequency scale that best lines a voice's envelope up with a
    reference's (vocal-tract length normalisation). The overall slope of each
    envelope is removed first, so only the resonance peaks are compared."""
    f = np.linspace(0, sr / 2, len(env))
    band = (f >= 250) & (f <= 5500)

    def shape(e: np.ndarray) -> np.ndarray:
        y = e[band]
        fit = np.polyval(np.polyfit(np.log(f[band]), y, 2), np.log(f[band]))
        y = y - fit
        return (y - y.mean()) / (y.std() + 1e-9)

    x = shape(env)
    best, best_a = -np.inf, 1.0
    for a in np.arange(0.7, 1.6, 0.005):
        c = float(np.dot(x, shape(np.interp(f / a, f, ref))))
        if c > best:
            best, best_a = c, a
    return float(best_a)


def _align(x: np.ndarray, ref: np.ndarray, sr: int) -> np.ndarray:
    """Shifts x to line up with ref by their loudness envelopes (+-80 ms)."""
    hop = int(0.005 * sr)
    env = lambda s: np.sqrt(np.convolve(s**2, np.ones(hop) / hop, mode="same")[::hop])  # noqa: E731
    a, b = env(x), env(ref)
    n = min(len(a), len(b))
    lags = range(-16, 17)
    score = [np.dot(a[max(L, 0) : n + min(L, 0)], b[max(-L, 0) : n - max(L, 0)]) for L in lags]
    shift = list(lags)[int(np.argmax(score))] * hop
    return x[shift:] if shift >= 0 else np.concatenate([np.zeros(-shift), x])


def _formant_tracks(x: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    s = parselmouth.Sound(x.astype(np.float64), sr)
    fm = s.to_formant_burg(0.005, 5, 6000, 0.025, 50)
    pitch = s.to_pitch_ac(0.005, 75, 700)
    t = np.arange(0.02, s.duration - 0.02, 0.005)
    f0 = np.array([pitch.get_value_at_time(tt) for tt in t])
    F = np.array([[fm.get_value_at_time(k, tt) for k in (2, 3)] for tt in t])
    return f0, F


def vocal_tract_scale_aligned(folder: str, base: str) -> float:
    """How much higher this voice's formants (F2, F3) sit than its source
    voice's, frame by frame. Valid only when the two have the same timing (a
    voice generated in the model against its source at the same speed). The
    averaged-envelope measure above misreads voices at a child's pitch."""
    out = []
    for f in sorted(glob.glob(os.path.join(folder, "*.wav"))):
        r = os.path.join(base, os.path.basename(f))
        if not os.path.exists(r):
            continue
        x, sr = read(f)
        ref, _ = read(r)
        x = _align(x, ref, sr)
        n = min(len(x), len(ref))
        f0a, Fa = _formant_tracks(x[:n], sr)
        f0b, Fb = _formant_tracks(ref[:n], sr)
        ok = np.isfinite(f0a) & np.isfinite(f0b) & (f0a > 0) & (f0b > 0)
        ratios = [np.nanmedian(Fa[ok, k] / Fb[ok, k]) for k in range(2)]
        out.append(float(np.exp(np.mean(np.log(ratios)))))
    return float(np.median(out)) if out else 0.0
