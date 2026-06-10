#!/usr/bin/env python3
"""ロゴ PNG アイコン生成 (PIL)。SVG ラスタライザ非依存。

仕様 (packages/shared/assets/logo.svg と同一デザイン):
- squircle (radius 22%) + ブランドグラデ 135deg #0D9488 → #0EA5E9
- 白い虫眼鏡。レンズ内に引用符風 2 本線 (48px 以上のみ)
- 16/32px は簡略版 (内側の線なし)
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'extension', 'public', 'icon')
C1 = (0x0D, 0x94, 0x88)
C2 = (0x0E, 0xA5, 0xE9)
S = 512  # 描画キャンバス (高解像度で描いて縮小)


def gradient_squircle(size: int) -> Image.Image:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    grad = Image.new('RGBA', (size, size))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))  # 135deg
            px[x, y] = (
                round(C1[0] + (C2[0] - C1[0]) * t),
                round(C1[1] + (C2[1] - C1[1]) * t),
                round(C1[2] + (C2[2] - C1[2]) * t),
                255,
            )
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=round(size * 0.22), fill=255
    )
    img.paste(grad, (0, 0), mask)
    return img


def draw_lens(img: Image.Image, size: int, detailed: bool) -> None:
    d = ImageDraw.Draw(img)
    u = size / 128.0
    cx, cy, r = 56 * u, 56 * u, 26 * u
    stroke = round((8 if detailed else 10) * u)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 255), width=stroke)

    def capped_line(x1, y1, x2, y2, w):
        d.line([x1, y1, x2, y2], fill=(255, 255, 255, 255), width=w)
        for (x, y) in [(x1, y1), (x2, y2)]:
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=(255, 255, 255, 255))

    if detailed:
        capped_line(45 * u, 49 * u, 67 * u, 49 * u, round(5.5 * u))
        capped_line(45 * u, 63 * u, 60 * u, 63 * u, round(5.5 * u))
    handle_w = round((10 if detailed else 12) * u)
    capped_line(76 * u, 76 * u, 98 * u, 98 * u, handle_w)


def make_icon(target: int) -> None:
    detailed = target >= 48
    img = gradient_squircle(S)
    draw_lens(img, S, detailed)
    img = img.resize((target, target), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, f'{target}.png'))
    print(f'icon/{target}.png')


if __name__ == '__main__':
    for t in (16, 32, 48, 128):
        make_icon(t)
