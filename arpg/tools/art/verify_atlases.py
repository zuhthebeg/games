"""Verify delivered WebP pixels + per-frame pose evidence, not just raw renders.
Default paths target this machine; --base/--frames/--report allow isolated fixtures.
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path

from PIL import Image

DIRECTIONS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']


def verify_pose(record, skinned_count):
    pose = record['pose']
    degrees = pose['arm_degrees_from_bind']
    assert len(degrees) == 2 and all(math.isfinite(value) for value in degrees), record['name']
    assert max(degrees) > 10, (record['name'], 'T-pose local arms', degrees)
    assert pose['skin_rms_from_bind_height'] > .015, (record['name'], 'bind/frozen geometry')
    assert pose['armature_modifiers'] == skinned_count > 0, (record['name'], 'lost skin modifier')


def verify_character(base, frames_root, entry):
    folder = base / entry['id']
    info = json.loads((frames_root / entry['id'] / 'frames.json').read_text())
    assert not info['preview'], entry['id']
    evidence = {record['name']: record for record in info['frames']}
    expected_skin = len(info['pose_check']['skinned_objects'])
    records, groups, sizes = {}, {}, []
    webp_bytes, json_bytes = 0, 0
    pose_min, skin_min = 360, float('inf')
    assert not list(folder.glob('*.png')), 'PNG must remain outside the game web root'
    assert set(path.name for path in folder.glob('*.webp.json')) == set(entry['sheets']), 'stale/missing sheets'
    for filename in entry['sheets']:
        path = folder / filename
        data = json.loads(path.read_text())
        assert data['meta']['image'].endswith('.webp')
        image_path = folder / data['meta']['image']
        image = Image.open(image_path).convert('RGBA')
        assert image.width <= 2048 and image.height <= 2048
        assert list(image.size) == [data['meta']['size']['w'], data['meta']['size']['h']]
        sizes.append(list(image.size))
        webp_bytes += image_path.stat().st_size
        json_bytes += path.stat().st_size
        for name, frame_info in data['frames'].items():
            assert name not in records, ('duplicate', name)
            rectangle = frame_info['frame']
            assert rectangle['w'] == rectangle['h'] == 128
            frame = image.crop((rectangle['x'], rectangle['y'], rectangle['x'] + 128, rectangle['y'] + 128))
            alpha = frame.getchannel('A')
            mask = alpha.point(lambda value: 255 if value >= 128 else 0)
            bbox = mask.getbbox()
            assert bbox, name
            # Even low-alpha antialiasing/outline pixels must not touch an edge;
            # the >=128 coverage mask alone can miss a clipped translucent rim.
            full_bbox = alpha.getbbox()
            assert full_bbox[0] > 0 and full_bbox[1] > 0 and full_bbox[2] < 128 and full_bbox[3] < 128, (name, 'any-alpha edge clipping', full_bbox)
            coverage = sum(mask.histogram()[128:]) / 16384 * 100
            assert 5 <= coverage <= 60, (name, coverage)
            assert bbox[0] > 0 and bbox[1] > 0 and bbox[2] < 128 and bbox[3] < 128, (name, bbox)
            record = evidence[name]
            verify_pose(record, expected_skin)
            raw = Image.open(frames_root / entry['id'] / (name + '.png')).convert('RGBA')
            # WebP lossless alpha binds the Blender pose checks to the delivered
            # exact silhouette. Stale T-pose atlases cannot pass fresh bone logs.
            assert alpha.tobytes() == raw.getchannel('A').tobytes(), (name, 'stale alpha / pose evidence mismatch')
            pose_min = min(pose_min, max(record['pose']['arm_degrees_from_bind']))
            skin_min = min(skin_min, record['pose']['skin_rms_from_bind_height'])
            assert frame_info['anchor'] == entry['anchor'], name
            records[name] = {'center': ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2),
                             'coverage': coverage, 'hash': hashlib.sha256(frame.tobytes()).hexdigest(), 'bbox': bbox}
        groups.update(data['animations'])
    assert set(records) == set(evidence), 'pose/frame coverage incomplete'
    drift, directions = {}, {}
    for direction in DIRECTIONS:
        centers = [records[name]['center'] for name in groups['idle_' + direction]]
        drift[direction] = round(max(math.dist(one, two) for one in centers for two in centers), 3)
        assert drift[direction] < 6, (entry['id'], direction, drift[direction])
    for animation in entry['animations']:
        hashes = [records[groups[animation + '_' + direction][0]]['hash'] for direction in DIRECTIONS]
        directions[animation] = len(set(hashes))
        assert directions[animation] == 8, (entry['id'], animation, 'directions duplicate')
    for animation, names in groups.items():
        assert len({records[name]['hash'] for name in names}) > 1, ('static animation', animation)
    assert webp_bytes + json_bytes <= 1_500_000, (entry['id'], 'kit budget')
    weapon_sizes = []
    for record in evidence.values():
        if record['name'].startswith('idle_') and record['frame'] == 0 and record['weapon_bbox']:
            box = record['weapon_bbox']
            weapon_sizes.append(round(max(box[2] - box[0], box[3] - box[1]), 2))
    if entry['id'].startswith('hero-'):
        assert len(weapon_sizes) == 8 and min(weapon_sizes) >= 16, (entry['id'], 'weapon too small', weapon_sizes)
    return {'name': entry['id'], 'format': 'webp', 'frames': len(records), 'atlas_dimensions': sizes,
            'webp_bytes': webp_bytes, 'json_bytes': json_bytes, 'total_bytes': webp_bytes + json_bytes,
            'alpha_coverage_percent': [round(min(record['coverage'] for record in records.values()), 3),
                                       round(max(record['coverage'] for record in records.values()), 3)],
            'max_idle_center_drift_px': max(drift.values()), 'unique_direction_hashes': directions,
            'pose_checked_frames': len(records), 't_pose_frames': 0, 'bind_pose_frames': 0,
            'min_max_arm_degrees_from_bind': round(pose_min, 4), 'min_skin_rms_from_bind_height': skin_min,
            'lossless_alpha_matches_pose_evidence': len(records), 'clipped_frames': 0,
            'idle_weapon_projected_span_px': weapon_sizes}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', type=Path, default=Path('/mnt/c/Users/user/games/arpg/assets/sprites'))
    parser.add_argument('--frames', type=Path, default=Path('/mnt/c/Users/user/ai-tools/arpg-art/output/frames'))
    parser.add_argument('--report', type=Path, default=Path('/mnt/c/Users/user/ai-tools/arpg-art/output/final-atlas-verification.json'))
    args = parser.parse_args()
    assert not list(args.base.rglob('*.png')), 'PNG delivery forbidden'
    manifest = json.loads((args.base / 'manifest.json').read_text())
    reports = [verify_character(args.base, args.frames, entry) for entry in manifest]
    args.report.write_text(json.dumps(reports, indent=2))
    print(json.dumps(reports, indent=2))


if __name__ == '__main__':
    main()
