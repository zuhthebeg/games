#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageDraw


OUTPUT_DIR = Path("/home/ubuntu/devinarok-shots/m9-vfx")
FRAMES = [
    ("meteor-cast", "cast"),
    ("meteor-telegraph-mid-fall", "mid-fall"),
    ("meteor-tick-24", "tick 24"),
    ("meteor-impact", "impact"),
    ("meteor-impact-tick-31", "tick 31"),
    ("meteor-impact-plus-300ms", "+300 ms"),
    ("meteor-impact-plus-1s", "+1.0 s"),
    ("meteor-impact-plus-1-2s", "+1.2 s"),
]


def main():
    crops = []
    for name, label in FRAMES:
        image = Image.open(OUTPUT_DIR / f"{name}-390x844.png").convert("RGB")
        crops.append((image.crop((0, 0, 390, 528)), label))
    header = 28
    sheet = Image.new("RGB", (390 * len(crops), 528 + header), "#151116")
    draw = ImageDraw.Draw(sheet)
    for index, (image, label) in enumerate(crops):
        x = index * 390
        sheet.paste(image, (x, header))
        draw.text((x + 8, 8), label, fill="#f5e9db")
    sheet.save(OUTPUT_DIR / "meteor-strip.png")
    print(OUTPUT_DIR / "meteor-strip.png")


if __name__ == "__main__":
    main()
