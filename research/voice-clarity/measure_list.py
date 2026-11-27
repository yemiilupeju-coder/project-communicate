import json, sys, measure_stages as S
res = {}
for vid in ("girl", "boy"):
    for st in sys.argv[2:]:
        import os
        f = f"raw/{vid}/{st}"
        if not os.path.isdir(f): continue
        res[f"{vid}/{st}"] = r = S.stage_summary(f, 24000)
        print(f"{vid:4s} {st:40s} " + "  ".join(f"{k} {v:.3f}" for k, v in r.items()), flush=True)
json.dump(res, open(sys.argv[1], "w"), indent=1)
