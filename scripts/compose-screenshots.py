#!/usr/bin/env python3
"""Joins the layers captured by `QP_SMOKE_SHOTS=1 electron .` into the README screenshots (Pillow required).

Window shots: the interface, with the page (and any overlay such as the tab hover card) pasted where it sits.
Standalone shots (small windows such as the status bar or "Do this for me"): placed on a soft background.
Theme gallery shots: smaller, with the theme's name on a caption bar.
Every file is kept under about 500 KB (lossless first, then a 256-colour palette, then smaller)."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

src = os.environ.get("QP_SHOTS_DIR", "/tmp/qp-shots")
out = sys.argv[1] if len(sys.argv) > 1 else "docs/screenshots"
LIMIT = 500 * 1024
os.makedirs(out, exist_ok=True)
os.makedirs(f"{out}/themes", exist_ok=True)
meta = json.load(open(f"{src}/meta.json"))


def font(size):
    for f in ("/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf", "C:/Windows/Fonts/segoeui.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def save(img, path, width):
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    for attempt in range(4):
        if attempt == 0:
            img.save(path, optimize=True)
        else:
            img.convert("RGB").quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE if attempt == 1 else Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
        if os.path.getsize(path) <= LIMIT:
            break
        if attempt == 2:
            width = round(width * 0.82)
            img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    return img.size, os.path.getsize(path) // 1024


for name, m in meta.items():
    ui = Image.open(f"{src}/{name}-ui.png").convert("RGBA")
    if m["kind"] == "standalone":
        pad = round(ui.width * 0.08)
        bg = Image.new("RGBA", (ui.width + pad * 2, ui.height + pad * 2), (238, 242, 247, 255))
        top, bottom = (204, 251, 241), (237, 233, 254)   # soft teal to violet, like the Aurora theme
        draw = ImageDraw.Draw(bg)
        for y in range(bg.height):
            t = y / max(1, bg.height - 1)
            draw.line([(0, y), (bg.width, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
        bg.alpha_composite(ui, (pad, pad))
        size, kb = save(bg.convert("RGB"), f"{out}/{name}.png", min(1200, bg.width))
        print(name, size, kb, "KB")
        continue
    scale = ui.width / 1280
    if m.get("page") and os.path.exists(f"{src}/{name}-page.png"):
        page = Image.open(f"{src}/{name}-page.png").convert("RGBA")
        r = m["pageRect"]
        page = page.resize((round(r["width"] * scale), round(r["height"] * scale)), Image.LANCZOS)
        ui.alpha_composite(page, (round(r["x"] * scale), round(r["y"] * scale)))
    for layer in m.get("layers", []):
        img = Image.open(f"{src}/{layer['file']}").convert("RGBA")
        ui.alpha_composite(img, (round(layer["x"] * scale), round(layer["y"] * scale)))
    if name.startswith("theme-"):
        cap = round(ui.width * 0.045)
        canvas = Image.new("RGB", (ui.width, ui.height + cap), (255, 255, 255) if name.endswith("-light") else (17, 24, 39))
        canvas.paste(ui.convert("RGB"), (0, cap))
        d = ImageDraw.Draw(canvas)
        d.text((round(cap * 0.5), round(cap * 0.2)), m.get("caption", name), font=font(round(cap * 0.55)), fill=(17, 24, 39) if name.endswith("-light") else (241, 245, 249))
        size, kb = save(canvas, f"{out}/themes/{name.replace('theme-', '')}.png", 960)
    else:
        size, kb = save(ui.convert("RGB"), f"{out}/{name}.png", 1600)
    print(name, size, kb, "KB")
