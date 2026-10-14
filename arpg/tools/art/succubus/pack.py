"""Pack the new succubus only: 256px offline source -> 128px true-alpha trims.
Pixi metadata scale=0.5 retains the original 256px logical size and anchors.
Whole directional clips stay on one page (AtlasLibrary merges by clip name).
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from PIL import Image


def local(path):
    return Path(subprocess.check_output(['wslpath', '-u', path], text=True).strip()) if ':' in path else Path(path)


def delivery_image(image, size):
    return image.convert('RGBA').resize((size, size), Image.Resampling.LANCZOS)


def trim_image(image):
    bounds = image.getchannel('A').getbbox()  # Original alpha, including faint antialiased edges.
    assert bounds, 'Empty frame is forbidden'
    return bounds, image.crop(bounds)


def layout(records, sizes, limit=2047, width=1024, padding=2):
    """Stable shelf packing; rollback a complete clip if it needs a new page."""
    groups = collections.defaultdict(list)
    for r in records:
        groups[r['animation']].append(r['name'])
    pages = []
    placed = {}
    x = y = row_h = used_w = used_h = 0
    for names in groups.values():
        old = (dict(placed), x, y, row_h, used_w, used_h)
        for retry in range(2):
            for name in names:
                w, h = sizes[name]
                assert w + 2 * padding <= width and h + 2 * padding <= limit
                if x + w + 2 * padding > width:
                    x = 0; y += row_h; row_h = 0
                if y + h + 2 * padding > limit:
                    break
                placed[name] = (x + padding, y + padding)
                x += w + 2 * padding; row_h = max(row_h, h + 2 * padding)
                used_w = max(used_w, x); used_h = max(used_h, y + row_h)
            else:
                break
            assert retry == 0 and old[0], 'One entire directional clip must fit a page'
            pages.append((old[0], (old[4], old[5])))
            placed = {}; x = y = row_h = used_w = used_h = 0
        else:
            raise AssertionError('Packing failed')
    if placed:
        pages.append((placed, (used_w, used_h)))
    return pages


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('config')
    parser.add_argument('--repo', required=True)
    parser.add_argument('--merge-manifest', action='store_true')
    args = parser.parse_args()
    cfg = json.loads(Path(args.config).read_text())
    size = cfg['delivery_size']; assert cfg['frame_size'] == 256 and size == 128
    root = local(cfg['output']); archive = root.parent / 'atlases-128'; archive.mkdir(exist_ok=True)
    destination = Path(args.repo) / 'arpg/assets/sprites'
    stats = []; manifest = []
    for job in cfg['characters']:
        assert job['name'] == 'succubus', 'Never pack old kits with this pipeline'
        source = root / job['name']; info = json.loads((source / 'frames.json').read_text())
        assert not info['preview'] and len(info['frames']) == 312
        raw128 = root.parent / 'frames-128' / job['name']; raw128.mkdir(parents=True, exist_ok=True)
        images = {}; crops = {}; bounds = {}; hashes = {}
        for r in info['frames']:
            name = r['name']; original = Image.open(source / (name + '.png')).convert('RGBA')
            assert original.size == (256, 256)
            images[name] = delivery_image(original, size)
            bounds[name], crops[name] = trim_image(images[name])
            images[name].save(raw128 / (name + '.png'))
            hashes[name] = hashlib.sha256(images[name].getchannel('A').tobytes()).hexdigest()
        (raw128 / 'frames.json').write_text(json.dumps({**info, 'frame_size': size, 'offline_original_size': 256}, indent=2))
        pages = layout(info['frames'], {n: c.size for n, c in crops.items()})
        raw_bytes = sum(w * h * 4 for _, (w, h) in pages)
        assert raw_bytes <= 16 * 1024 ** 2, 'Target GPU budget exceeded'
        folder = destination / job['name']; folder.mkdir(exist_ok=True)
        prior = archive / 'prior-runtime'; prior.mkdir(exist_ok=True)
        for old in list(folder.iterdir()):
            if old.suffix in ('.png', '.webp', '.json'):
                assert not (prior / old.name).exists(), 'Preserve prior pack rather than overwrite'
                shutil.move(str(old), str(prior / old.name))
        sheets = []; total = 0; page_stats = []
        records = {r['name']: r for r in info['frames']}
        for number, (placed, dimensions) in enumerate(pages):
            atlas = Image.new('RGBA', dimensions); frames = {}; animations = collections.defaultdict(list)
            for name, (x, y) in placed.items():
                crop = crops[name]; left, top, right, bottom = bounds[name]
                atlas.paste(crop, (x, y))  # Never composite alpha onto alpha.
                frames[name] = {'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height},
                    'rotated': False, 'trimmed': True,
                    'spriteSourceSize': {'x': left, 'y': top, 'w': crop.width, 'h': crop.height},
                    'sourceSize': {'w': size, 'h': size}, 'anchor': info['anchor']}
                animations[records[name]['animation']].append(name)
            stem = 'succubus-v3-atlas-' + str(number)
            atlas.save(archive / (stem + '.png'), optimize=True)
            atlas.save(folder / (stem + '.webp'), quality=cfg['webp_quality'], method=6, alpha_quality=100)
            data = {'frames': frames, 'animations': dict(animations), 'meta': {
                'app': 'ARPG original procedural Blender pipeline', 'version': '3.0',
                'image': stem + '.webp', 'format': 'RGBA8888',
                'size': {'w': atlas.width, 'h': atlas.height}, 'scale': str(size / cfg['frame_size']), 'fps': cfg['fps']}}
            filename = stem + '.webp.json'
            (folder / filename).write_text(json.dumps(data, separators=(',', ':')))
            total += (folder / filename).stat().st_size + (folder / (stem + '.webp')).stat().st_size
            sheets.append(filename)
            page_stats.append({'sheet': filename, 'width': atlas.width, 'height': atlas.height,
                               'raw_rgba_bytes': atlas.width * atlas.height * 4})
        assert total <= 3_000_000
        (archive / 'alpha-hashes.json').write_text(json.dumps(hashes, indent=2))
        stats.append({'name': job['name'], 'frames': 312, 'offline_source_size': 256, 'delivery_size': size,
                      'logical_size': 256, 'total_bytes': total, 'raw_rgba_bytes': raw_bytes,
                      'raw_rgba_mib': raw_bytes / 1024 ** 2, 'pages': page_stats})
        manifest.append({'id': job['name'], 'label': job['label'], 'monster': job.get('neutral', False),
            'content_ids': job['content_ids'], 'sheets': sheets, 'animations': list(job['animations']),
            'fps': cfg['fps'], 'anchor': info['anchor'], 'bytes': total,
            'animation_durations': job['animation_durations']})
    if args.merge_manifest:
        prior = json.loads((destination / 'manifest.json').read_text())
        manifest = [e for e in prior if e['id'] != 'succubus'] + manifest
    (destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    (root.parent / 'verification.json').write_text(json.dumps(stats, indent=2))
    print(json.dumps(stats, indent=2))


if __name__ == '__main__':
    main()
