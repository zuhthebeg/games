#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageOps


GAME_DIR = Path(__file__).resolve().parents[1]
RESEARCH_DIR = Path(os.environ.get("VFX_RESEARCH_DIR", "/home/ubuntu/vfx-research"))
OUTPUT_DIR = GAME_DIR / "assets" / "vfx"
KENNEY_DIR = RESEARCH_DIR / "kenney" / "PNG"
ICON_SHEET = RESEARCH_DIR / "22skills" / "Icons_120.png"
PARTICLE_NAMES = [
    "circle_05",
    "flare_01",
    "fire_01",
    "flame_04",
    "flame_05",
    "smoke_07",
    "spark_04",
    "star_07",
    "scorch_02",
    "dirt_02",
    "magic_02",
    "magic_01",
    "twirl_02",
    "trace_05",
    "slash_02",
    "circle_03",
]
ICON_SPECS = [
    ("spin", 0, 6, "source cell"),
    ("dash", 0, 0, "source cell"),
    ("guard", 0, 5, "source cell"),
    ("quake", 1, 5, "source cell"),
    ("deadBurst", 1, 8, "source cell"),
    ("pierce", 0, 1, "source cell"),
    ("vault", 0, 8, "source cell"),
    ("volley", 0, 7, "source cell"),
    ("poisonArrow", 1, 7, "source cell"),
    ("rain", 0, 7, "vertical flip; pale-blue tint"),
    ("flame", 0, 9, "source cell"),
    ("frost", 1, 4, "source cell"),
    ("cursedHands", 1, 6, "purple tint"),
    ("blink", 1, 1, "source cell"),
    ("meteor", 0, 4, "red-orange crystal; fire background; trace_05 streak at 45 degrees"),
    ("basic:sword", 0, 0, "source cell"),
    ("basic:crossbow", 0, 1, "source cell"),
    ("basic:staff", 1, 3, "source cell"),
]
ASSET_LICENSES = [
    "assets/licenses/kenney-particle-pack-LICENSE.txt",
    "assets/licenses/22skill-icons-ReadMe.txt",
    "assets/licenses/fireball-skill-MIT.txt",
    "assets/licenses/fireball-THIRD_PARTY_NOTICES.md",
    "assets/licenses/fireball-Effekseer-LICENSE_TOOL.txt",
    "assets/licenses/fireball-EffekseerForGodot4-MIT.txt",
]


def alpha_from_luminance(image):
    rgba = image.convert("RGBA")
    luminance = ImageOps.grayscale(rgba.convert("RGB"))
    alpha = ImageChops.multiply(luminance, rgba.getchannel("A"))
    result = Image.new("RGBA", rgba.size, (255, 255, 255, 0))
    result.putalpha(alpha)
    return result


def tint_foreground(image, color, threshold=40):
    rgba = image.convert("RGBA")
    luminance = ImageOps.grayscale(rgba.convert("RGB"))
    mask = luminance.point(lambda value: max(0, min(255, round((value - threshold) * 255 / (255 - threshold)))))
    tinted = Image.new("RGBA", rgba.size, (*color, 255))
    return Image.composite(tinted, rgba, mask)


def icon_cell(sheet, row, column):
    return sheet.crop((column * 120, row * 120, (column + 1) * 120, (row + 1) * 120)).convert("RGBA")


def hue_tint_foreground(image, color):
    return tint_foreground(image, color, threshold=44)


def meteor_icon(sheet):
    fire = icon_cell(sheet, 0, 9)
    rock = icon_cell(sheet, 0, 4)
    rock_mask = ImageOps.grayscale(rock.convert("RGB")).point(
        lambda value: max(0, min(255, round((value - 52) * 255 / 190))),
    )
    streak_source = Image.open(KENNEY_DIR / "trace_05.png")
    streak = alpha_from_luminance(streak_source).resize((42, 96), Image.Resampling.LANCZOS).rotate(
        45,
        resample=Image.Resampling.BICUBIC,
        expand=False,
    )
    streak_tint = Image.new("RGBA", streak.size, (255, 112, 35, 0))
    streak_tint.putalpha(streak.getchannel("A"))
    fire.alpha_composite(streak_tint, (55, 3))

    rock_tint = Image.new("RGBA", rock.size, (255, 75, 28, 255))
    rock_tint.putalpha(rock_mask)
    fire.alpha_composite(rock_tint)
    return fire


def build_particles():
    atlas = Image.new("RGBA", (1024, 1024), (255, 255, 255, 0))
    cells = {}
    for index, name in enumerate(PARTICLE_NAMES):
        source = Image.open(KENNEY_DIR / f"{name}.png")
        cell = alpha_from_luminance(source).resize((256, 256), Image.Resampling.LANCZOS)
        x = index % 4 * 256
        y = index // 4 * 256
        atlas.alpha_composite(cell, (x, y))
        cells[name] = index

    output = OUTPUT_DIR / "particles.webp"
    atlas.save(output, "WEBP", lossless=True, method=6)
    if output.stat().st_size > 450 * 1024:
        raise RuntimeError(f"particle atlas exceeds 450 KB: {output.stat().st_size} bytes")
    metadata = {
        "version": 1,
        "image": "particles.webp",
        "width": 1024,
        "height": 1024,
        "columns": 4,
        "rows": 4,
        "cellSize": 256,
        "cells": cells,
    }
    (OUTPUT_DIR / "particles.json").write_text(json.dumps(metadata, indent=2) + "\n")
    return output, OUTPUT_DIR / "particles.json"


def build_skill_icons():
    sheet = Image.open(ICON_SHEET).convert("RGBA")
    atlas = Image.new("RGBA", (960, 360), (0, 0, 0, 0))
    cells = {}
    sources = {}
    for index, (key, row, column, transform) in enumerate(ICON_SPECS):
        icon = icon_cell(sheet, row, column)
        if key == "rain":
            icon = ImageOps.flip(icon)
            icon = hue_tint_foreground(icon, (166, 216, 255))
        elif key == "cursedHands":
            icon = hue_tint_foreground(icon, (168, 91, 232))
        elif key == "meteor":
            icon = meteor_icon(sheet)
        x = index % 8 * 120
        y = index // 8 * 120
        atlas.alpha_composite(icon, (x, y))
        cells[key] = index
        sources[key] = {"row": row, "column": column, "transform": transform}

    output = OUTPUT_DIR / "skill-icons.webp"
    atlas.save(output, "WEBP", lossless=True, method=6)
    metadata = {
        "version": 1,
        "image": "skill-icons.webp",
        "width": 960,
        "height": 360,
        "columns": 8,
        "rows": 3,
        "cellSize": 120,
        "cells": cells,
        "sources": sources,
    }
    (OUTPUT_DIR / "skill-icons.json").write_text(json.dumps(metadata, indent=2) + "\n")
    return output, OUTPUT_DIR / "skill-icons.json"


def stamp_fireball_content_scale():
    atlas_path = OUTPUT_DIR / "fireball" / "atlas.webp"
    metadata_path = OUTPUT_DIR / "fireball" / "atlas.json"
    metadata = json.loads(metadata_path.read_text())
    image = Image.open(atlas_path).convert("RGBA")
    alpha = image.getchannel("A")
    clip = metadata["clips"]["impact"]
    frame_width, frame_height = metadata["frameSize"]
    content_width = 1
    content_height = 1
    for name in clip["frames"]:
        frame = metadata["frames"][name]["frame"]
        box = alpha.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"])) \
            .point(lambda value: 255 if value > 32 else 0).getbbox()
        if box:
            content_width = max(content_width, box[2] - box[0])
            content_height = max(content_height, box[3] - box[1])
    clip["contentScale"] = round(min(frame_width / content_width, frame_height / content_height), 4)
    metadata_path.write_text(json.dumps(metadata, separators=(",", ":")) + "\n")
    return metadata_path


def update_manifest(outputs):
    manifest_path = GAME_DIR / "assets" / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    for path in [*outputs, *(GAME_DIR / path for path in ASSET_LICENSES)]:
        relative = path.relative_to(GAME_DIR).as_posix()
        data = path.read_bytes()
        manifest.setdefault("files", {})[relative] = len(data)
        manifest.setdefault("sha256", {})[relative] = hashlib.sha256(data).hexdigest()
    manifest["files"] = dict(sorted(manifest["files"].items()))
    manifest["sha256"] = dict(sorted(manifest["sha256"].items()))
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = [*build_particles(), *build_skill_icons()]
    fireball_metadata = stamp_fireball_content_scale()
    for required in [
        OUTPUT_DIR / "fireball" / "atlas.webp",
        OUTPUT_DIR / "fireball" / "atlas.json",
        *(GAME_DIR / path for path in ASSET_LICENSES),
    ]:
        if not required.is_file():
            raise FileNotFoundError(required)
    outputs.extend([
        OUTPUT_DIR / "fireball" / "atlas.webp",
        fireball_metadata,
    ])
    update_manifest(outputs)
    for path in [*outputs, *(GAME_DIR / path for path in ASSET_LICENSES)]:
        data = path.read_bytes()
        print(f"{path.relative_to(GAME_DIR)} {len(data)} bytes sha256={hashlib.sha256(data).hexdigest()}")


if __name__ == "__main__":
    main()
