"""What the build trim (finish), the playback trim (soundSpan) and the limiter
remove, per word: milliseconds of speech cut at each end, and how much of the
cut was consonant (energy above -50 dB of the word's peak)."""
import json, numpy as np
C = json.load(open("corpus.json"))
def span(x, frac, pad):
    peak = np.abs(x).max(); idx = np.where(np.abs(x) > peak * frac)[0]
    return max(0, idx[0] - pad), min(len(x), idx[-1] + 1 + pad)
def speech_bounds(x, sr, floor_db=-50):
    # where audible speech (incl. weak consonants) starts and ends: 5 ms RMS above floor
    h = int(0.005 * sr); e = np.sqrt(np.convolve(x**2, np.ones(h) / h, "same"))
    thr = e.max() * 10 ** (floor_db / 20); idx = np.where(e > thr)[0]
    return idx[0], idx[-1]
rows = []
for vid in ("girl", "boy"):
    for k, v in C.items():
        x = np.fromfile(f"raw/{vid}/D-generated-shipped/{k}.f32", np.float32); sr = 24000
        s0, s1 = speech_bounds(x, sr)
        b0, b1 = span(x, 0.02, round(0.03 * sr))          # finish(): 2% of peak, 30 ms pad
        # playback trim works on the finished clip (louder, limited): 1% of its peak, 15 ms pad
        y = x[b0:b1]; p0, p1 = span(y, 0.01, round(0.015 * sr)); p0 += b0; p1 += b0
        cut_start = max(0, max(b0, p0) - s0) / sr * 1000
        cut_end = max(0, s1 - min(b1, p1)) / sr * 1000
        # fades eat into what's left: 8 ms build + 4 ms playback, linear
        rows.append(dict(voice=vid, item=k, text=v["text"], ph=v["ph"], cut_start_ms=cut_start, cut_end_ms=cut_end))
import collections
for vid in ("girl", "boy"):
    r = [x for x in rows if x["voice"] == vid]
    bad = sorted(r, key=lambda x: -(x["cut_start_ms"] + x["cut_end_ms"]))[:10]
    print(vid, "items with speech cut:", sum(1 for x in r if x["cut_start_ms"] + x["cut_end_ms"] > 5), "of", len(r))
    for x in bad: print(f"   {x['text']:12s} /{x['ph']}/  start cut {x['cut_start_ms']:.0f} ms, end cut {x['cut_end_ms']:.0f} ms")
json.dump(rows, open("trims.json", "w"), indent=1)
