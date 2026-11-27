"""Builds the listening kit: per voice, the test items, the narration as one
file, and each assembled sentence built word by word and said whole. Every
file is matched to -20 LUFS by gain alone (no compression)."""
import glob, os, shutil, sys
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts", "voice-benchmark"))
from package import match  # gain-only loudness match, true peak <= -1 dBTP
SRC, OUT = sys.argv[1], sys.argv[2]
SR = 24000
KEEP = ["1-short-2", "1-short-4", "2-conv-1", "2-conv-3", "3-expr-1", "3-expr-3"]
def put(d, name, x, sr=SR):
    y = match(x.astype(np.float64), sr)
    sf.write(os.path.join(d, name + ".wav"), np.clip(y, -1, 1), sr, subtype="PCM_16")
for v in sorted(os.listdir(SRC)):
    s = os.path.join(SRC, v)
    if not os.path.isdir(s): continue
    d = os.path.join(OUT, v); os.makedirs(d, exist_ok=True)
    rd = lambda f: sf.read(os.path.join(s, f + ".wav"), dtype="float32")[0]
    for k in KEEP: put(d, k, rd(k))
    narr = sorted(glob.glob(os.path.join(s, "4-narr-*.wav")))
    parts = []
    for f in narr: parts += [sf.read(f, dtype="float32")[0], np.zeros(int(0.35 * SR), np.float32)]
    put(d, "4-narration", np.concatenate(parts[:-1]))
    if v.endswith("shipped"):
        g = "girl" if v.startswith("girl") else "boy"
        for kind in ("joined", "whole"):
            x, sr = sf.read(f"/tmp/vb/samples/kokoro-current-{g}/5-assembled-0-{kind}.wav", dtype="float32")
            put(d, f"5-assembled-1-{kind}", x, sr)
        continue
    for n in (1, 2, 3):
        words = sorted(glob.glob(os.path.join(s, f"5-asm-{n}-w*.wav")))
        j = []
        for f in words: j += [sf.read(f, dtype="float32")[0], np.zeros(int(0.05 * SR), np.float32)]
        put(d, f"5-assembled-{n}-joined", np.concatenate(j[:-1]))
        put(d, f"5-assembled-{n}-whole", rd(f"5-asm-{n}-whole"))
    print(v)
