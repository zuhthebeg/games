"""Encode the offline temple render into lossless-source WebP candidates."""
import json
from pathlib import Path
from PIL import Image

source = Path("/home/ubuntu/art-src/temple")
repo = Path(__file__).resolve().parents[4]
for name in ("ground", "occluder"):
    image = Image.open(source / f"{name}.png").convert("RGBA")
    target = source / f"{name}.webp"
    image.save(target, "WEBP", quality=82, method=6)
    report = {
        "width": image.width,
        "height": image.height,
        "quality": 82,
        "encodedBytes": target.stat().st_size,
        "decodedRgbaBytes": image.width * image.height * 4,
    }
    if name == "ground":
        def linear(channel):
            value = channel / 255
            return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4

        max_luminance = 0
        max_channel = 0
        bright_pixels = 0
        for r, g, b, _ in image.getdata():
            luminance = .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b)
            max_luminance = max(max_luminance, luminance)
            max_channel = max(max_channel, r, g, b)
            bright_pixels += luminance > .8
        report["maxLuminanceLinear709"] = round(max_luminance, 5)
        report["maxRgbChannel"] = max_channel
        report["pixelsAboveLuminance0.8"] = bright_pixels
    (source / f"{name}-budget.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{name}: {json.dumps(report)}")

meta_path = repo / "arpg/assets/sprites/hero-sword/atlas-0.webp.json"
atlas_path = meta_path.with_suffix("").with_suffix(".webp")
meta = json.loads(meta_path.read_text())
sprite_frame = meta["frames"]["idle_S_000"]
frame = sprite_frame["frame"]
atlas = Image.open(atlas_path).convert("RGBA")
sprite = atlas.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"]))
anchor = sprite_frame["anchor"]
ground = Image.open(source / "ground.png").convert("RGBA")
preview = ground.copy()
for x, foot_y in ((620, 675), (700, 430), (815, 250)):
    preview.alpha_composite(sprite, (round(x - sprite.width * anchor["x"]),
                                     round(foot_y - sprite.height * anchor["y"])))
preview.alpha_composite(Image.open(source / "occluder.png").convert("RGBA"))
preview.save(source / "preview-pc.png")

mobile = Image.new("RGBA", (390, 844), (16, 20, 26, 255))
scaled = preview.resize((round(1400 * .72), round(860 * .72)), Image.Resampling.LANCZOS)
mobile.alpha_composite(scaled, ((390 - scaled.width) // 2, (844 - scaled.height) // 2))
mobile.save(source / "preview-mobile.png")
print(f"human sprite: hero-sword/idle_S_000 anchor={anchor}")
