"""Builds the app's child-voice files from the E5 profiles (chosen by TD after
listening, Nov 26, 2026):

  public/voice-model/kokoro-int8-f0-<hash>.onnx.part0..N   the int8 model with
      the in-graph pitch control (make_pitch_model.py), split into 24 MB parts
  public/voice-model/child-girl-<hash>.bin, child-boy-<hash>.bin   style tables

and prints the settings for src/voice/childVoices.ts and voiceModel.ts.
Calibration runs on the int8 model itself, so the shipped voices hit their
targets with the model devices actually use.

    KOKORO_VOICES=<voices-v1.0.bin> python3 export_voices.py <kokoro-v1.0.int8.onnx> <public-dir>
"""
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
src_model, public = sys.argv[1], sys.argv[2]
pitch_model = os.path.join(HERE, "kokoro-pitch-int8.onnx")
subprocess.run([sys.executable, os.path.join(HERE, "make_pitch_model.py"), src_model, pitch_model], check=True)
os.environ["KOKORO_PITCH_MODEL"] = pitch_model

import childvoice as C  # noqa: E402  (loads the model named above)
import numpy as np  # noqa: E402

out_dir = os.path.join(public, "voice-model")
model = open(pitch_model, "rb").read()
h = hashlib.sha1(model).hexdigest()[:8]
parts = []
PART = 24_000_000
for n, start in enumerate(range(0, len(model), PART)):
    name = f"voice-model/kokoro-int8-f0-{h}.onnx.part{n}"
    data = model[start : start + PART]
    open(os.path.join(public, name), "wb").write(data)
    parts.append({"path": name, "bytes": len(data)})

profiles = {
    "girl": C.Profile("girl", "af_heart", "af_heart", age=9, bright=-0.15, f0_range=1.10, speed=0.90),
    "boy": C.Profile("boy", "am_puck", "am_puck", age=9, boy=True, f0_range=1.0, speed=0.90),
}
voices = {}
for vid, p in profiles.items():
    C.calibrate(p)
    table, pitch = C.export_style(p)
    data = table.astype("<f4").tobytes()
    assert len(data) == 510 * 256 * 4
    th = hashlib.sha1(data).hexdigest()[:8]
    name = f"voice-model/child-{vid}-{th}.bin"
    open(os.path.join(public, name), "wb").write(data)
    voices[vid] = {
        "table": name,
        "from": {"timbre": p.timbre, "prosody": p.prosody, "age": p.age, "vt_gain": round(p.vt_gain, 5), "bright": p.bright},
        "measured": {k: round(v, 4) for k, v in p.measured.items()},
        **{k: round(float(v), 5) for k, v in pitch.items()},
    }
print(json.dumps({"model_parts": parts, "voices": voices}, indent=1))
