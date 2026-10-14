"""Refresh the VirtuBrain data snapshot from the live platform.

Run from a machine that can reach virtubrain.higgsfield.app:  npm run sync-data
Writes public/data/master-taxonomy.json and public/data/pain-points.json, then rebuild.
The site ships this snapshot so it works on any host without a proxy."""
import json, pathlib, urllib.request
SRC = "https://virtubrain.higgsfield.app/data/"
OUT = pathlib.Path(__file__).resolve().parent.parent / "public/data"
for name in ("master-taxonomy.json", "pain-points.json"):
    with urllib.request.urlopen(SRC + name, timeout=60) as r:
        data = json.load(r)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print("updated", name)
