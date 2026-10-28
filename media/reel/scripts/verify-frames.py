# SPDX-License-Identifier: Apache-2.0
# For each logged hover, write the screencast frame just before the tooltip was logged, cropped to
# the union of the pointer's card area and the tooltip, for checking the card by eye.
import json, sys, bisect, subprocess, os
d = sys.argv[1]
fr = [json.loads(l) for l in open(f"{d}/frames.jsonl")]
ts = [f["t"] for f in fr]
os.makedirs(f"{d}/verify", exist_ok=True)
for k, l in enumerate(open(f"{d}/hovers.jsonl")):
    h = json.loads(l); tt = h.get("tooltip")
    if not tt: continue
    i = max(0, bisect.bisect(ts, h["t"] - 0.15) - 1)
    b = tt["box"]
    x0 = int(max(0, min(b["x"], h["x"] - 160))); y0 = int(max(0, min(b["y"], h["y"] - 160)))
    x1 = int(min(1920, max(b["x"] + b["w"], h["x"] + 160))); y1 = int(min(1080, max(b["y"] + b["h"], h["y"] + 160)))
    out = f"{d}/verify/{k:02d}-{tt['name'].replace(' ', '_').replace('/', '_')}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{d}/frames/{fr[i]['n']:06d}.jpg", "-vf", f"crop={x1-x0}:{y1-y0}:{x0}:{y0}", out], check=True)
    print(out, fr[i]["n"])
