#!/usr/bin/env python3
"""CWS プロモタイル生成 (PIL)。

- small  440x280: ロゴ + タグライン (白文字 / ブランドグラデ背景)
- marquee 1400x560: タグライン + サブコピー + バッジ行モック
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'docs', 'internal', 'assets')
C1, C2 = (0x0D, 0x94, 0x88), (0x0E, 0xA5, 0xE9)
FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
FONT_W8 = '/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc'

TAGLINE = {'ja': '業績が、見える。整う。つながる。', 'en': 'See it. Tidy it. Connect it.'}
SUB = {'ja': 'researchmapに被引用数・OA・DOIを表示', 'en': 'Citations, OA & DOI on researchmap'}
PILLS = {
    'ja': [('被引用 27', (0x0B, 0x5E, 0x57), (0xE6, 0xF4, 0xF2)),
           ('OA', (0x15, 0x69, 0x3B), (0xE7, 0xF6, 0xEC)),
           ('DOI', (0x3A, 0x52, 0x76), (0xEE, 0xF2, 0xF8))],
    'en': [('27 cited', (0x0B, 0x5E, 0x57), (0xE6, 0xF4, 0xF2)),
           ('OA', (0x15, 0x69, 0x3B), (0xE7, 0xF6, 0xEC)),
           ('DOI', (0x3A, 0x52, 0x76), (0xEE, 0xF2, 0xF8))],
}


def gradient(w, h):
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w + h - 2)
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(C1, C2))
    return img


def draw_lens(d, cx, cy, r, stroke):
    """白い虫眼鏡 (ロゴと同じ意匠) を直接グラデ上に描く"""
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline='white', width=stroke)
    lw = max(2, round(stroke * 0.7))
    d.line([cx - r * 0.45, cy - r * 0.28, cx + r * 0.42, cy - r * 0.28], fill='white', width=lw)
    d.line([cx - r * 0.45, cy + r * 0.25, cx + r * 0.15, cy + r * 0.25], fill='white', width=lw)
    hx, hy = cx + r * 0.74, cy + r * 0.74
    d.line([hx, hy, hx + r * 0.85, hy + r * 0.85], fill='white', width=round(stroke * 1.25))


def pill_row(d, x, y, h, items, font):
    for text, fg, bg in items:
        tw = d.textlength(text, font=font)
        w = tw + h * 0.9
        d.rounded_rectangle([x, y, x + w, y + h], radius=h / 2, fill=bg)
        d.text((x + w / 2, y + h / 2 - 1), text, font=font, fill=fg, anchor='mm')
        x += w + h * 0.35
    return x


def small(lang):
    img = gradient(440, 280)
    d = ImageDraw.Draw(img)
    draw_lens(d, 220, 104, 42, 9)
    f = ImageFont.truetype(FONT_W8 if os.path.exists(FONT_W8) else FONT, 24 if lang == 'ja' else 28)
    d.text((220, 204), TAGLINE[lang], font=f, fill='white', anchor='mm')
    img.save(os.path.join(OUT, f'promo-small-{lang}.png'))


def marquee(lang):
    img = gradient(1400, 560)
    d = ImageDraw.Draw(img)
    draw_lens(d, 240, 268, 84, 18)
    f1 = ImageFont.truetype(FONT_W8 if os.path.exists(FONT_W8) else FONT, 54 if lang == 'ja' else 66)
    f2 = ImageFont.truetype(FONT, 31)
    fp = ImageFont.truetype(FONT, 26)
    d.text((430, 208), TAGLINE[lang], font=f1, fill='white', anchor='lm')
    d.text((430, 292), SUB[lang], font=f2, fill=(225, 245, 250), anchor='lm')
    # バッジ行モック (白カード上)
    card_y = 352
    d.rounded_rectangle([430, card_y, 980, card_y + 64], radius=12, fill='white')
    pill_row(d, 454, card_y + 16, 32, PILLS[lang], fp)
    img.save(os.path.join(OUT, f'promo-marquee-{lang}.png'))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for lang in ('ja', 'en'):
        small(lang)
        marquee(lang)
        print(f'promo-small-{lang}.png / promo-marquee-{lang}.png')
    print(f'→ {OUT}')
