"""Intelligibility by machine, as a cross-check on listening (never instead of it).

Words: forced choice. pocketsphinx (CMU, offline, US English acoustic model)
picks which of the corpus's 55 words it heard, from a grammar listing them all.
Confusable sounds (ship/sheep, cot/caught, fish/fresh) show up as errors.
Sentences: word error rate with pocketsphinx's general US English model.

pocketsphinx is an older HMM recogniser; its absolute accuracy is modest, so
only differences between stages of the same voice are meaningful.
"""
import glob, json, os, sys
import numpy as np, scipy.signal as sg
from pocketsphinx import Decoder, Config, get_model_path

C = json.load(open("corpus.json"))
WORDS = {k: v for k, v in C.items() if k.startswith("w-")}
SENTS = {k: v for k, v in C.items() if k.startswith("s-")}
MP = get_model_path()

def norm(t):
    return " ".join("".join(ch for ch in t.lower() if ch.isalpha() or ch in " '").split())

words_unique = sorted({norm(v["text"]) for v in WORDS.values()})
gram = "#JSGF V1.0;\ngrammar w;\npublic <w> = " + " | ".join(words_unique) + " ;\n"
open("/tmp/words.gram", "w").write(gram)

def decoder(jsgf=None):
    cfg = Config(hmm=os.path.join(MP, "en-us/en-us"), dict=os.path.join(MP, "en-us/cmudict-en-us.dict"), loglevel="FATAL")
    if jsgf:
        cfg["lm"] = None
        cfg["jsgf"] = jsgf
    else:
        cfg["lm"] = os.path.join(MP, "en-us/en-us.lm.bin")
    return Decoder(cfg)

DW, DS = decoder("/tmp/words.gram"), decoder()

def to16k(x, sr):
    y = sg.resample_poly(x, 16000, sr) if sr != 16000 else x
    y = y / (np.abs(y).max() + 1e-9) * 0.7
    pad = np.zeros(4000)
    return (np.concatenate([pad, y, pad]) * 32767).astype("<i2").tobytes()

def recognise(dec, pcm):
    dec.start_utt(); dec.process_raw(pcm, full_utt=True); dec.end_utt()
    return dec.hyp().hypstr if dec.hyp() else ""

def wer(ref, hyp):
    r, h = ref.split(), hyp.split()
    d = np.arange(len(h) + 1)
    for i, rw in enumerate(r, 1):
        prev, d[0] = d.copy(), i
        for j, hw in enumerate(h, 1):
            d[j] = min(prev[j] + 1, d[j - 1] + 1, prev[j - 1] + (rw != hw))
    return d[len(h)] / len(r)

def run(folder, sr):
    ok, errors = 0, []
    for k, v in WORDS.items():
        x = np.fromfile(f"{folder}/{k}.f32", np.float32)
        hyp = recognise(DW, to16k(x, sr)); ref = norm(v["text"])
        if hyp == ref: ok += 1
        else: errors.append(f"{ref}->{hyp or '?'}")
    ws = [wer(norm(v["text"]), recognise(DS, to16k(np.fromfile(f"{folder}/{k}.f32", np.float32), sr))) for k, v in SENTS.items()]
    return {"word_accuracy_pct": 100 * ok / len(WORDS), "sentence_wer_pct": 100 * float(np.mean(ws)), "word_errors": errors}

if __name__ == "__main__":
    stages = sys.argv[1:]
    res = {}
    for vid in ("girl", "boy"):
        for st in stages:
            folder = f"raw/{vid}/{st}"
            if not os.path.isdir(folder): continue
            r = run(folder, 48000 if "48k" in st else 24000)
            res[f"{vid}/{st}"] = r
            print(f"{vid:4s} {st:28s} words {r['word_accuracy_pct']:5.1f}%  sentence WER {r['sentence_wer_pct']:5.1f}%  errors: {', '.join(r['word_errors'][:9])}", flush=True)
    json.dump(res, open("asr.json", "w"), indent=1)
