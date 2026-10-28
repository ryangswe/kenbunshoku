# SPDX-License-Identifier: Apache-2.0
# Per logged hover: pointer arrival and the reveal (the last screencast frame of the burst in which
# the tooltip's art lands), in seconds from the capture's first frame. Paused-video takes only.
import json, sys
d = sys.argv[1]
fr = [json.loads(l) for l in open(f"{d}/frames.jsonl")]
ms = [json.loads(l) for l in open(f"{d}/mouse.jsonl")]
hv = [json.loads(l) for l in open(f"{d}/hovers.jsonl")]
t0 = fr[0]["t"]
for h in hv:
    tt = h.get("tooltip")
    if not tt: continue
    arr = next(m["t"] for m in ms if abs(m["x"] - h["x"]) < 0.5 and abs(m["y"] - h["y"]) < 0.5)
    burst = [f["t"] for f in fr if arr - 0.65 <= f["t"] <= arr + 0.8]
    rev = max(burst) if burst else None
    print(f'{tt["name"]:<18} card {h["x"]},{h["y"]} box {tt["box"]["x"]:.0f},{tt["box"]["y"]:.0f} arrive {arr-t0:6.2f} reveal {rev-t0 if rev else -1:6.2f}')
