"""Independently reconstruct all delivered original-alpha trims.
Keep the 256px original threshold; verify 128px occupancy separately without
loosening the old >1000 nontransparent-pixel gate at its original resolution. No browser screenshots.
"""
import json, hashlib, shutil
from pathlib import Path
from PIL import Image, ImageDraw
from pack import local, delivery_image
base = Path(__file__).parent
cfg = json.loads((base / 'config.json').read_text())
root = local(cfg['source']).parent
raw = root / 'frames/succubus'
info = json.loads((raw / 'frames.json').read_text())
repo = base.parents[2]; folder = repo / 'assets/sprites/succubus'
entry = next(e for e in json.loads((repo / 'assets/sprites/manifest.json').read_text()) if e['id'] == 'succubus')
records = {r['name']: r for r in info['frames']}
def digest(im): return hashlib.sha256(im.tobytes()).hexdigest()
alpha = {}; rgb = {}; original_alpha = {}; verified = 0; bytes_ = 0; raw_bytes = 0
frames = {}; clips = {}; pages = []; alpha_evidence = {}; min_pixels = 1000000
for sheet in entry['sheets']:
    data = json.loads((folder / sheet).read_text())
    image = Image.open(folder / data['meta']['image']).convert('RGBA')
    bytes_ += (folder / sheet).stat().st_size + (folder / data['meta']['image']).stat().st_size
    assert max(image.size) < 2048 and float(data['meta']['scale']) == .5
    assert image.size == (data['meta']['size']['w'], data['meta']['size']['h'])
    raw_bytes += image.width * image.height * 4
    pages.append({'sheet': sheet, 'width': image.width, 'height': image.height,
                  'raw_rgba_bytes': image.width * image.height * 4})
    for clip, names in data['animations'].items():
        assert clip not in clips, 'Directional clip must not be split across pages'
        clips[clip] = names
    for name, f in data['frames'].items():
        assert name not in frames
        frames[name] = f
        r = f['frame']; trim = f['spriteSourceSize']; size = f['sourceSize']
        assert f['trimmed'] and not f['rotated'] and size == {'w': 128, 'h': 128}
        assert trim['w'] == r['w'] and trim['h'] == r['h']
        assert r['x'] >= 2 and r['y'] >= 2 and r['x']+r['w'] <= image.width-2 and r['y']+r['h'] <= image.height-2
        crop = image.crop((r['x'], r['y'], r['x']+r['w'], r['y']+r['h']))
        reconstructed = Image.new('RGBA', (128, 128))
        reconstructed.paste(crop, (trim['x'], trim['y']))
        source = Image.open(raw / (name + '.png')).convert('RGBA')
        assert source.size == (256, 256)
        original_bounds = source.getchannel('A').getbbox()
        assert original_bounds and min(original_bounds[:2]) >= 2 and max(original_bounds[2:]) <= 254
        assert sum(v > 16 for v in source.getchannel('A').getdata()) > 1000, name
        reference = delivery_image(source, 128)
        assert digest(reference) == digest(Image.open(root / 'frames-128/succubus' / (name + '.png')).convert('RGBA'))
        a = reconstructed.getchannel('A'); bounds = a.getbbox()
        assert digest(a) == digest(reference.getchannel('A')), name
        assert bounds == reference.getchannel('A').getbbox() == (trim['x'], trim['y'], trim['x']+trim['w'], trim['y']+trim['h']), name
        assert bounds and min(bounds[:2]) >= 2 and max(bounds[2:]) <= 126, name
        occupied = sum(v > 16 for v in a.getdata()); min_pixels = min(min_pixels, occupied)
        assert occupied * (256 / 128) ** 2 > 1000, (name, occupied)  # Same logical-area threshold, explicitly resolution-normalized.
        assert f['anchor'] == info['anchor'] == entry['anchor'] == records[name]['ground_anchor']
        # Pixi scale .5 makes 128px sourceSize + trim offsets exactly 256 logical pixels.
        assert size['w'] / float(data['meta']['scale']) == 256
        alpha[name] = digest(a); rgb[name] = digest(reconstructed); original_alpha[name] = digest(source.getchannel('A'))
        alpha_evidence[name] = {'source256_alpha_sha256': original_alpha[name],
            'delivery128_original_alpha_sha256': digest(reference.getchannel('A')),
            'atlas_reconstructed_alpha_sha256': alpha[name], 'trim_original_alpha_bbox': list(bounds),
            'source_bones_sha256': hashlib.sha256(json.dumps(records[name]['bone_rotations'], sort_keys=True).encode()).hexdigest()}
        verified += 1
assert set(frames) == set(records) and verified == sum(cfg['frame_counts'].values()) * 8 == 312
motion = {}
for animation, n in cfg['frame_counts'].items():
    for direction in cfg['directions']:
        key = animation + '_' + direction
        names = [f'{key}_{i:03d}' for i in range(n)]
        assert clips[key] == names
        masks = len({alpha[x] for x in names}); pixels = len({rgb[x] for x in names})
        poses = len({alpha_evidence[x]['source_bones_sha256'] for x in names})
        original_masks = len({original_alpha[x] for x in names})
        assert min(masks, pixels, poses, original_masks) > 1, key
        motion[key] = {'unique_alpha': masks, 'unique_pixels': pixels, 'unique_bone_poses': poses,
                       'unique_source256_alpha': original_masks}
assert bytes_ <= 3_000_000 and raw_bytes <= 16 * 1024 ** 2
preview = Path('/home/cocy/.openclaw/workspace/tmp/arpg-succubus-preview'); preview.mkdir(exist_ok=True)
for filename, cols, selection in [
    ('sprite-8dir-states-v3.png', 8, [(a,d,cfg['frame_counts'][a]//2) for a in cfg['frame_counts'] for d in cfg['directions']]),
    ('animation-phases-v3.png', 4, [(a,'SE',round((cfg['frame_counts'][a]-1)*f)) for a in cfg['frame_counts'] for f in [0,1/3,2/3,1]])]:
    contact = Image.new('RGB', (cols*256, 5*280), (25,29,35)); draw = ImageDraw.Draw(contact)
    for k,(a,d,i) in enumerate(selection):
        name = f'{a}_{d}_{i:03d}'; f = frames[name]
        sheet = next(s for s in entry['sheets'] if name in json.loads((folder/s).read_text())['frames'])
        data = json.loads((folder/sheet).read_text()); image = Image.open(folder/data['meta']['image']).convert('RGBA')
        r = f['frame']; t = f['spriteSourceSize']; delivered = Image.new('RGBA',(128,128))
        delivered.paste(image.crop((r['x'],r['y'],r['x']+r['w'],r['y']+r['h'])),(t['x'],t['y']))
        # Actual delivered WebP pixels enlarged nearest-neighbor for review, not source substitutes.
        display = delivered.resize((256,256),Image.Resampling.NEAREST)
        x=k%cols*256; y=k//cols*280;draw.text((x+5,y+5),f'{a} {d} {i} (128px delivery)',fill='white');contact.paste(display,(x,y+24),display)
    contact.save(root/filename); shutil.copy2(root/filename, preview/filename)
proof = {'ok': True, 'frames': verified, 'lossless_alpha_verified': verified, 'clipped_frames': 0,
    'kit_bytes': bytes_, 'max_frame_size': 128, 'offline_original_size': 256, 'logical_frame_size': 256,
    'alpha_trim_method': 'original alpha getbbox; no alpha threshold', 'raw_rgba_bytes': raw_bytes,
    'raw_rgba_mib': raw_bytes/1024**2, 'pages': pages, 'anchor': info['anchor'], 'motion': motion,
    'source_seconds': info['seconds'], 'min_delivery_pixels_alpha_gt16': min_pixels,
    'original256_pixel_threshold_gt16': 1000, 'delivery128_logical_area_threshold_gt16': 1000, 'delivery128_raw_pixel_threshold_gt16': 250,
    'generated_previews': [str(preview/n) for n in ['sprite-8dir-states-v3.png','animation-phases-v3.png']]}
(base/'trim-alpha-evidence.json').write_text(json.dumps(alpha_evidence,indent=2)+'\n')
(base/'validation.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof,indent=2))
