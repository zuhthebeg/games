"""Rebuild four local enchant icons from scroll.webp; no network or inference."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import hashlib, json
ROOT = Path(__file__).resolve().parent
source = ROOT / 'scroll.webp'
base = Image.open(source).convert('RGBA').resize((384,384), Image.Resampling.LANCZOS)
records = [r for r in json.loads((ROOT/'manifest.json').read_text()) if not r['file'].startswith(('scroll-enchant-', 'scroll-blessed-'))]
for blessed in (False, True):
    for family in ('weapon', 'armor'):
        image = base.copy()
        if blessed:
            alpha = image.getchannel('A')
            inner = alpha.filter(ImageFilter.MinFilter(13))
            from PIL import ImageChops
            edge = ImageChops.subtract(alpha, inner)
            gold = Image.new('RGBA', image.size, (244,196,78,0))
            gold.putalpha(edge)
            image = Image.alpha_composite(image, gold)
        d = ImageDraw.Draw(image)
        color = (157,43,43,255) if family == 'weapon' else (38,103,169,255)
        # Wax seal covers the old rune; the parchment and rolled ends remain intact.
        d.ellipse((148,164,236,252), fill=color, outline=(242,207,139,255) if blessed else (63,36,38,255), width=7)
        ink = (255,229,167,255) if blessed else (234,230,207,255)
        if family == 'weapon':
            d.polygon([(192,176),(203,193),(196,222),(188,222),(181,193)], fill=ink)
            d.line((175,217,209,217), fill=ink, width=5)
            d.line((192,216,192,237), fill=ink, width=5)
        else:
            d.polygon([(174,183),(210,183),(207,216),(192,235),(177,216)], fill=ink)
            d.line((192,188,192,224),fill=color,width=5)
            d.line((181,200,203,200),fill=color,width=5)
        file = f"scroll-{'blessed' if blessed else 'enchant'}-{family}.webp"
        image.resize((96,96),Image.Resampling.LANCZOS).save(ROOT/file, 'WEBP', lossless=True, method=6)
        data=(ROOT/file).read_bytes()
        records.append(dict(file=file, source='arpg/assets/items/scroll.webp', sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), method='derived local scroll.webp; Pillow 4x red weapon/blue armor wax seal, sword/shield motif; blessed inner gold alpha border; 96px lossless WebP; no AI', sha256=hashlib.sha256(data).hexdigest(), bytes=len(data)))
(ROOT/'manifest.json').write_text(json.dumps(records,indent=2)+'\n')
print(f'{len(records)} icons, {sum(r["bytes"] for r in records)} encoded bytes')
