"""Buzz and clarity measures for every stage of the pipeline.

Buzz (metallic, buzzy texture):
  hf_periodicity      in voiced speech, how periodic the band above 4 kHz is
                      (normalised autocorrelation at the pitch period). Real
                      voices are mostly noise-like up there (low values);
                      vocoder buzz makes it periodic (high values).
  fricative_buzz      in "s", "f", "sh" (unvoiced, high-frequency frames), the
                      strongest periodicity at any voice-pitch lag. Should be
                      near zero: a fricative has no pitch.
  fricative_flatness  spectral flatness of those frames, 2-12 kHz (noise = high).
Clarity / diction:
  cv_ratio_db         consonant (unvoiced) energy minus vowel energy.
  hf_share_pct        energy above 4 kHz, % of total.
Plus DNSMOS (overall), and the sample rate / duration.
"""
import glob, json, os, sys
import numpy as np, parselmouth, scipy.signal as sg
sys.path.insert(0, "/home/claude/project-communicate/scripts/audio-qa")
import analyze  # noqa: E402

def read(path, sr):
    return np.fromfile(path, dtype=np.float32), sr

def frames(x, sr, win=0.03, hop=0.01):
    n, h = int(win * sr), int(hop * sr)
    for s in range(0, len(x) - n, h):
        yield s / sr, x[s:s + n]

def measures(x, sr):
    snd = parselmouth.Sound(x.astype(np.float64), sr)
    pitch = snd.to_pitch_ac(0.01, 75, 700)
    hp = sg.sosfiltfilt(sg.butter(6, 4000, "hp", fs=sr, output="sos"), x)
    hfp, fb, ff, cons, vow = [], [], [], [], []
    peak = np.max(np.abs(x)) + 1e-9
    for t, fr in frames(x, sr):
        rms = np.sqrt(np.mean(fr**2)) + 1e-12
        if rms < peak * 0.003:
            continue
        f0 = pitch.get_value_at_time(t + 0.015)
        spec = np.abs(np.fft.rfft(fr * np.hanning(len(fr)))) ** 2
        f = np.fft.rfftfreq(len(fr), 1 / sr)
        hf = spec[f >= 4000].sum() / (spec.sum() + 1e-12)
        if f0 and not np.isnan(f0):
            vow.append(rms)
            seg = hp[int(t * sr):int(t * sr) + len(fr)]
            lag = int(round(sr / f0))
            if len(seg) > lag + 10 and np.sum(seg**2) > 0:
                a, b = seg[:-lag], seg[lag:]
                hfp.append(np.dot(a, b) / np.sqrt(np.dot(a, a) * np.dot(b, b) + 1e-12))
        else:
            cons.append(rms)
            if hf > 0.5:  # a fricative-like frame
                fr0 = fr - fr.mean()
                ac = np.correlate(fr0, fr0, "full")[len(fr0) - 1:]
                ac /= ac[0] + 1e-12
                lo, hi = int(sr / 450), int(sr / 80)
                fb.append(float(np.max(ac[lo:hi])))
                band = spec[(f >= 2000) & (f <= min(12000, sr / 2 - 100))] + 1e-12
                ff.append(float(np.exp(np.mean(np.log(band))) / np.mean(band)))
    spec_all = np.abs(np.fft.rfft(x)) ** 2
    fa = np.fft.rfftfreq(len(x), 1 / sr)
    return {
        "hf_periodicity": float(np.mean(hfp)) if hfp else np.nan,
        "fricative_buzz": float(np.mean(fb)) if fb else np.nan,
        "fricative_flatness": float(np.mean(ff)) if ff else np.nan,
        "cv_ratio_db": float(20 * np.log10(np.mean(cons) / np.mean(vow))) if cons and vow else np.nan,
        "hf_share_pct": float(100 * spec_all[fa >= 4000].sum() / spec_all.sum()),
    }

def stage_summary(folder, sr):
    files = sorted(glob.glob(os.path.join(folder, "*.f32")))
    rows = [measures(*read(p, sr)) for p in files]
    out = {k: float(np.nanmean([r[k] for r in rows])) for k in rows[0]}
    sent = [read(p, sr)[0] for p in files if os.path.basename(p).startswith("s-")]
    words = [read(p, sr)[0] for p in files if os.path.basename(p).startswith("w-")]
    gap = np.zeros(int(0.3 * sr), np.float32)
    join = lambda xs: np.concatenate([np.concatenate([x, gap]) for x in xs])  # noqa: E731
    xs16 = lambda x: sg.resample_poly(x, 16000, sr) if sr != 16000 else x  # noqa: E731
    out["dnsmos_sentences"] = analyze.dnsmos(xs16(join(sent)), 16000)["dnsmos_ovrl"]
    out["dnsmos_words"] = analyze.dnsmos(xs16(join(words)), 16000)["dnsmos_ovrl"]
    return out

if __name__ == "__main__":
    res = {}
    for vid in ("girl", "boy"):
        for folder in sorted(glob.glob(f"raw/{vid}/*")):
            name = os.path.basename(folder)
            sr = 48000 if "48k" in name else 24000
            res[f"{vid}/{name}"] = stage_summary(folder, sr)
            r = res[f"{vid}/{name}"]
            print(f"{vid:4s} {name:26s} " + "  ".join(f"{k} {v:.3f}" for k, v in r.items()), flush=True)
    json.dump(res, open(sys.argv[1] if len(sys.argv) > 1 else "stages.json", "w"), indent=1)
