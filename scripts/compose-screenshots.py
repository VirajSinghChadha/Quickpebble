#!/usr/bin/env python3
"""Joins the UI and page captures from `QP_SMOKE_SHOTS=1 electron .` into the README/site screenshots (Pillow required)."""
import json, os, sys
from PIL import Image

src = os.environ.get("QP_SHOTS_DIR", "/tmp/qp-shots")
out = sys.argv[1] if len(sys.argv) > 1 else "docs/screenshots"
os.makedirs(out, exist_ok=True)
meta = json.load(open(f"{src}/meta.json"))
CHROME = 92  # tab strip + toolbar + bookmarks bar, CSS px
for name, m in meta.items():
    ui = Image.open(f"{src}/{name}-ui.png").convert("RGB")
    scale = ui.width / 1280
    if m["hasPage"]:
        page = Image.open(f"{src}/{name}-page.png").convert("RGB")
        ui.paste(page, (0, round(ui.height - page.height) if False else round(CHROME * scale)))
    w = 1600
    img = ui.resize((w, round(ui.height * w / ui.width)), Image.LANCZOS)
    img.save(f"{out}/{name}.png", optimize=True)
    print(name, img.size, os.path.getsize(f"{out}/{name}.png") // 1024, "KB")
