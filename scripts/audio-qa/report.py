"""Scores a run against the audio-quality targets and writes the report.

  python3 -I scripts/audio-qa/report.py <label> --samples <dir> [--capture <dir>]
      [--encoding <json>] [--compare <old-label>]

  --samples   voices made by samples.ts (generation stage)
  --capture   a capture of the running app (capture.mjs + pipeline.py):
              scheduling, buffering and browser playback stages
  --encoding  output of encoding.py (encoding stage)

Writes docs/audio-qa/runs/<label>.json and .md (+ waveform/spectrogram PNGs).
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze import analyze_voice, plot, vocal_tract_scale, vocal_tract_scale_aligned  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RUNS = os.path.join(ROOT, "docs", "audio-qa", "runs")
TARGETS = json.load(open(os.path.join(os.path.dirname(__file__), "targets.json")))
# Measured on Kokoro's am_eric against its US women's voices: men's vocal
# tracts are about 13.5% longer (Peterson & Barney report about the same).
MALE_TO_FEMALE = 0.865


def arg(name: str) -> str | None:
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def ok(value: float, rule: dict) -> bool:
    return rule.get("min", -np.inf) <= value <= rule.get("max", np.inf)


def target_text(t: dict) -> str:
    if "min" in t and "max" in t:
        return f"{t['min']} to {t['max']}"
    return f"≥ {t['min']}" if "min" in t else f"≤ {t['max']}"


def rows(values: dict, rules: dict) -> list[dict]:
    return [{"metric": m, "value": values[m], "target": r, "pass": ok(values[m], r)} for m, r in rules.items() if m in values]


def generation(samples: str, label: str) -> dict:
    voices = json.load(open(os.path.join(samples, "voices.json")))
    out = {}
    for v in voices:
        name = v["name"]
        folder = os.path.join(samples, name)
        s = analyze_voice(folder)["summary"]
        # A voice generated in the model is compared with its own table at neutral pitch
        # (base_<name>); a reshaped voice with the adult voice it came from.
        own = os.path.join(samples, f"base_{name}")
        base = own if v.get("table") and os.path.isdir(own) else os.path.join(samples, f"base_{v['kokoro']}")
        if (v["reshape"] or v.get("table")) and os.path.isdir(base):
            measured = (
                vocal_tract_scale_aligned(folder, base) if v.get("table") else vocal_tract_scale(folder, [base])
            )
            s["vocal_tract_scale_vs_base"] = measured
            s["vocal_tract_scale"] = measured * (MALE_TO_FEMALE if v["kokoro"].startswith("am_") else 1.0)
        words = os.path.join(samples, "clarity", name)
        if os.path.isdir(words):
            from clarity import clarity  # pocketsphinx is loaded only when there is a clarity corpus

            c = clarity(words)
            s.update({k: c[k] for k in ("r_dip", "word_accuracy_pct", "sentence_wer_pct")})
        plot(folder, os.path.join(RUNS, f"{label}-{name}.png"), f"{label}: {name} ({v['kokoro']})")
        rules = {**TARGETS["all"], **TARGETS["voices"].get(name, {})}
        out[name] = {"kokoro": v["kokoro"], "reshape": v["reshape"], "summary": s, "checks": rows(s, rules)}
    if "girl" in out and "boy" in out:
        g, b = out["girl"]["summary"], out["boy"]["summary"]
        pair = {
            "loudness_difference_lu": abs(g["lufs"] - b["lufs"]),
            "boy_formants_below_girl_pct": 100 * (1 - b["vocal_tract_scale"] / g["vocal_tract_scale"]),
            "quality_difference_ovrl": abs(g["dnsmos_ovrl"] - b["dnsmos_ovrl"]),
        }
        out["_pair"] = {"summary": pair, "checks": rows(pair, TARGETS["pair"])}
    return out


def playback(capture: str) -> dict:
    p = json.load(open(os.path.join(capture, "pipeline.json")))
    # "setup" is choosing a voice: a one-time download, not a tap-to-speech delay.
    lat = [v["max"] for k, v in p["latency_ms"].items() if v and k != "setup"]
    values = {
        "capture_gaps": p["capture"]["capture_gaps"],
        "device_voice_used": p["device_voice_used"],
        "clipped_samples": p["output"]["clipped_samples"],
        "clicks": p["output"]["clicks"],
        "dropouts": p["output"]["dropouts"],
        "schedule_error_ms_max": p["scheduling"]["error_ms"]["max"],
        "clip_integrity_worst_db": p["scheduling"]["residual_db"]["max"],
        "latency_ms_max": max(lat) if lat else 0,
        "clip_lufs_spread_lu": p["loudness"]["clip_lufs_spread_lu"],
        "girl_boy_lufs_difference": abs(p["loudness"]["girl_lufs"] - p["loudness"]["boy_lufs"]),
    }
    return {"summary": values, "checks": rows(values, TARGETS["playback"]), "joins": p["joins"]["silence_ms"],
            "sections": p["sections"], "worst_clips": sorted(p["clips"], key=lambda c: -c["residual_db"])[:3]}


def encoding(path: str) -> dict:
    e = json.load(open(path))
    rate = e.get("_chosen", "48k")
    values = {"snr_db": e[rate]["snr_db"], "dnsmos_ovrl_loss": e["source"]["dnsmos_ovrl"] - e[rate]["dnsmos_ovrl"]}
    return {"bitrate": rate, "summary": values, "checks": rows(values, TARGETS["encoding"]), "all": e}


def table(title: str, checks: list[dict], before: dict | None) -> list[str]:
    met = sum(c["pass"] for c in checks)
    out = ["", f"### {title} ({met}/{len(checks)} targets met)", ""]
    out += ["| Metric | Target | Before | Now | |", "|---|---|---|---|---|"] if before is not None else ["| Metric | Target | Value | |", "|---|---|---|---|"]
    for c in checks:
        prev = ""
        if before is not None:
            ov = before.get(c["metric"])
            prev = f"{ov:.3g} | " if isinstance(ov, (int, float)) else "– | "
        out.append(f"| {c['metric']} | {target_text(c['target'])} | {prev}{c['value']:.3g} | {'✅' if c['pass'] else '❌'} |")
    return out


def main() -> None:
    label = sys.argv[1]
    os.makedirs(RUNS, exist_ok=True)
    result: dict = {"label": label}
    if arg("--samples"):
        result["generation"] = generation(arg("--samples"), label)
    if arg("--encoding"):
        result["encoding"] = encoding(arg("--encoding"))
    if arg("--capture"):
        result["playback"] = playback(arg("--capture"))
    json.dump(result, open(os.path.join(RUNS, f"{label}.json"), "w"), indent=1, default=float)

    old = json.load(open(os.path.join(RUNS, f"{arg('--compare')}.json"))) if arg("--compare") else None
    md = [f"# Audio QA run: {label}", ""]
    if old:
        md += [f"Before = run **{old['label']}**.", ""]
    total = passed = 0
    if "generation" in result:
        md += ["## Generation (the voice maker's output)"]
        for name, v in result["generation"].items():
            if name.startswith("base_") or name.startswith("adult"):
                continue
            before = old["generation"].get(name, {}).get("summary", {}) if old and "generation" in old else None
            what = "Girl and boy together" if name == "_pair" else f"{name}, from {v['kokoro']}, reshape {v['reshape']}"
            md += table(what, v["checks"], before)
            total += len(v["checks"])
            passed += sum(c["pass"] for c in v["checks"])
            if not name.startswith("_"):
                md += ["", f"![{name}]({label}-{name}.png)"]
    if "encoding" in result:
        e = result["encoding"]
        md += ["", f"## Encoding (MP3 at {e['bitrate']}bps for the built-in packs)"]
        md += table("MP3 encoding", e["checks"], old.get("encoding", {}).get("summary", {}) if old else None)
        total += len(e["checks"])
        passed += sum(c["pass"] for c in e["checks"])
    if "playback" in result:
        p = result["playback"]
        md += ["", "## Scheduling, buffering and browser playback (captured from the running app)"]
        md += table("Playback path", p["checks"], old.get("playback", {}).get("summary", {}) if old else None)
        j = p["joins"]
        if j:
            md += ["", f"Joined clips (a message said as several clips): {j['n']} joins, silence between them {j['min']:.0f}–{j['max']:.0f} ms."]
        whole = [k for k, v in p["sections"].items() if "Speak" in k or "typed" in k]
        md += ["", "| Moment | Clips played | Said whole |", "|---|---|---|"]
        md += [f"| {k} | {p['sections'][k]['clips']} | {'yes' if p['sections'][k]['whole_sentence'] else 'no'} |" for k in whole]
        total += len(p["checks"])
        passed += sum(c["pass"] for c in p["checks"])
    md.insert(2, f"**{passed} of {total} targets met.**\n")
    open(os.path.join(RUNS, f"{label}.md"), "w").write("\n".join(md) + "\n")
    print(f"{label}: {passed}/{total} targets met")
    for stage in ("generation",):
        for name, v in result.get(stage, {}).items():
            fails = [f"{c['metric']}={c['value']:.3g}" for c in v.get("checks", []) if not c["pass"]]
            if fails:
                print(f"  {name}: " + ", ".join(fails))
    for stage in ("encoding", "playback"):
        if stage in result:
            fails = [f"{c['metric']}={c['value']:.3g}" for c in result[stage]["checks"] if not c["pass"]]
            if fails:
                print(f"  {stage}: " + ", ".join(fails))


if __name__ == "__main__":
    main()
