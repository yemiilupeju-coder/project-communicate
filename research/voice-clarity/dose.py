import json, os, sys
import numpy as np
os.environ["KOKORO_PITCH_MODEL"] = "/home/claude/project-communicate/research/child-voice/kokoro-pitch-int8.onnx"
sys.path.insert(0, "/home/claude/childvoice-rd")
import kv, transforms as T  # noqa
C = json.load(open("corpus.json")); SPEED = 0.9
SENT = [k for k in C if k.startswith("s-")]
def med(t):
    fs = []
    for k in SENT:
        _, c = kv.say(C[k]["tokens"], t, speed=SPEED); fs += list(c[c > 40])
    return float(np.median(fs))
for vid, timbre, prosody, f0, rng in [("girl", "af_heart", "af_heart", 262, 1.1), ("boy", "af_heart", "am_puck", 244, 1.0)]:
    t = kv.mix(timbre, prosody); m = med(t)
    base = {k: kv.say(v["tokens"], t, f0_scale=f0 / m, f0_range=rng, f0_ref=m, speed=SPEED)[0] for k, v in C.items()}
    for a in (1.0, 1.04, 1.07, 1.10, 1.14):
        d = f"raw/{vid}/Y-formant-{a:.2f}"; os.makedirs(d, exist_ok=True)
        for k, x in base.items():
            y = x if a == 1.0 else T.envelope_filter(x, a, max_db=15.0)
            y = kv.trim(y).astype(np.float32); pk = float(np.abs(y).max())
            if pk > 0.89: y *= 0.89 / pk
            y.tofile(f"{d}/{k}.f32")
        print(vid, a, flush=True)
