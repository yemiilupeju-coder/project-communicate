"""The transformations compared in the experiments.

E2  conventional: Praat "Change gender" (PSOLA pitch + resampling formant shift)
E3  WORLD vocoder: analyse, scale F0, warp the spectral envelope and
    aperiodicity along frequency, resynthesise
E5  age-conditioned neural synthesis: Kokoro generates the voice itself, with
    its timbre moved in style space and its pitch curve edited in the graph
E6  hybrid: E5 with a smaller style move, plus a time-varying envelope filter
    that raises the resonances further without touching pitch or phase
"""
import numpy as np
import parselmouth
import pyworld as pw
from parselmouth.praat import call

import kv

SR = kv.SR
V = {k: v.reshape(-1, 256) for k, v in kv.VOICES.items()}
_w = np.load(kv.os.path.join(kv.HERE, "vt_dir_1.npy"))
VT_STEP = _w / (_w @ _w)  # +1 in predicted log resonance scale


# ── E5: timbre and pitch, inside the model ──


def steer(table, vt_gain):
    """Move a voice's timbre (decoder half of its style) along the learned
    vocal-tract direction. vt_gain 0.18 = resonances about 18% higher."""
    t = table.copy()
    t[:, :128] += np.log(1 + vt_gain) * VT_STEP
    return t


def voice_table(timbre, prosody, vt_gain=0.0):
    return steer(kv.mix(timbre, prosody), vt_gain)


def curve_median(table, items, speed=1.0):
    fs = []
    for i in items:
        _, f = kv.say(kv.ITEMS[i]["tokens"], table, speed=speed)
        fs += list(f[f > 40])
    return float(np.median(fs))


# ── E2: Praat change gender (PSOLA) ──


def praat_change(x, formant_ratio, new_median, range_factor=1.0):
    s = parselmouth.Sound(x.astype(np.float64), SR)
    out = call(s, "Change gender", 75, 600, formant_ratio, new_median, range_factor, 1.0)
    return out.values[0].astype(np.float32)


# ── E3: WORLD ──


def _warp_freq(m, alpha):
    """m: frames x bins (linear frequency). Value at f becomes value at f/alpha."""
    n = m.shape[1]
    src = np.arange(n) / alpha
    out = np.empty_like(m)
    for k in range(m.shape[0]):
        out[k] = np.interp(src, np.arange(n), m[k])
    return out


def world_transform(x, f0_ratio, alpha):
    d = x.astype(np.float64)
    f0, t = pw.harvest(d, SR, f0_floor=60, f0_ceil=700, frame_period=5)
    sp = pw.cheaptrick(d, f0, t, SR)
    ap = pw.d4c(d, f0, t, SR)
    sp2 = np.exp(_warp_freq(np.log(sp + 1e-12), alpha))
    ap2 = np.clip(_warp_freq(ap, alpha), 0, 1)
    y = pw.synthesize(f0 * f0_ratio, sp2, ap2, SR, frame_period=5)
    return y[: len(x)].astype(np.float32)


# ── E3b: the Childrenize method (Zhao et al., INTERSPEECH 2023), reimplemented
# here from its published description: WORLD analysis, an additive F0 shift to
# a target mean, linear (male source) or piecewise-linear (female source)
# spectral warping, and voiced segments slowed down. ──


def _piecewise_map(beta, sr, lo=300.0, hi=5500.0):
    """Frequency map: steeper below lo, beta in the speech band, the rest
    squeezed to keep Nyquist fixed."""
    b_lo = beta**2
    f_lo = lo * b_lo
    f_hi = f_lo + beta * (hi - lo)
    b_hi = (sr / 2 - f_hi) / (sr / 2 - hi)

    def fn(f):
        return np.where(f <= lo, b_lo * f, np.where(f <= hi, f_lo + beta * (f - lo), f_hi + b_hi * (f - hi)))

    return fn


def childrenize_method(x, target_f0, warping, beta, vowel_stretch):
    d = x.astype(np.float64)
    f0, t = pw.harvest(d, SR, f0_floor=50, f0_ceil=600, frame_period=5)
    f0 = pw.stonemask(d, f0, t, SR)
    sp = pw.cheaptrick(d, f0, t, SR)
    ap = pw.d4c(d, f0, t, SR)
    voiced = f0 > 50
    f0o = f0.copy()
    f0o[voiced] = np.minimum(f0[voiced] + (target_f0 - f0[voiced].mean()), 600)
    n = sp.shape[1]
    f = np.arange(n) / (n - 1) * SR / 2
    fmap = (lambda q: q * beta) if warping == "linear" else _piecewise_map(beta, SR)
    src = fmap(f)  # the input frequency that lands at each output bin is the inverse map
    out = np.empty_like(sp)
    for k in range(sp.shape[0]):
        out[k] = np.exp(np.interp(f, src, np.log(sp[k] + 1e-12)))
    # synthesise voiced and unvoiced runs separately, stretching the voiced ones
    edges = np.flatnonzero(np.diff(voiced.astype(int))) + 1
    segs = np.split(np.arange(len(f0)), edges)
    y = []
    for s in segs:
        if len(s) == 0:
            continue
        fp = 5 * vowel_stretch if voiced[s[0]] else 5
        y.append(pw.synthesize(f0o[s], out[s], ap[s], SR, fp))
    return np.concatenate(y).astype(np.float32)


# ── E6: envelope filter (no pitch change, phase kept) ──


def envelope_filter(x, alpha, max_db=12.0, n_fft=1024, hop=120, quef_ms=2.2):
    """Re-weights each frame's spectrum so its smooth envelope matches the same
    envelope stretched by alpha. Harmonics stay where the voice put them, and
    the phase is untouched, so transients and timing are preserved."""
    import librosa

    X = librosa.stft(x, n_fft=n_fft, hop_length=hop)
    mag = np.abs(X) + 1e-9
    logm = np.log(mag)
    q = int(quef_ms * 1e-3 * SR)
    c = np.fft.irfft(logm, axis=0)
    lifter = np.zeros(c.shape[0])
    lifter[:q] = 1
    lifter[-q + 1 :] = 1
    env = np.fft.rfft(c * lifter[:, None], axis=0).real  # log envelope per frame
    warped = _warp_freq(env.T, alpha).T
    gain = np.clip(warped - env, -max_db / 8.686, max_db / 8.686)
    # smooth the gain a little across time, and leave the very top alone
    k = np.ones(3) / 3
    gain = np.apply_along_axis(lambda g: np.convolve(g, k, mode="same"), 1, gain)
    f = np.linspace(0, SR / 2, gain.shape[0])
    gain *= np.clip((10500 - f) / 1500, 0, 1)[:, None]
    y = librosa.istft(X * np.exp(gain), hop_length=hop, length=len(x))
    return y.astype(np.float32)
