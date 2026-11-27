"""Accent and articulation checks on the corpus words, per stage:
  r_dip        F3 low point / typical F3 in r-words (lower = stronger American r)
  formant_x    how much the formants rose vs the source voice (geometric mean, vowels)
  vowel_shape  how unevenly F1/F2/F3 moved (0 = even scaling, vowels keep identity)"""
import glob, json, os, sys
import numpy as np
sys.path.insert(0, "/home/claude/childvoice-rd")
import measures as M  # noqa
RW = ["more","water","sister","Peter","paper","better","doctor","street","strength","spring","crisp","breakfast","hungry","bathroom"]
VG = {"ɑ": ["cot","hot","top","stop","mom"], "æ": ["bad","hat","plants","splash"], "i": ["sheep","street","Peter"], "u": ["fool","boot","shoes","zoo"], "o": ["no","go","hello","clothes"]}
def rd(folder, w): return np.fromfile(f"{folder}/w-{w}.f32", np.float32)
def F(x, sr):
    t, f0, Fm = M.formant_tracks(x, sr=sr, ceiling=6500.0)
    ok = (f0 > 0) & ~np.isnan(f0) & ~np.isnan(Fm).any(1); return Fm[ok]
def phon(folder, src, sr):
    r = float(np.mean([np.percentile(Fm[:, 2], 10) / np.median(Fm[:, 2]) for w in RW if len(Fm := F(rd(folder, w), sr)) > 5]))
    spreads, scales = [], []
    for g, ws in VG.items():
        rat = [np.median(b, 0) / np.median(a, 0) for w in ws if len(a := F(rd(src, w), 24000)) > 3 and len(b := F(rd(folder, w), sr)) > 3]
        if rat:
            rat = np.mean(rat, 0); spreads.append(float(np.std(np.log(rat)))); scales.append(float(np.exp(np.mean(np.log(rat)))))
    return {"r_dip": r, "formant_x": float(np.mean(scales)), "vowel_shape": float(np.mean(spreads))}
if __name__ == "__main__":
    out = {}
    for vid, src in (("girl", "raw/girl/A3-source-int8-slower"), ("boy", "raw/boy/A3-source-int8-slower")):
        for st in sys.argv[1:]:
            f = f"raw/{vid}/{st}"
            if not os.path.isdir(f): continue
            r = phon(f, src, 48000 if "48k" in st else 24000); out[f"{vid}/{st}"] = r
            print(f"{vid:4s} {st:40s} r_dip {r['r_dip']:.3f}  formants x{r['formant_x']:.3f}  vowel_shape {r['vowel_shape']:.3f}", flush=True)
    json.dump(out, open("phonetic.json", "w"), indent=1)
