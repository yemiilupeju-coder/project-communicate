"""Re-renders the neural experiments (E5, E5b, E6) with the calibrated control
system, into the same experiment folders."""
import json, os, sys
import numpy as np
import kv, childvoice as C, transforms as T
OUT = sys.argv[1]
ITEMS = list(kv.ITEMS)
def render(name, fn):
    d = os.path.join(OUT, name); os.makedirs(d, exist_ok=True)
    for i in ITEMS:
        x = kv.trim(fn(i)); pk = float(np.abs(x).max())
        if pk > 0.89: x = x * (0.89 / pk)
        kv.write(os.path.join(d, i + ".wav"), x)
    print("rendered", name, flush=True)
ONLY = sys.argv[2:]  # optional: render only these
profiles = {
    "girl-e5-neural": C.Profile("girl", "af_heart", "af_heart", age=9, bright=-0.15),
    "boy-e5-neural": C.Profile("boy", "am_puck", "am_puck", age=9, boy=True, f0_range=1.0),
    "boy-e5b-neural-from-female": C.Profile("boy-f", "af_heart", "am_puck", age=9, boy=True, f0_range=1.0),
}
info = {}
for name, p in profiles.items():
    if ONLY and name not in ONLY: continue
    C.calibrate(p); info[name] = C.describe(p); print(name, p.vt_gain, p.f0_scale, p.measured, flush=True)
    render(name, lambda i: C.say(p, kv.ITEMS[i]["tokens"]))
    # E6 hybrid: half the timbre move in the model, the rest by envelope filter
    if name != "boy-e5b-neural-from-female":
        h = C.Profile(**{k: v for k, v in C.asdict(p).items()}); h.vt_gain = p.vt_gain / 2
        rest = (1 + p.vt_gain) / (1 + h.vt_gain)
        e6 = name.replace("e5-neural", "e6-hybrid")
        render(e6, lambda i: T.envelope_filter(C.say(h, kv.ITEMS[i]["tokens"]), rest))
        info[e6] = {**C.describe(h), "envelope_filter": rest}
path = os.path.join(OUT, "neural_settings.json")
old = json.load(open(path)) if os.path.exists(path) else {}
old.update(info)
json.dump(old, open(path, "w"), indent=1, default=str)
