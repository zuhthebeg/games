#!/usr/bin/env python3
import os
import math
import random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

SIZE = 256
CENTER = (SIZE // 2, SIZE // 2)
OUT_DIR = "/mnt/c/Users/user/games/enhance/icons/lv"
PROGRESS_FILE = "/tmp/codex-icon-progress.txt"

WEAPONS = {
    "sword": ((80, 150, 255, 255), (220, 230, 245, 255)),
    "axe": ((220, 70, 70, 255), (130, 85, 55, 255)),
    "spear": ((130, 220, 255, 255), (245, 250, 255, 255)),
    "hammer": ((170, 170, 175, 255), (255, 215, 80, 255)),
    "dagger": ((90, 210, 120, 255), (150, 90, 190, 255)),
    "staff": ((160, 90, 220, 255), (245, 205, 90, 255)),
    "wand": ((140, 220, 255, 255), (250, 252, 255, 255)),
    "katana": ((210, 60, 70, 255), (35, 35, 45, 255)),
    "scythe": ((40, 40, 50, 255), (150, 90, 210, 255)),
    "bow": ((145, 95, 55, 255), (90, 170, 90, 255)),
    "crossbow": ((150, 150, 155, 255), (120, 85, 55, 255)),
    "knuckle": ((250, 190, 65, 255), (225, 60, 60, 255)),
}


def lerp(a, b, t):
    return int(a + (b - a) * t)


def tint(color, amount):
    return (
        min(255, int(color[0] * amount)),
        min(255, int(color[1] * amount)),
        min(255, int(color[2] * amount)),
        color[3],
    )


def draw_sword(d, c1, c2):
    d.polygon([(128, 38), (146, 112), (128, 132), (110, 112)], fill=c2)
    d.rectangle((122, 112, 134, 210), fill=c1)
    d.rectangle((92, 130, 164, 146), fill=c2)
    d.rectangle((116, 206, 140, 220), fill=c2)


def draw_axe(d, c1, c2):
    d.rectangle((120, 52, 136, 214), fill=c2)
    d.polygon([(136, 72), (204, 98), (186, 148), (136, 130)], fill=c1)
    d.polygon([(120, 92), (96, 118), (120, 136)], fill=tint(c1, 0.8))


def draw_spear(d, c1, c2):
    d.rectangle((123, 42, 133, 214), fill=c1)
    d.polygon([(128, 22), (146, 58), (128, 78), (110, 58)], fill=c2)
    d.rectangle((116, 164, 140, 172), fill=c2)


def draw_hammer(d, c1, c2):
    d.rectangle((122, 72, 134, 214), fill=c2)
    d.rounded_rectangle((84, 50, 172, 96), radius=9, fill=c1)
    d.rectangle((76, 60, 92, 88), fill=tint(c1, 0.85))


def draw_dagger(d, c1, c2):
    d.polygon([(128, 44), (142, 118), (128, 142), (114, 118)], fill=c1)
    d.rectangle((122, 118, 134, 204), fill=c2)
    d.rectangle((104, 136, 152, 148), fill=c1)


def draw_staff(d, c1, c2):
    d.rectangle((122, 38, 134, 214), fill=c1)
    d.ellipse((102, 20, 154, 72), fill=c2)
    d.ellipse((112, 30, 144, 62), fill=tint(c1, 0.9))


def draw_wand(d, c1, c2):
    d.rectangle((122, 78, 134, 210), fill=c1)
    star = [(128, 30), (136, 50), (158, 50), (140, 64), (148, 86), (128, 72), (108, 86), (116, 64), (98, 50), (120, 50)]
    d.polygon(star, fill=c2)


def draw_katana(d, c1, c2):
    d.polygon([(118, 30), (142, 30), (152, 158), (128, 210), (104, 158)], fill=c1)
    d.rectangle((100, 162, 156, 174), fill=c2)
    d.rectangle((122, 174, 134, 224), fill=c2)


def draw_scythe(d, c1, c2):
    d.rectangle((120, 46, 134, 214), fill=c1)
    d.polygon([(120, 56), (58, 78), (40, 126), (92, 114), (120, 96)], fill=c2)


def draw_bow(d, c1, c2):
    d.arc((70, 42, 186, 214), 300, 60, fill=c1, width=14)
    d.line((96, 62, 160, 198), fill=c2, width=3)
    d.line((112, 80, 146, 176), fill=tint(c2, 0.8), width=2)


def draw_crossbow(d, c1, c2):
    d.rectangle((118, 72, 138, 212), fill=c2)
    d.line((68, 96, 188, 96), fill=c1, width=12)
    d.line((86, 84, 170, 108), fill=tint(c1, 0.9), width=6)
    d.polygon([(128, 36), (136, 70), (120, 70)], fill=c1)


def draw_knuckle(d, c1, c2):
    d.rounded_rectangle((82, 102, 174, 164), radius=20, fill=c1)
    for x in (90, 112, 134, 156):
        d.ellipse((x, 90, x + 20, 112), fill=c2)
    d.rounded_rectangle((108, 152, 150, 198), radius=8, fill=c2)


WEAPON_SHAPES = {
    "sword": draw_sword,
    "axe": draw_axe,
    "spear": draw_spear,
    "hammer": draw_hammer,
    "dagger": draw_dagger,
    "staff": draw_staff,
    "wand": draw_wand,
    "katana": draw_katana,
    "scythe": draw_scythe,
    "bow": draw_bow,
    "crossbow": draw_crossbow,
    "knuckle": draw_knuckle,
}


def stage(level):
    if level <= 3:
        return 0
    if level <= 6:
        return 1
    if level <= 9:
        return 2
    if level <= 12:
        return 3
    return 4


def draw_runes(draw, level, color):
    count = 4 + (level - 13) * 2
    r = 62 + (level - 13) * 8
    for i in range(count):
        ang = 2 * math.pi * i / count
        x = int(CENTER[0] + math.cos(ang) * r)
        y = int(CENTER[1] + math.sin(ang) * r)
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), outline=color, width=2)
        draw.line((x - 6, y, x + 6, y), fill=color, width=2)
        draw.line((x, y - 6, x, y + 6), fill=color, width=2)


def build_icon(weapon, level):
    base1, base2 = WEAPONS[weapon]
    st = stage(level)
    intensity = 1.0 + (level - 1) * 0.035
    c1 = tint(base1, intensity)
    c2 = tint(base2, intensity)

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    weapon_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(weapon_layer)
    WEAPON_SHAPES[weapon](d, c1, c2)

    glow_passes = [2, 5, 9, 13, 18][st]
    aura_alpha = [35, 65, 95, 125, 170][st]

    glow = weapon_layer.filter(ImageFilter.GaussianBlur(radius=glow_passes))
    aura_tint = Image.new("RGBA", (SIZE, SIZE), (c1[0], c1[1], c1[2], aura_alpha))
    glow_colored = ImageChops.multiply(glow, aura_tint)
    canvas.alpha_composite(glow_colored)

    if st >= 1:
        aura = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        ad = ImageDraw.Draw(aura)
        ring = 42 + st * 10
        ad.ellipse((128 - ring, 128 - ring, 128 + ring, 128 + ring), outline=(c2[0], c2[1], c2[2], 45 + st * 15), width=3 + st)
        aura = aura.filter(ImageFilter.GaussianBlur(4 + st * 2))
        canvas.alpha_composite(aura)

    if st >= 2:
        particle_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        pd = ImageDraw.Draw(particle_layer)
        rng = random.Random(hash((weapon, level)) & 0xFFFFFFFF)
        pcount = 10 + (level - 7) * 4
        for _ in range(max(0, pcount)):
            x = rng.randint(36, 220)
            y = rng.randint(36, 220)
            r = rng.randint(1, 4 if st >= 3 else 3)
            a = rng.randint(90, 220)
            col = (c2[0], c2[1], c2[2], a)
            pd.ellipse((x - r, y - r, x + r, y + r), fill=col)
        particle_layer = particle_layer.filter(ImageFilter.GaussianBlur(1 if st < 4 else 2))
        canvas.alpha_composite(particle_layer)

    if st >= 4:
        rune_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        rd = ImageDraw.Draw(rune_layer)
        draw_runes(rd, level, (c2[0], c2[1], c2[2], 220))
        rune_layer = rune_layer.filter(ImageFilter.GaussianBlur(1.5))
        canvas.alpha_composite(rune_layer)

        bloom = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bloom)
        bd.ellipse((36, 36, 220, 220), fill=(c1[0], c1[1], c1[2], 40 + (level - 13) * 20))
        bloom = bloom.filter(ImageFilter.GaussianBlur(16 + (level - 13) * 4))
        canvas.alpha_composite(bloom)

    canvas.alpha_composite(weapon_layer)
    return canvas


def write_progress(done, total=180, errors=None):
    errors = errors or []
    err_text = "NONE" if not errors else ", ".join(errors)
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        f.write(f"DONE: {done}/{total} icons generated\n")
        f.write(f"ERRORS: {err_text}\n")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    errors = []
    total = len(WEAPONS) * 15
    done = 0
    write_progress(done, total, errors)

    for weapon in WEAPONS:
        for level in range(1, 16):
            try:
                icon = build_icon(weapon, level)
                out_path = os.path.join(OUT_DIR, f"{weapon}-lv{level}.png")
                icon.save(out_path, "PNG")
            except Exception as e:
                errors.append(f"{weapon}-lv{level}: {e}")
            done += 1
            if done % 12 == 0:
                write_progress(done, total, errors)

    write_progress(done, total, errors)


if __name__ == "__main__":
    main()
