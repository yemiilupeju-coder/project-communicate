"""Playback stages: scheduling, buffering and browser playback, measured on a
capture of the running app (capture.mjs).

  python3 -I scripts/audio-qa/pipeline.py <capture-dir>  ->  <capture-dir>/pipeline.json

For every clip the app handed to Web Audio it finds the clip in the final
mix, and measures:
  - scheduling: where it actually started vs where the app scheduled it
  - integrity: whether the mix contains the clip unchanged (no dropped or
    corrupted samples), as the residual after subtracting it
  - joins: the silence between consecutive clips of one message
  - latency: from the tap to the first sound
and, over the whole mix: clipping, clicks, dropouts, loudness per clip.
"""

from __future__ import annotations

import json
import os
import sys
from math import gcd

import numpy as np
import pyloudnorm
from scipy.signal import resample_poly

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze import clicks, db, dropouts, read  # noqa: E402


def to_rate(x: np.ndarray, src: int, dst: int) -> np.ndarray:
    if src == dst:
        return x
    g = gcd(src, dst)
    return resample_poly(x, dst // g, src // g)


def sound_span(x: np.ndarray, rel_db: float = -45) -> tuple[int, int]:
    a = np.abs(x)
    if a.max() == 0:
        return 0, 0
    idx = np.where(a > a.max() * 10 ** (rel_db / 20))[0]
    return int(idx[0]), int(idx[-1])


def main() -> None:
    cap = sys.argv[1]
    ev = json.load(open(os.path.join(cap, "events.json")))
    mix, rate = read(os.path.join(cap, "output.wav"))
    first = ev["outputStartsAt"]
    marks = ev["marks"]

    def section(perf: float) -> str:
        name = "setup"
        for m in marks:
            if m["perf"] <= perf:
                name = m["name"]
        return name

    clips = []
    for c in ev["clips"]:
        x, sr = read(os.path.join(cap, c["file"]))
        y = to_rate(x, sr, rate)
        start = max(c["when"], c["ctxNow"])
        expect = int(round(start * rate - first * rate))
        win = int(0.1 * rate)
        lo = max(0, expect - win)
        seg = mix[lo : expect + win + len(y)]
        if len(seg) < len(y):
            continue
        corr = np.correlate(seg, y, mode="valid")
        at = lo + int(np.argmax(corr))
        got = mix[at : at + len(y)]
        resid = db(float(np.sqrt(np.mean((got - y) ** 2)))) - db(float(np.sqrt(np.mean(y**2))))
        tap = max((t for t in ev["taps"] if t["perf"] <= c["perf"]), key=lambda t: t["perf"], default=None)
        latency = None
        if tap:
            latency = (c["perf"] - tap["perf"]) + (start - c["ctxNow"]) * 1000 + (at - expect) / rate * 1000
        s0, s1 = sound_span(got)
        clips.append({
            "file": c["file"], "section": section(c["perf"]), "seconds": c["seconds"],
            "scheduled_s": start - first, "actual_s": at / rate,
            "schedule_error_ms": (at - expect) / rate * 1000,
            "residual_db": resid,
            "latency_ms": latency, "tap": tap["label"] if tap else None,
            "sound_start_s": (at + s0) / rate, "sound_end_s": (at + s1) / rate,
            "lufs": float(pyloudnorm.Meter(rate, filter_class="DeMan").integrated_loudness(np.concatenate([got, np.zeros(int(0.5 * rate))]))),
            "clicks": clicks(got, rate), "dropouts": len(dropouts(got, rate)),
        })
    # Joins: clips scheduled back to back (one message said as several clips)
    joins = []
    for a, b in zip(clips, clips[1:]):
        if 0 <= b["scheduled_s"] - (a["scheduled_s"] + a["seconds"]) < 0.2:
            joins.append({"section": b["section"], "silence_ms": (b["sound_start_s"] - a["sound_end_s"]) * 1000,
                          "scheduled_gap_ms": (b["scheduled_s"] - a["scheduled_s"] - a["seconds"]) * 1000})
    # Messages: one tap's worth of sound (clips joined or a single clip)
    by_section: dict[str, list] = {}
    for c in clips:
        by_section.setdefault(c["section"], []).append(c)

    def stats(v):
        v = [x for x in v if x is not None]
        return {"n": len(v), "mean": float(np.mean(v)), "min": float(np.min(v)), "max": float(np.max(v))} if v else None

    result = {
        "capture": {"seconds": len(mix) / rate, "rate": rate, "capture_gaps": ev["captureGaps"],
                    "browser_latency": ev["latency"], "errors": ev["errors"]},
        "output": {
            "clipped_samples": int(np.sum(np.abs(mix) >= 0.999)),
            "true_peak_dbtp": db(float(np.abs(resample_poly(mix, 4, 1)).max())),
            "clicks": int(sum(c["clicks"] for c in clips)),
            "dropouts": int(sum(c["dropouts"] for c in clips)),
        },
        "device_voice_used": len(ev["speech"]),
        "scheduling": {
            "error_ms": stats([abs(c["schedule_error_ms"]) for c in clips]),
            "residual_db": stats([c["residual_db"] for c in clips]),
        },
        "joins": {"count": len(joins), "silence_ms": stats([j["silence_ms"] for j in joins]), "list": joins},
        "latency_ms": {k: stats([c["latency_ms"] for c in v[:1]]) for k, v in by_section.items()},
        "loudness": {
            "clip_lufs_spread_lu": float(np.std([c["lufs"] for c in clips if c["lufs"] > -70])),
            "girl_lufs": float(np.mean([c["lufs"] for c in clips if c["section"].startswith("Girl") and c["lufs"] > -70] or [np.nan])),
            "boy_lufs": float(np.mean([c["lufs"] for c in clips if c["section"].startswith("Boy") and c["lufs"] > -70] or [np.nan])),
        },
        "sections": {k: {"clips": len(v), "whole_sentence": len(v) == 1} for k, v in by_section.items()},
        "clips": clips,
    }
    json.dump(result, open(os.path.join(cap, "pipeline.json"), "w"), indent=1)
    r = result
    print(f"capture gaps {r['capture']['capture_gaps']}, errors {len(r['capture']['errors'])}, device voice used {r['device_voice_used']}")
    print(f"output: clipped {r['output']['clipped_samples']}, true peak {r['output']['true_peak_dbtp']:.2f} dBTP, clicks {r['output']['clicks']}, dropouts {r['output']['dropouts']}")
    print(f"scheduling error ms {r['scheduling']['error_ms']}")
    print(f"clip integrity residual dB {r['scheduling']['residual_db']}")
    print(f"joins {r['joins']['count']}: silence ms {r['joins']['silence_ms']}")
    print(f"loudness: clip spread {r['loudness']['clip_lufs_spread_lu']:.2f} LU, girl {r['loudness']['girl_lufs']:.1f}, boy {r['loudness']['boy_lufs']:.1f} LUFS")
    for k, v in r["latency_ms"].items():
        print(f"latency {k}: {v and round(v['mean'])} ms  ({r['sections'][k]['clips']} clips)")


if __name__ == "__main__":
    main()
