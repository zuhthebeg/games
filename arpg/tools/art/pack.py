"""Pack fixed-size frames into Pixi v8 WebP-only atlases (offline PNG archive).
Usage: python3 pack.py config.json --repo /mnt/c/Users/user/games
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw


def local(path):
    if ':' in path:
        path = subprocess.check_output(['wslpath', '-u', path], text=True).strip()
    return Path(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('config')
    parser.add_argument('--repo', default='/mnt/c/Users/user/games')
    args = parser.parse_args()
    config_path = Path(args.config)
    config = json.loads(config_path.read_text())
    size = config['frame_size']
    root = local(config['output'])
    destination = Path(args.repo) / 'arpg/assets/sprites'
    archive = root.parent / 'atlases'
    stats, manifest = [], []
    for job in config['characters']:
        source = root / job['name']
        info = json.loads((source / 'frames.json').read_text())
        assert not info['preview'], 'Do not deliver preview frames'
        anchor = info['anchor']
        groups = collections.defaultdict(list)
        for frame in info['frames']:
            groups[frame['animation']].append(frame)
        pages, page = [], []
        for animation in job['animations']:
            for direction in config['directions']:
                # Keep one animation-direction on one page. Quaternius idle
                # exceeds 256 frames across all directions, so split between
                # directions rather than truncating a clip or oversizing sheets.
                records = groups[animation + '_' + direction]
                assert len(records) <= 256, 'One directional clip exceeds a page'
                if len(page) + len(records) > 256:
                    pages.append(page)
                    page = []
                page.extend(records)
        if page:
            pages.append(page)
        folder = destination / job['name']
        folder.mkdir(parents=True, exist_ok=True)
        archived = archive / job['name']
        archived.mkdir(parents=True, exist_ok=True)
        # Preserve previously deployed PNGs and their JSON before removing them
        # from the web root. Fresh reference atlases stay outside the repository.
        for old in list(folder.iterdir()):
            if old.suffix in ('.png', '.webp', '.json'):
                shutil.move(str(old), str(archived / ('legacy-' + old.name)))
        sheets, atlases, metadata = [], [], []
        alpha_hashes = {}
        for number, page in enumerate(pages):
            columns = min(16, len(page))
            atlas = Image.new('RGBA', (columns * size, math.ceil(len(page) / columns) * size))
            frames, animations = {}, collections.defaultdict(list)
            for index, record in enumerate(page):
                x, y = index % columns * size, index // columns * size
                image = Image.open(source / (record['name'] + '.png')).convert('RGBA')
                assert image.size == (size, size)
                atlas.paste(image, (x, y))
                alpha_hashes[record['name']] = hashlib.sha256(image.getchannel('A').tobytes()).hexdigest()
                frames[record['name']] = {
                    'frame': {'x': x, 'y': y, 'w': size, 'h': size}, 'rotated': False, 'trimmed': False,
                    'spriteSourceSize': {'x': 0, 'y': 0, 'w': size, 'h': size},
                    'sourceSize': {'w': size, 'h': size}, 'anchor': anchor,
                }
                animations[record['animation']].append(record['name'])
            stem = 'atlas-' + str(number)
            atlas.save(archived / (stem + '.png'), optimize=True)
            data = {'frames': frames, 'animations': dict(animations), 'meta': {
                'app': 'ARPG CC0 Blender pipeline', 'version': '2.0', 'image': stem + '.webp',
                'format': 'RGBA8888', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1', 'fps': config['fps'],
            }}
            filename = stem + '.webp.json'
            (folder / filename).write_text(json.dumps(data, separators=(',', ':')))
            sheets.append(filename)
            atlases.append((atlas, folder / (stem + '.webp')))
            metadata.append(folder / filename)
        # Offline encoding, not network retrying. Bound each complete kit including
        # metadata to the requested 1.5 MB budget; preserve lossless alpha.
        quality = config.get('webp_quality', 52)
        while True:
            for atlas, filename in atlases:
                atlas.save(filename, quality=quality, method=6, alpha_quality=100)
            total = sum(path.stat().st_size for path in metadata) + sum(path.stat().st_size for _, path in atlases)
            if total <= 1_500_000:
                break
            quality -= 8
            assert quality >= 20, (job['name'], 'Cannot meet kit budget without excessive quality loss')
        # Store pose and alpha evidence offline: game metadata need not carry it.
        (archived / 'alpha-hashes.json').write_text(json.dumps(alpha_hashes, indent=2))
        record = {'name': job['name'], 'frames': len(info['frames']), 'webp_quality': quality,
                  'webp_bytes': sum(path.stat().st_size for _, path in atlases),
                  'json_bytes': sum(path.stat().st_size for path in metadata), 'total_bytes': total,
                  'seconds': info['seconds'], 'atlas_sizes': [list(atlas.size) for atlas, _ in atlases]}
        stats.append(record)
        manifest.append({'id': job['name'], 'label': job['label'], 'monster': job.get('neutral', False),
                         'content_ids': job['content_ids'], 'sheets': sheets, 'animations': list(job['animations']),
                         'fps': config['fps'], 'anchor': anchor, 'bytes': total})
    (destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    (root.parent / 'verification.json').write_text(json.dumps(stats, indent=2))
    jobs = {job['name']: job for job in config['characters']}
    rows = [(job['name'], animation) for job in config['characters'] for animation in ('idle', 'attack')]
    contact = Image.new('RGB', (8 * size, len(rows) * (size + 24)), (20, 23, 30))
    draw = ImageDraw.Draw(contact)
    for row, (character, animation) in enumerate(rows):
        for column, direction in enumerate(config['directions']):
            # Attack middle sample better shows class silhouette than anticipation.
            records = json.loads((root / character / 'frames.json').read_text())['frames']
            selected = [record for record in records if record['animation'] == animation + '_' + direction]
            record = selected[len(selected) // 2] if animation == 'attack' else selected[0]
            image = Image.open(root / character / (record['name'] + '.png')).convert('RGBA')
            # The contact sheet shows the actual gameplay color/size variants;
            # source atlas pixels and fixed per-kit ground anchors stay untouched.
            job = jobs[character]
            tint = job.get('preview_tint')
            if tint:
                channels = list(image.split())
                for index in range(3):
                    multiplier = int(tint[index * 2:index * 2 + 2], 16) / 255
                    channels[index] = channels[index].point(lambda value, m=multiplier: round(value * m))
                image = Image.merge('RGBA', channels)
            scale = job.get('preview_scale', 1)
            if scale != 1:
                anchor = json.loads((root / character / 'frames.json').read_text())['anchor']
                expanded = image.resize((round(size * scale), round(size * scale)), Image.Resampling.LANCZOS)
                display = Image.new('RGBA', (size, size))
                display.paste(expanded, (round(size * anchor['x'] * (1 - scale)),
                                         round(size * anchor['y'] * (1 - scale))))
                image = display
            x, y = column * size, row * (size + 24)
            draw.text((x + 4, y + 4), f'{character} {animation} {direction}', fill=(212, 207, 183))
            contact.paste(image, (x, y + 24), image)
    contact.save(config_path.parent.parent / 'contact-sheet.png')
    print(json.dumps({'total_bytes': sum(record['total_bytes'] for record in stats), 'characters': stats}, indent=2))


if __name__ == '__main__':
    main()
