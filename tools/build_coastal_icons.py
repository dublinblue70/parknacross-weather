#!/usr/bin/env python3
"""Regenerate website/PWA icons from the user's approved coastal weather image.

All output is deterministic. Standard/maskable icons stay distinct so Android
adaptive icons cannot clip the sun, cloud and sea motif.
"""
from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "branding" / "coastal-weather-master-256.webp.b64"
DATA = base64.b64decode(MASTER.read_text(encoding="ascii").strip(), validate=True)
source = Image.open(io.BytesIO(DATA)).convert("RGB")
if source.size != (256, 256):
    raise SystemExit(f"Unexpected approved master image dimensions: {source.size}")

sizes = {
    "icon-192.png": 192,
    "icon-256.png": 256,
    "icon-512.png": 512,
    "apple-touch-icon-120.png": 120,
    "apple-touch-icon-152.png": 152,
    "apple-touch-icon-167.png": 167,
    "apple-touch-icon.png": 180,
    "mstile-150x150.png": 150,
    "favicon-16.png": 16,
    "favicon-32.png": 32,
    "favicon-48.png": 48,
    "favicon-64.png": 64,
}
for name, side in sizes.items():
    source.resize((side, side), Image.Resampling.LANCZOS).save(ROOT / name, optimize=True)

for side in (192, 512):
    canvas = Image.new("RGB", (side, side), (3, 16, 37))
    inset = round(side * .11)
    square = source.resize((side - 2 * inset, side - 2 * inset), Image.Resampling.LANCZOS)
    edge = round(side * .055)
    mask = Image.new("L", square.size)
    painter = ImageDraw.Draw(mask)
    painter.rounded_rectangle(
        (edge, edge, square.width - edge - 1, square.height - edge - 1),
        radius=round(side * .13),
        fill=255,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(1, round(side * .03))))
    canvas.paste(square, (inset, inset), mask)
    canvas.save(ROOT / f"icon-maskable-{side}.png", optimize=True)

source.resize((1024,1024), Image.Resampling.LANCZOS).save(
    ROOT / "parknacross-master-1024.png", optimize=True
)
source.resize((512,512), Image.Resampling.LANCZOS).save(
    ROOT / "favicon.ico", format="ICO",
    sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)]
)

# Simple independent validations. Builds do not touch station data or
# notifications; notification service-worker code remains untouched.
for name, side in {**sizes, "icon-maskable-192.png":192, "icon-maskable-512.png":512}.items():
    with Image.open(ROOT/name) as icon:
        assert icon.size == (side, side), (name, icon.size)
        assert icon.mode == "RGB", name
        assert icon.getbbox() is not None, name
with Image.open(ROOT/"favicon.ico") as ico:
    assert ico.format == "ICO"
print("PASS: approved Parknacross coastal icon assets generated and validated.")
