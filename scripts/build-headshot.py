"""Rebuild paul-oyatowo.webp from a cutout headshot, keeping the site's device:
a circle inscribed in a 400px square, cream fill, brand-orange ring flush to
the edge. Framing is copied from the asset it replaces."""
from PIL import Image, ImageDraw
import os, sys

S = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else '/root/.claude/uploads/bfc912f6-cbbf-57fc-9f84-a91d9c061a4c/d86593f4-image.png'
src = Image.open(SRC).convert('RGBA')

HEAD_TOP, HEAD_CX = 111, 768      # measured from the source alpha profile
D = 1400                          # crop size, so the head fills 44% of the circle
crop_left = HEAD_CX - D // 2
crop_top  = HEAD_TOP - int(0.1375 * D)   # negative: pad transparent headroom

SS, OUT = 4, 400
BIG = OUT * SS
FILL = (245, 241, 235, 255)       # #F5F1EB
RING = (242, 101, 34, 255)        # #F26522
RING_W = 5 * SS                   # 5px at 400, matching the old asset

canvas = Image.new('RGBA', (D, D), (0, 0, 0, 0))
canvas.alpha_composite(
    src,
    dest=(max(0, -crop_left), max(0, -crop_top)),
    source=(max(0, crop_left), max(0, crop_top),
            min(src.width, crop_left + D), min(src.height, crop_top + D)))
portrait = canvas.resize((BIG, BIG), Image.LANCZOS)

# Two masks. The ring is the gap between them, which keeps it flush to the
# outer edge; PIL's ellipse outline draws inward and left a pale gap outside it.
outer = Image.new('L', (BIG, BIG), 0)
ImageDraw.Draw(outer).ellipse((0, 0, BIG - 1, BIG - 1), fill=255)
inner = Image.new('L', (BIG, BIG), 0)
ImageDraw.Draw(inner).ellipse((RING_W, RING_W, BIG - 1 - RING_W, BIG - 1 - RING_W), fill=255)

base = Image.new('RGBA', (BIG, BIG), RING)
base.putalpha(outer)

plate = Image.new('RGBA', (BIG, BIG), FILL)
plate.alpha_composite(portrait)
plate.putalpha(inner)

base.alpha_composite(plate)
final = base.resize((OUT, OUT), Image.LANCZOS)
final.save(os.path.join(S, 'paul-new.webp'), 'WEBP', quality=86, method=6)
for name, bg in [('dark', (10, 10, 10, 255)), ('light', (255, 255, 255, 255))]:
    c = Image.new('RGBA', final.size, bg); c.alpha_composite(final)
    c.convert('RGB').save(os.path.join(S, f'new-{name}.png'))
print('bytes:', os.path.getsize(os.path.join(S, 'paul-new.webp')))
