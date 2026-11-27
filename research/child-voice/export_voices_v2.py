"""Builds the app's child voices for ADR 0012 (Nov 27, 2026): untouched Kokoro
styles, pitch set in the model, an even formant lift afterwards.

  girl: af_heart as is
  boy:  af_heart's timbre (decoder half) with am_puck's delivery (prosody half)

Writes public/voice-model/child-<id>-<hash>.bin and prints the pitch inputs
for src/voice/childVoices.ts. The pitch reference is the median of Kokoro's
own predicted pitch curve on the calibration sentences, on the int8 model
devices run, at the app's speed.

    KOKORO_VOICES=<voices-v1.0.bin> KOKORO_PITCH_MODEL=<kokoro-pitch-int8.onnx> \\
      python3 export_voices_v2.py <public-dir>
"""
import hashlib, json, os, sys
import numpy as np
import kv

public = sys.argv[1]
CAL = ["2-conv-1", "2-conv-2", "3-expr-1", "4-narr-01", "1-short-1"]
SPEED = 0.9
V = {k: v.reshape(-1, 256) for k, v in kv.VOICES.items()}
voices = {
    "girl": dict(table=V["af_heart"], f0=262, f0_range=1.10, lift=1.07, timbre="af_heart", prosody="af_heart"),
    "boy": dict(table=np.concatenate([V["af_heart"][:, :128], V["am_puck"][:, 128:]], axis=1), f0=244, f0_range=1.0, lift=1.04, timbre="af_heart", prosody="am_puck"),
}
out = {}
for vid, v in voices.items():
    fs = []
    for i in CAL:
        _, c = kv.say(kv.ITEMS[i]["tokens"], v["table"], speed=SPEED); fs += list(c[c > 40])
    ref = float(np.median(fs))
    data = v["table"].astype("<f4").tobytes(); assert len(data) == 510 * 256 * 4
    name = f"voice-model/child-{vid}-{hashlib.sha1(data).hexdigest()[:8]}.bin"
    open(os.path.join(public, name), "wb").write(data)
    out[vid] = {"table": name, "speed": SPEED, "f0Scale": round(v["f0"] / ref, 5), "f0Range": v["f0_range"], "f0Ref": round(ref, 5), "lift": v["lift"], "timbre": v["timbre"], "prosody": v["prosody"]}
print(json.dumps(out, indent=1))
