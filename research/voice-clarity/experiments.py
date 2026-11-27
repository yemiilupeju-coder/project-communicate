"""Experiments on the phonetic corpus (raw generation + transformation, before
the app's finish step, which was shown to change nothing measurable).
Every experiment: same text, same source voice, same speed (0.9)."""
import json, os, sys, time
import numpy as np
os.environ["KOKORO_PITCH_MODEL"] = "/home/claude/project-communicate/research/child-voice/kokoro-pitch-int8.onnx"
sys.path.insert(0, "/home/claude/childvoice-rd")
import kv, transforms as T  # noqa: E402
C = json.load(open("corpus.json"))
V = {k: v.reshape(-1, 256) for k, v in kv.VOICES.items()}
VT = np.load("/home/claude/childvoice-rd/vt_dir_flat.npy"); BR = np.load("/home/claude/childvoice-rd/bright_dir.npy"); BRS = BR / (BR @ BR)
SPEED = 0.9
SENT = [k for k in C if k.startswith("s-")]
def median_curve(t):
    fs = []
    for k in SENT:
        _, c = kv.say(C[k]["tokens"], t, speed=SPEED); fs += list(c[c > 40])
    return float(np.median(fs))
def table(timbre, prosody, vt=0.0, bright=0.0):
    t = kv.mix(timbre, prosody).copy(); t[:, :128] += np.log(1 + vt) * VT + np.log(1 + bright) * BRS; return t
def gen(t, f0, rng):
    m = median_curve(t); return lambda tok: kv.say(tok, t, f0_scale=f0 / m, f0_range=rng, f0_ref=m, speed=SPEED)[0]
src = lambda name: (lambda tok: kv.say(tok, name, speed=SPEED)[0])  # noqa: E731
E = {}
for vid, s, prosody, f0, rng, form in [("girl", "af_heart", "af_heart", 262, 1.1, 1.14), ("boy", "am_puck", "am_puck", 244, 1.0, 1.27)]:
    g_pitch = gen(table(s, prosody), f0, rng)
    E[f"{vid}/X-C-pitch-only-no-timbre"] = g_pitch                                                           # C: questionable stage removed
    E[f"{vid}/X-D1-psola-praat"] = (lambda tok, s=s, f0=f0, rng=rng, form=form: T.praat_change(src(s)(tok), form, f0, rng))  # D: conventional
    E[f"{vid}/X-D2-pitch-model+even-filter"] = (lambda tok, g=g_pitch, form=form: T.envelope_filter(g(tok), form, max_db=15.0))  # D/J: in-model pitch + even formant scaling
    E[f"{vid}/X-E-world"] = (lambda tok, s=s, f0=f0, form=form: T.world_transform(src(s)(tok), f0 / median_curve(V[s]), form))  # E: WORLD
# E6 hybrid as tested by TD
g6 = gen(table("af_heart", "af_heart", 0.1234, -0.15), 262, 1.1); E["girl/X-J1-e6-hybrid"] = lambda tok: T.envelope_filter(g6(tok), 1.111)
b6 = gen(table("am_puck", "am_puck", 0.205), 244, 1.0); E["boy/X-J1-e6-hybrid"] = lambda tok: T.envelope_filter(b6(tok), 1.17)
# boy built from af_heart's timbre with am_puck's delivery: in-model pitch + even filter (E7b)
b7 = gen(table("af_heart", "am_puck"), 244, 1.0)
E["boy/X-J2-woman-timbre+pitch+even-filter"] = lambda tok: T.envelope_filter(b7(tok), 1.09)
E["boy/X-J2b-woman-timbre+pitch-only"] = b7
times = {}
for name, fn in E.items():
    d = f"raw/{name}"; os.makedirs(d, exist_ok=True); t0 = time.time()
    for k, v in C.items():
        x = kv.trim(fn(v["tokens"])).astype(np.float32); pk = float(np.abs(x).max())
        if pk > 0.89: x *= 0.89 / pk
        x.tofile(f"{d}/{k}.f32")
    times[name] = round(time.time() - t0, 1); print(name, times[name], "s", flush=True)
json.dump(times, open("experiment_times.json", "w"), indent=1)
