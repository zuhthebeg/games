#!/usr/bin/env python3
"""Pack actual Godot RGBA captures; no painted/procedural substitute frames.
Usage: python3 pack.py FRAMES_DIR OUTPUT_DIR
"""
import hashlib, json, sys
from pathlib import Path
from PIL import Image

source, output = map(Path, sys.argv[1:])
output.mkdir(parents=True, exist_ok=True)
frames, clips, checks = {}, {}, []
images = []
for label, expected, anchor in [('projectile', 12, [0.5, 0.55]), ('impact', 28, [0.5, 0.64])]:
    paths = sorted(source.glob(label + '-*.png'))
    assert len(paths) == expected, (label, len(paths))
    ids = []
    for path in paths:
        im = Image.open(path).convert('RGBA')
        assert im.size == (256, 160), im.size
        alpha = im.getchannel('A')
        assert alpha.getextrema()[0] == 0, 'transparent background required'
        bbox = alpha.getbbox()
        if bbox:
            assert bbox[0] > 0 and bbox[1] > 0 and bbox[2] < 256 and bbox[3] < 160, ('clipping', path, bbox)
        key = path.stem
        index = len(images)
        x, y = (index % 8) * 256, (index // 8) * 160
        frames[key] = {'frame': {'x': x, 'y': y, 'w': 256, 'h': 160}, 'anchor': anchor}
        ids.append(key)
        checks.append({'id': key, 'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bbox': bbox, 'alphaRange': alpha.getextrema()})
        images.append(im)
    clips[label] = {'frames': ids, 'fps': 20, 'duration': expected / 20, 'anchor': anchor}
atlas = Image.new('RGBA', (2048, 800))
for index, im in enumerate(images):
    atlas.paste(im, ((index % 8) * 256, (index // 8) * 160))
file = output / 'atlas.webp'
atlas.save(file, 'WEBP', quality=78, method=6, exact=True)
decoded = Image.open(file).convert('RGBA')
assert decoded.getchannel('A').tobytes() == atlas.getchannel('A').tobytes(), 'alpha changed'
meta = {'version': 1, 'image': 'atlas.webp', 'size': [2048, 800], 'frameSize': [256, 160], 'frames': frames, 'clips': clips,
        'source': 'Godot 4.7.2 Forward+ / Effekseer 1.80.7 / fire example', 'blendMode': 'normal'}
(output / 'atlas.json').write_text(json.dumps(meta, separators=(',', ':')) + '\n')
bytes_total = sum((output / name).stat().st_size for name in ['atlas.webp', 'atlas.json'])
assert bytes_total <= 400_000, bytes_total
report = {'frames': len(images), 'atlasSize': atlas.size, 'frameSize': [256, 160], 'alphaLossless': True,
          'clippedFrames': 0, 'atlasBytes': file.stat().st_size, 'jsonBytes': (output / 'atlas.json').stat().st_size,
          'totalBytes': bytes_total, 'budgetBytes': 400_000, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'framesProof': checks}
print(json.dumps(report, indent=2))
