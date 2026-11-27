"""Renders experiments 1-6 (4 needs neural-VC weights; see vc/) for the girl and
boy profiles, on the identical script. One WAV per item, 24 kHz, no loudness
processing (that is done identically for every variant when packaging).

    python3 render_experiments.py out/
"""
import json
import os
import sys

import numpy as np

import kv
import transforms as T

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
ITEMS = list(kv.ITEMS)
PITCH_ITEMS = ["2-conv-1", "2-conv-2", "3-expr-1", "4-narr-01", "1-short-1"]
SPEED = 0.9  # Kokoro's default reads narration at 265-333 words a minute

# Profiles. Settings differ by source: a female source needs a small move, a
# male source a large one (the brief: do not assume identical settings).
PROFILES = {
    "girl": dict(source="af_heart", prosody="af_heart", f0=265, range=1.10,
                 dsp_formant=1.15, e5_vt=0.18, e6_vt=0.09, e6_filter=1.07),
    "boy": dict(source="am_puck", prosody="am_puck", f0=240, range=1.0,
                dsp_formant=1.30, e5_vt=0.30, e6_vt=0.20, e6_filter=1.08),
}


def render(name, fn):
    """Writes one WAV per item. The PSOLA and WORLD outputs can exceed full
    scale, and writing them would hard-clip them. Any item whose peak is above
    -1 dBFS is turned down (gain only) before writing; the same rule applies to
    every variant, and the final loudness match happens later in packaging."""
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    for i in ITEMS:
        x = kv.trim(fn(i))
        peak = float(np.abs(x).max()) if len(x) else 0.0
        if peak > 0.89:
            x = x * (0.89 / peak)
        kv.write(os.path.join(d, i + ".wav"), x)
    print("rendered", name, flush=True)


settings = {}
for prof, p in PROFILES.items():
    raw = kv.mix(p["source"], p["prosody"])
    src_median = T.curve_median(raw, PITCH_ITEMS, SPEED)
    ratio = p["f0"] / src_median
    cache = {i: kv.say(kv.ITEMS[i]["tokens"], raw, speed=SPEED)[0] for i in ITEMS}

    # E1 original adult voice
    render(f"{prof}-e1-original", lambda i: cache[i])
    # E2 conventional pitch + formant (PSOLA)
    render(f"{prof}-e2-psola", lambda i: T.praat_change(cache[i], p["dsp_formant"], p["f0"], p["range"]))
    # E3 WORLD
    render(f"{prof}-e3-world", lambda i: T.world_transform(cache[i], ratio, p["dsp_formant"]))
    # E3b Childrenize with fixed parameters (its own rule: piecewise warp for a
    # female source, linear for a male source; vowels stretched 1.2x)
    cw = "piecewise" if p["source"].startswith("af") else "linear"
    render(f"{prof}-e3b-childrenize", lambda i: T.childrenize_method(cache[i], p["f0"], cw, p["dsp_formant"], 1.2))
    # E5 age-conditioned neural synthesis (in-model)
    t5 = T.voice_table(p["source"], p["prosody"], p["e5_vt"])
    m5 = T.curve_median(t5, PITCH_ITEMS, SPEED)
    r5 = p["f0"] / m5
    render(f"{prof}-e5-neural", lambda i: kv.say(kv.ITEMS[i]["tokens"], t5, f0_scale=r5, f0_range=p["range"], f0_ref=m5, speed=SPEED)[0])
    # E6 hybrid: smaller style move + envelope filter
    t6 = T.voice_table(p["source"], p["prosody"], p["e6_vt"])
    m6 = T.curve_median(t6, PITCH_ITEMS, SPEED)
    r6 = p["f0"] / m6
    render(f"{prof}-e6-hybrid", lambda i: T.envelope_filter(kv.say(kv.ITEMS[i]["tokens"], t6, f0_scale=r6, f0_range=p["range"], f0_ref=m6, speed=SPEED)[0], p["e6_filter"]))
    settings[prof] = {**p, "speed": SPEED, "source_f0_median": src_median, "e2_e3_f0_ratio": ratio, "e5_f0_scale": r5, "e6_f0_scale": r6}

# A boy from the female source (alternative to the male-source boy)
p = PROFILES["boy"]
tb = T.voice_table("af_heart", "am_puck", 0.06)
rb = p["f0"] / T.curve_median(tb, PITCH_ITEMS, SPEED)
render("boy-e5b-neural-from-female", lambda i: kv.say(kv.ITEMS[i]["tokens"], tb, f0_scale=rb, speed=SPEED)[0])
settings["boy_e5b"] = {"timbre": "af_heart", "prosody": "am_puck", "vt": 0.06, "f0": p["f0"], "f0_scale": rb, "speed": SPEED}

json.dump(settings, open(os.path.join(OUT, "settings.json"), "w"), indent=1)
