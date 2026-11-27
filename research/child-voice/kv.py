"""Kokoro with native pitch control, for the child-voice experiments."""
import json
import os

import numpy as np
import onnxruntime as ort
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 24000
# Kokoro v1.0 voices (npz) and the pitch-controllable model made by make_pitch_model.py
VOICES_PATH = os.environ.get("KOKORO_VOICES", os.path.join(HERE, "..", "..", "scripts", "voices", "models", "voices-v1.0.bin"))
MODEL_PATH = os.environ.get("KOKORO_PITCH_MODEL", os.path.join(HERE, "kokoro-pitch.onnx"))
VOICES = dict(np.load(VOICES_PATH))
ITEMS = json.load(open(os.path.join(HERE, "tokens.json")))

_opts = ort.SessionOptions()
_opts.intra_op_num_threads = 2
_sess = ort.InferenceSession(MODEL_PATH, _opts, providers=["CPUExecutionProvider"])


def style_for(voice, n_tokens):
    """voice: a name, or a (510, 256) table. Row chosen by token count, as in the app."""
    table = VOICES[voice] if isinstance(voice, str) else voice
    table = table.reshape(-1, 256)
    return table[min(n_tokens, len(table)) - 1][None, :].astype(np.float32)


def mix(dec_voice, pro_voice):
    """Decoder half (timbre) from one voice, predictor half (prosody) from another."""
    a = VOICES[dec_voice].reshape(-1, 256) if isinstance(dec_voice, str) else dec_voice.reshape(-1, 256)
    b = VOICES[pro_voice].reshape(-1, 256) if isinstance(pro_voice, str) else pro_voice.reshape(-1, 256)
    return np.concatenate([a[:, :128], b[:, 128:]], axis=1)


def say(tokens, voice, f0_scale=1.0, f0_range=1.0, f0_ref=200.0, speed=1.0):
    t = np.array([[0, *tokens, 0]], dtype=np.int64)
    out = _sess.run(
        None,
        {
            "tokens": t,
            "style": style_for(voice, len(tokens)),
            "speed": np.array([speed], dtype=np.float32),
            "f0_scale": np.array([f0_scale], dtype=np.float32),
            "f0_range": np.array([f0_range], dtype=np.float32),
            "f0_ref": np.array([f0_ref], dtype=np.float32),
        },
    )
    return out[0].reshape(-1).astype(np.float32), out[1].reshape(-1)


def trim(x, thresh_db=-50):
    if len(x) == 0:
        return x
    env = np.abs(x)
    thr = 10 ** (thresh_db / 20) * max(env.max(), 1e-9)
    idx = np.where(env > thr)[0]
    if len(idx) == 0:
        return x
    a = max(idx[0] - int(0.01 * SR), 0)
    b = min(idx[-1] + int(0.03 * SR), len(x))
    return x[a:b]


def write(path, x, sr=SR):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, np.clip(x, -1, 1), sr, subtype="PCM_16")
