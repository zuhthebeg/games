"""Rebuild only original timber art using the existing local Pillow 4x item style.
No AI, network, external source, or changes to any other delivered icon.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json

ROOT = Path(__file__).resolve().parent
K = 4
image = Image.new('RGBA', (96*K, 96*K))
draw = ImageDraw.Draw(image)
INK = '#38271e'

def polygon(points, fill):
    points = [(x*K, y*K) for x, y in points]
    draw.polygon(points, fill=fill)
    draw.line(points + [points[0]], fill=INK, width=2*K, joint='curve')

def line(points, fill, width=1):
    draw.line([(x*K, y*K) for x, y in points], fill=fill, width=width*K, joint='curve')

# Two cut timber logs: bark facets, pale end grain and concentric growth rings.
# Staggered silhouettes stay legible in the existing 48px material rows.
for dx, dy in [(0, 0), (19, 24)]:
    polygon([(12+dx, 32+dy), (40+dx, 9+dy), (54+dx, 12+dy),
             (61+dx, 24+dy), (32+dx, 52+dy), (17+dx, 49+dy)], '#885831')
    polygon([(12+dx, 32+dy), (40+dx, 9+dy), (46+dx, 13+dy),
             (19+dx, 38+dy)], '#bc8d55')
    polygon([(27+dx, 44+dy), (56+dx, 18+dy), (61+dx, 24+dy),
             (32+dx, 52+dy)], '#65432c')
    for offset in [0, 6]:
        line([(24+dx+offset, 33+dy), (44+dx+offset, 15+dy)], '#d2a76b')
    draw.ellipse(((10+dx)*K, (30+dy)*K, (35+dx)*K, (55+dy)*K),
                 fill='#d7b47b', outline=INK, width=2*K)
    for inset in [5, 9]:
        draw.ellipse(((10+dx+inset)*K, (30+dy+inset)*K,
                      (35+dx-inset)*K, (55+dy-inset)*K),
                     outline='#916239', width=K)
    line([(12+dx, 45+dy), (20+dx, 43+dy)], '#916239')

bbox = image.getchannel('A').getbbox()
image = image.crop(bbox)
image.thumbnail((84, 84), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', (96, 96))
canvas.alpha_composite(image, ((96-image.width)//2, (96-image.height)//2))
# Bound delivery size without raising the existing 200 KiB icon budget.
canvas = canvas.quantize(colors=64, method=Image.Quantize.FASTOCTREE,
                         dither=Image.Dither.NONE).convert('RGBA')
output = ROOT / 'wood.webp'
canvas.save(output, 'WEBP', lossless=True, method=6)
raw = output.read_bytes()
record = dict(file=output.name, source='arpg/assets/items/wood-art.py',
              sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              method='original locally drawn 2D timber; Pillow 4x supersampling, fit 84px, 64-color RGBA quantization, 96px lossless WebP; no AI',
              sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
manifest = ROOT / 'manifest.json'
records = [r for r in json.loads(manifest.read_text()) if r['file'] != output.name]
records.append(record)
manifest.write_text(json.dumps(records, indent=2)+'\n')
print(json.dumps(record))
