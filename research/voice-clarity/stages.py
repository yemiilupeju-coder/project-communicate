"""Renders the corpus at each generation stage (raw float32, before any app
processing). Later stages (finish, rate conversion, MP3, playback trim) are
applied by the app's own code in stages_app.ts."""
import json, os, sys
import numpy as np, onnxruntime as ort
C = json.load(open("corpus.json"))
V = dict(np.load("/home/claude/childvoice/voices-v1.0.bin"))
o = ort.SessionOptions(); o.intra_op_num_threads = 2
fp32 = ort.InferenceSession("/home/claude/childvoice-rd/kokoro-pitch.onnx", o, providers=["CPUExecutionProvider"])
int8 = ort.InferenceSession("/home/claude/project-communicate/research/child-voice/kokoro-pitch-int8.onnx", o, providers=["CPUExecutionProvider"])
P = "/home/claude/project-communicate/public/voice-model/"
SHIP = {
  "girl": dict(table=np.fromfile(P + "child-girl-7cf41a33.bin", "<f4").reshape(510, 256), src="af_heart", speed=0.9, f0_scale=1.41232, f0_range=1.1, f0_ref=185.51022),
  "boy": dict(table=np.fromfile(P + "child-boy-b61efa8c.bin", "<f4").reshape(510, 256), src="am_puck", speed=0.9, f0_scale=2.09756, f0_range=1.0, f0_ref=116.16351),
}
def run(sess, tokens, table, speed=1.0, f0_scale=1.0, f0_range=1.0, f0_ref=200.0):
    t = np.array([[0, *tokens, 0]], np.int64)
    st = table.reshape(-1, 256)[min(len(tokens), 510) - 1][None].astype(np.float32)
    f = lambda v: np.array([v], np.float32)
    return sess.run(None, {"tokens": t, "style": st, "speed": f(speed), "f0_scale": f(f0_scale), "f0_range": f(f0_range), "f0_ref": f(f0_ref)})[0].reshape(-1).astype(np.float32)
for vid, s in SHIP.items():
    src = V[s["src"]].reshape(510, 256)
    pitch = dict(f0_scale=s["f0_scale"], f0_range=s["f0_range"], f0_ref=s["f0_ref"])
    stages = {
        "A-source-fp32": (fp32, src, {}),
        "A2-source-int8": (int8, src, {}),
        "A3-source-int8-slower": (int8, src, dict(speed=0.9)),
        "B-pitch-only": (int8, src, dict(speed=0.9, **pitch)),
        "C-timbre-only": (int8, s["table"], dict(speed=0.9)),
        "D-generated-shipped": (int8, s["table"], dict(speed=0.9, **pitch)),
        "D32-generated-fp32": (fp32, s["table"], dict(speed=0.9, **pitch)),
    }
    for name, (sess, table, kw) in stages.items():
        d = f"raw/{vid}/{name}"; os.makedirs(d, exist_ok=True)
        for k, v in C.items():
            run(sess, v["tokens"], table, **kw).tofile(f"{d}/{k}.f32")
        print(vid, name, flush=True)
