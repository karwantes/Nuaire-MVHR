"""Contact sheet of every full-size (320x240) screen image: python overview.py <images dir> <out.png>"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

d, out = sys.argv[1], sys.argv[2]
ns = [n for n in sorted(os.listdir(d)) if n.endswith('.png') and Image.open(os.path.join(d, n)).size == (320, 240)]
f = ImageFont.load_default()
c = 6
r = (len(ns) + c - 1) // c
s = Image.new('RGB', (c * 330, r * 265), (40, 40, 40))
dr = ImageDraw.Draw(s)
for i, n in enumerate(ns):
    x, y = (i % c) * 330, (i // c) * 265
    s.paste(Image.open(os.path.join(d, n)).convert('RGB'), (x + 5, y + 5))
    dr.text((x + 5, y + 247), n[:-4], font=f, fill=(230, 230, 230))
s.save(out)
print(len(ns))
