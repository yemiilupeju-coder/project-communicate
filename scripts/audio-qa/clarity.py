"""Clarity checks (ADR 0012): does the voice still sound American and are its words clear?

  r_dip               how far F3 falls in words with an "r" (10th percentile / median F3).
                      An American r pulls F3 down hard; lower = stronger r. The style-space
                      move of ADR 0011 raised it from ~0.77 to ~0.88-0.94, which is what made
                      single words sound British.
  word_accuracy_pct   pocketsphinx (offline, US English, adult-trained) picks which of the
                      corpus words it heard, from a grammar of all of them. Confusable
                      sounds (ship/sheep, cot/caught) show up as errors.
  sentence_wer_pct    word error rate on the short sentences, with its general model.

pocketsphinx is an older recogniser trained on adults; its absolute accuracy on a child's
pitch is modest. The targets are set to catch a regression like ADR 0011's (word accuracy
69% -> 27% in research/voice-clarity), not to grade the voice. Listening decides.
"""
import glob
import json
import os
import sys

import numpy as np
import parselmouth
import scipy.signal as sg
from pocketsphinx import Config, Decoder, get_model_path

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = json.load(open(os.path.join(HERE, "clarity-corpus.json")))
MP = get_model_path()


def norm(t: str) -> str:
    return " ".join("".join(ch for ch in t.lower() if ch.isalpha() or ch in " '").split())


def _decoders() -> tuple[Decoder, Decoder]:
    words = sorted({norm(w) for w in CORPUS["words"]})
    gram = os.path.join(os.environ.get("TMPDIR", "/tmp"), "audio-qa-words.gram")
    with open(gram, "w") as f:
        f.write("#JSGF V1.0;\ngrammar w;\npublic <w> = " + " | ".join(words) + " ;\n")
    base = dict(hmm=os.path.join(MP, "en-us/en-us"), dict=os.path.join(MP, "en-us/cmudict-en-us.dict"), loglevel="FATAL")
    cw = Config(**base)
    cw["lm"] = None
    cw["jsgf"] = gram
    cs = Config(**base)
    cs["lm"] = os.path.join(MP, "en-us/en-us.lm.bin")
    return Decoder(cw), Decoder(cs)


_dec = None


def _read(path: str) -> tuple[np.ndarray, int]:
    s = parselmouth.Sound(path)
    return s.values[0].astype(np.float64), int(s.sampling_frequency)


def _pcm16k(x: np.ndarray, sr: int) -> bytes:
    y = sg.resample_poly(x, 16000, sr) if sr != 16000 else x
    y = y / (np.abs(y).max() + 1e-9) * 0.7
    pad = np.zeros(4000)
    return (np.concatenate([pad, y, pad]) * 32767).astype("<i2").tobytes()


def _hyp(dec: Decoder, pcm: bytes) -> str:
    dec.start_utt()
    dec.process_raw(pcm, full_utt=True)
    dec.end_utt()
    return dec.hyp().hypstr if dec.hyp() else ""


def _wer(ref: str, hyp: str) -> float:
    r, h = ref.split(), hyp.split()
    d = np.arange(len(h) + 1)
    for i, rw in enumerate(r, 1):
        prev, d[0] = d.copy(), i
        for j, hw in enumerate(h, 1):
            d[j] = min(prev[j] + 1, d[j - 1] + 1, prev[j - 1] + (rw != hw))
    return d[len(h)] / len(r)


def _f3(x: np.ndarray, sr: int) -> np.ndarray:
    s = parselmouth.Sound(x, sr)
    fm = s.to_formant_burg(0.005, 5, 6500, 0.025, 50)
    pitch = s.to_pitch_ac(0.005, 75, 700)
    t = np.arange(0.02, s.duration - 0.02, 0.005)
    f0 = np.array([pitch.get_value_at_time(tt) for tt in t])
    f3 = np.array([fm.get_value_at_time(3, tt) for tt in t])
    ok = (f0 > 0) & ~np.isnan(f0) & ~np.isnan(f3)
    return f3[ok]


def clarity(folder: str) -> dict:
    """Scores <folder>/w-<nn>.wav and s-<nn>.wav, numbered in clarity-corpus.json's order."""
    global _dec
    _dec = _dec or _decoders()
    dw, ds = _dec
    words, sents = CORPUS["words"], CORPUS["sentences"]
    ok, errors, dips = 0, [], []
    for n, w in enumerate(words):
        x, sr = _read(os.path.join(folder, f"w-{n:02d}.wav"))
        hyp = _hyp(dw, _pcm16k(x, sr))
        if hyp == norm(w):
            ok += 1
        else:
            errors.append(f"{norm(w)}->{hyp or '?'}")
        if w in CORPUS["r_words"]:
            f3 = _f3(x, sr)
            if len(f3) > 5:
                dips.append(np.percentile(f3, 10) / np.median(f3))
    wers = []
    for n, s in enumerate(sents, len(words)):
        x, sr = _read(os.path.join(folder, f"s-{n:02d}.wav"))
        wers.append(_wer(norm(s), _hyp(ds, _pcm16k(x, sr))))
    return {
        "r_dip": float(np.mean(dips)),
        "word_accuracy_pct": 100 * ok / len(words),
        "sentence_wer_pct": 100 * float(np.mean(wers)),
        "word_errors": errors,
    }


if __name__ == "__main__":
    for folder in sys.argv[1:]:
        r = clarity(folder)
        print(
            f"{os.path.basename(folder):12s} r_dip {r['r_dip']:.3f}  words {r['word_accuracy_pct']:.0f}%  "
            f"sentence WER {r['sentence_wer_pct']:.0f}%  errors: {', '.join(r['word_errors'][:8])}"
        )
