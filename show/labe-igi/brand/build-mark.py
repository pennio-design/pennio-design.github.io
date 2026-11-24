#!/usr/bin/env python3
"""Builds the Ewé èwe mark as SVG: a child's hand holding an akoko sprig.
Run: python3 build-mark.py   (needs fonttools for the placeholder wordmark)
Outputs ewe-mark.svg, ewe-mark-compact.svg, ewe-lockup.svg next to this file.
Colours: white on a dark ground, brand orange for the stem.
The wordmark in ewe-lockup.svg is Inter ExtraBold, a PLACEHOLDER for Paul's
Afrofuturist wordmark. Swap it for the real one."""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
ORANGE = "#F26522"
WHITE = "#FFFFFF"
BG = "#0A0A0A"

LEAF = "M0 0 C34 -20 36 -78 0 -116 C-36 -78 -34 -20 0 0 Z"
VEIN = "M0 -6 C3 -40 3 -70 0 -98"

def leaflet(x, y, rot, s, lid):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">'
            f'<path d="{LEAF}" fill="{WHITE}" mask="url(#v)"/></g>')

def defs():
    return (f'<defs><mask id="v" maskUnits="userSpaceOnUse" x="-60" y="-130" width="120" height="140">'
            f'<rect x="-60" y="-130" width="120" height="140" fill="#fff"/>'
            f'<path d="{VEIN}" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/></mask></defs>')

def sprig(full=True):
    out = [f'<path d="M204 340 C204 300 200 220 196 150" stroke="{ORANGE}" stroke-width="18" '
           f'stroke-linecap="round" fill="none"/>']
    out.append(leaflet(196, 152, 0, 1.0, "t"))
    out.append(leaflet(199, 214, -44, 0.92, "l1")); out.append(leaflet(199, 214, 44, 0.92, "r1"))
    if full:
        out.append(leaflet(202, 280, -50, 0.8, "l2")); out.append(leaflet(202, 280, 50, 0.8, "r2"))
    return "".join(out)

def hand():
    f = []
    # back of hand and palm
    f.append(f'<path d="M205 346 Q292 322 302 392 L294 452 Q292 480 272 492 L205 492 Z" fill="{WHITE}"/>')
    # four curled fingers, spaced so the gaps read as separations
    for i, w in enumerate([84, 90, 88, 74]):
        y = 352 + i * 36
        f.append(f'<rect x="{150 - (w-84)//2 - (4 if i==3 else 0)}" y="{y}" width="{w+10}" height="32" rx="16" fill="{WHITE}"/>')
    # thumb over the top finger
    f.append(f'<rect x="170" y="318" width="96" height="30" rx="15" transform="rotate(-14 218 333)" fill="{WHITE}"/>')
    # wrist with a clean, deliberate cut
    f.append(f'<path d="M209 488 L292 488 L326 552 L236 552 Z" fill="{WHITE}"/>')
    return "".join(f)

def svg(body, vb, bg=True):
    r = f'<rect width="100%" height="100%" fill="{BG}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" '
            f'aria-label="A child\'s hand holding an akoko sprig">{defs()}{r}{body}</svg>\n')

def word(text, size_px, x_center, baseline):
    font = TTFont("/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf")
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    upm = font["head"].unitsPerEm
    sc = size_px / upm
    total = sum(hmtx[cmap[ord(c)]][0] for c in text) * sc
    x = x_center - total / 2
    paths = []
    for c in text:
        g = cmap[ord(c)]
        pen = SVGPathPen(gs)
        tp = TransformPen(pen, (sc, 0, 0, -sc, x, baseline))
        gs[g].draw(tp)
        d = pen.getCommands()
        if d: paths.append(f'<path d="{d}" fill="{WHITE}"/>')
        x += hmtx[g][0] * sc
    return "".join(paths)

def write(name, content):
    with open(os.path.join(HERE, name), "w", encoding="utf-8") as fh:
        fh.write(content)

mark = f'<g transform="translate(0 0)">{sprig(True)}{hand()}</g>'
write("ewe-mark.svg", svg(mark, "70 20 270 560"))
compact = f'<g>{sprig(False)}{hand()}</g>'
write("ewe-mark-compact.svg", svg(compact, "70 20 270 560"))
lock = (f'<g transform="translate(0 0)">{sprig(True)}{hand()}</g>'
        + word("ewé èwe", 96, 230, 690))
write("ewe-lockup.svg", svg(lock, "-20 20 500 740"))
print("ok")
