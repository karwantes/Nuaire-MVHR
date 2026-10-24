"""Make a dark set of the es-lcd screen images.

Usage: python darken.py <src images dir> <out dir>

The page (white background, grey icons, black text) is inverted onto a dark slate background.
Coloured panels (sidebar tiles, title bars, bands) become a muted version of their colour, and
anything drawn on them (icons, text, light or dark) becomes light. Panels are found as large solid
areas of colour (an opening removes text and lines, a closing fills in the icons on them), and the
panel colour under an icon is filled in from its surroundings.
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

BG = np.array([0x15, 0x18, 0x1e]) / 255.0       # page background
FG = np.array([0xe6, 0xe9, 0xef]) / 255.0       # text on the page
ON_PANEL = np.array([0xf2, 0xf4, 0xf7]) / 255.0  # text/icons on a coloured panel


def rgb_to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rr = m & (mx == r)
    gg = m & (mx == g) & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = (b - r)[gg] / d[gg] + 2
    h[bb] = (r - g)[bb] / d[bb] + 4
    h /= 6
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    out = np.zeros(h.shape + (3,))
    for k, (r, g, b) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        sel = i == k
        out[sel] = np.stack([r[sel], g[sel], b[sel]], -1)
    return out


def lum(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def morph(mask, op, size):
    im = Image.fromarray(mask.astype(np.uint8) * 255, 'L')
    f = ImageFilter.MaxFilter if op == 'max' else ImageFilter.MinFilter
    return np.asarray(im.filter(f(size))) > 127


def fill_colour(col, known, steps):
    """Spread the colour of known pixels into unknown ones (nearest-ish, 4-neighbour)."""
    col, known = col.copy(), known.copy()
    for _ in range(steps):
        if known.all(): break
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sc = np.roll(col, (dy, dx), (0, 1))
            sk = np.roll(known, (dy, dx), (0, 1))
            take = ~known & sk
            col[take] = sc[take]
            known |= take
    return col


def darken(im):
    alpha = im.getchannel('A') if im.mode == 'RGBA' else None
    a = np.asarray(im.convert('RGB'), dtype=float) / 255.0
    h, s, v = rgb_to_hsv(a)
    L = lum(a)
    big = min(im.size) > 70

    # solid colour, plus the mid-grey tile colour (Night Mode tile)
    solid = ((s > 0.28) & (v > 0.35)) | ((s < 0.08) & (v > 0.33) & (v < 0.5))
    if big:
        core = morph(morph(solid, 'min', 9), 'max', 9)        # drop text, lines and small marks
        panel = morph(morph(core, 'max', 61), 'min', 61)       # fill the icons sitting on panels
        panel &= morph(core, 'max', 61)
    else:
        core = panel = np.zeros(L.shape, bool)

    # page: neutrals inverted, coloured marks (logo, bars) kept at mid brightness
    page = BG + (1 - L)[..., None] * (FG - BG)
    acc = hsv_to_rgb(h, np.clip(s * 0.85, 0, 1), np.clip(0.3 + 0.5 * v, 0, 0.85))
    ws = np.clip((s - 0.18) / 0.2, 0, 1)[..., None]
    page = page * (1 - ws) + acc * ws

    out = page
    if panel.any():
        pc = fill_colour(a, core, 80)
        ph, ps, pv = rgb_to_hsv(pc)
        grey = ps < 0.1
        muted = hsv_to_rgb(ph, np.clip(ps * 0.7, 0, 0.6), np.where(grey, 0.2, np.clip(pv * 0.5, 0.25, 0.42)))
        pl = lum(pc)
        contrast = np.clip(np.abs(L - pl) / np.maximum(np.maximum(pl, 1 - pl), 0.2) * 1.6, 0, 1)[..., None]
        onp = muted + contrast * (ON_PANEL - muted)
        wp = Image.fromarray(panel.astype(np.uint8) * 255, 'L').filter(ImageFilter.BoxBlur(1))
        wp = (np.asarray(wp, dtype=float) / 255.0)[..., None]
        out = page * (1 - wp) + onp * wp

    res = Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8), 'RGB')
    if alpha is not None:
        res = res.convert('RGBA')
        res.putalpha(alpha)
    return res


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    only = set(sys.argv[3:])
    for n in sorted(os.listdir(src)):
        if not n.lower().endswith('.png') or (only and n not in only): continue
        im = Image.open(os.path.join(src, n))
        im.load()
        darken(im).save(os.path.join(dst, n), optimize=True)
