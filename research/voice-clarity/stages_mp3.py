# G: the build's exact MP3 settings (ffmpeg, mono, 24 kHz, 16-bit in), decoded at
# 48 kHz as the browser's decodeAudioData does for a 48 kHz context; then the
# playback trim (H-pack). Also 128k and 160k, and Opus, for comparison.
import glob, os, subprocess, numpy as np
def soundspan_trim(x, sr):
    peak = np.max(np.abs(x)); fl = peak * 0.01
    idx = np.where(np.abs(x) >= fl)[0]
    if not len(idx): return x
    pad = round(sr * 0.015); s, e = max(0, idx[0] - pad), min(len(x), idx[-1] + 1 + pad)
    y = x[s:e].copy(); fade = min(round(sr * 0.004), len(y) // 2)
    r = np.arange(fade) / fade; y[:fade] *= r; y[len(y) - fade:] *= r[::-1]
    return y
for vid in ("girl", "boy"):
    for codec, args in [("mp3-96k", ["-b:a","96k","-f","mp3"]), ("mp3-128k", ["-b:a","128k","-f","mp3"]), ("mp3-160k", ["-b:a","160k","-f","mp3"]), ("opus-64k", ["-c:a","libopus","-b:a","64k","-f","ogg"])]:
        out = f"raw/{vid}/G-{codec}-48k"; os.makedirs(out, exist_ok=True)
        hout = f"raw/{vid}/H-pack-playback-{codec}-48k"; os.makedirs(hout, exist_ok=True)
        for p in glob.glob(f"raw/{vid}/E-finished/*.f32"):
            x = np.fromfile(p, np.float32)
            pcm = (np.clip(x, -1, 1) * 32767).round().astype("<i2").tobytes()
            enc = subprocess.run(["ffmpeg","-v","error","-f","s16le","-ar","24000","-ac","1","-i","pipe:0",*args,"pipe:1"], input=pcm, capture_output=True, check=True).stdout
            dec = np.frombuffer(subprocess.run(["ffmpeg","-v","error","-i","pipe:0","-ar","48000","-ac","1","-f","f32le","pipe:1"], input=enc, capture_output=True, check=True).stdout, np.float32)
            dec.tofile(f"{out}/{os.path.basename(p)}")
            soundspan_trim(dec.copy(), 48000).astype(np.float32).tofile(f"{hout}/{os.path.basename(p)}")
        print(vid, codec, flush=True)
