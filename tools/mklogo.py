from PIL import Image, ImageDraw, ImageFont
src = 'rootfs_p2/opt/dvsdk/dm355/images/welcomepage.png'
im = Image.open(src).convert('RGB')
W, H = im.size
px = im.load()
# wipe the big logo by interpolating each row between its left and right edge colours
for y in range(108, 222):
    l, r = px[14, y], px[W - 14, y]
    for x in range(14, W - 14):
        t = (x - 14) / (W - 28)
        px[x, y] = tuple(int(l[i] + (r[i] - l[i]) * t) for i in range(3))
d = ImageDraw.Draw(im)
skin, line = (255, 205, 170), (90, 40, 30)
# cartoon doodle
cx = W // 2
d.ellipse([cx - 52, 170, cx - 8, 214], fill=skin, outline=line, width=3)
d.ellipse([cx + 8, 170, cx + 52, 214], fill=skin, outline=line, width=3)
d.rounded_rectangle([cx - 20, 118, cx + 20, 190], radius=20, fill=skin, outline=line, width=3)
d.ellipse([cx - 20, 110, cx + 20, 144], fill=(255, 150, 150), outline=line, width=3)
d.ellipse([cx - 11, 124, cx - 5, 132], fill='white', outline=line)
d.ellipse([cx + 5, 124, cx + 11, 132], fill='white', outline=line)
d.point([(cx - 8, 128), (cx + 8, 128)], fill=line)
d.arc([cx - 9, 130, cx + 9, 140], 20, 160, fill=line, width=2)
try:
    fnt = ImageFont.truetype('arialbd.ttf', 20)
except Exception:
    fnt = ImageFont.load_default()
d.text((cx + 62, 140), 'willy', font=fnt, fill='white')
im.save('welcomepage_new.png', optimize=True)
import os
print(os.path.getsize('welcomepage_new.png'))
