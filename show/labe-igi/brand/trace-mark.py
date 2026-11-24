#!/usr/bin/env python3
"""Traces Paul's supplied ewé èwe artwork (white on black) to SVG with potrace.
Run: python3 trace-mark.py <source.png>
White shapes are traced as-is. The stem (above the fist and the stub below it)
is filled orange: the white pixels inside two small regions are traced separately
and drawn on top. Needs: pillow, numpy, potracer."""
import sys, os
import numpy as np
from PIL import Image, ImageDraw
import potrace

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1]
ORANGE = "#F26522"
S = 3  # upscale factor for smoother contours

im = Image.open(SRC).convert("L")
W, H = im.size
big = im.resize((W * S, H * S), Image.LANCZOS)
white = np.array(big) > 128

def region_mask():
    m = Image.new("L", (W * S, H * S), 0)
    d = ImageDraw.Draw(m)
    # stem between the fist and the top leaf: slim band along its centre line
    def band(y0, y1, cx0, cx1, hw):
        pts = [((cx0 - hw) * S, y0 * S), ((cx0 + hw) * S, y0 * S),
               ((cx1 + hw) * S, y1 * S), ((cx1 - hw) * S, y1 * S)]
        d.polygon(pts, fill=255)
    band(536, 400, 619, 627, 15)
    d.polygon([(610 * S, 400 * S), (644 * S, 400 * S), (630 * S, 364 * S)], fill=255)  # tapered tip
    # stub of stem below the fist
    d.rectangle([540 * S, 760 * S, 588 * S, 842 * S], fill=255)
    return np.array(m) > 0

orange = white & region_mask()

def to_path(mask):
    bm = potrace.Bitmap(~mask)
    plist = bm.trace(turdsize=20 * S, alphamax=1.0, opticurve=True, opttolerance=0.3)
    parts = []
    for curve in plist:
        sp = curve.start_point
        d = [f"M{sp.x / S:.2f} {sp.y / S:.2f}"]
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f"L{seg.c.x / S:.2f} {seg.c.y / S:.2f}L{seg.end_point.x / S:.2f} {seg.end_point.y / S:.2f}")
            else:
                d.append(f"C{seg.c1.x / S:.2f} {seg.c1.y / S:.2f} {seg.c2.x / S:.2f} {seg.c2.y / S:.2f} {seg.end_point.x / S:.2f} {seg.end_point.y / S:.2f}")
        d.append("Z")
        parts.append("".join(d))
    return "".join(parts)

d_white = to_path(white)
d_orange = to_path(orange)

def svg(vb, bg, crop_mark_only=False):
    x, y, w, h = vb
    rect = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#0A0A0A"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" role="img" '
            f'aria-label="ewé èwe: a child\'s hand holding a leaf">{rect}'
            f'<path d="{d_white}" fill="#FFFFFF" fill-rule="evenodd"/>'
            f'<path d="{d_orange}" fill="{ORANGE}" fill-rule="evenodd"/></svg>\n')

def write(n, s):
    open(os.path.join(HERE, n), "w", encoding="utf-8").write(s)

write("ewe-lockup-dark.svg", svg((0, 0, W, H), True))
write("ewe-lockup.svg", svg((200, 130, 860, 920), False))
write("ewe-mark.svg", svg((380, 130, 500, 740), False))
print("traced", len(d_white), len(d_orange))
