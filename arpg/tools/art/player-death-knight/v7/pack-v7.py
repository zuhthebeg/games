"""python3 pack-v7.py FRAMES_DIR NEW_DELIVERY_DIR OLD_DESCRIPTOR_JSON SCALE_COMP
Packs player-death-knight-v7 frames (256px source -> 128 physical, Pixi meta .5) into a NEW directory,
writes sockets json (physical128, anchor-relative, multiplied by SCALE_COMP) next to it."""
from pathlib import Path
from PIL import Image
import sys, json, math, hashlib, collections
f = Path(sys.argv[1]); dest = Path(sys.argv[2]); old = json.loads(Path(sys.argv[3]).read_text()); K = float(sys.argv[4])
info = json.loads((f / 'frames.json').read_text()); records = info['frames']
sha = lambda b: hashlib.sha256(b).hexdigest()
groups = collections.defaultdict(list); images = {}; metrics = []; errors = []
for r in records:
    n = r['name']; im = Image.open(f / (n + '.png')).convert('RGBA'); a = im.getchannel('A'); b = a.getbbox()
    small = im.resize((128, 128), Image.Resampling.LANCZOS); sa = small.getchannel('A'); sb = sa.getbbox()
    cov = sum(a.histogram()[128:]) / 65536 * 100; sc = sum(sa.histogram()[128:]) / 16384 * 100
    lo = 4.5 if n.startswith(('death_', 'dodge_')) else 5
    if not b or min(b[:2]) <= 0 or max(b[2:]) >= 256: errors.append([n, 'source alpha boundary', b])
    if not sb or min(sb[:2]) <= 0 or max(sb[2:]) >= 128: errors.append([n, 'physical alpha boundary', sb])
    if not lo <= cov <= 60 or not lo <= sc <= 60: errors.append([n, 'coverage', cov, sc])
    images[n] = small; groups[r['animation']].append(n)
    metrics.append({'name': n, 'rgba_sha256': sha(im.tobytes()), 'physical_mask_sha256': sha(sa.tobytes()), 'coverage': cov, 'physical_bbox': sb})
for g in groups: groups[g].sort()
states = ['idle', 'run', 'attack', 'hit', 'death', 'dodge', 'magic']; dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
if errors: print(json.dumps(errors[:20], indent=1)); sys.exit(2)
assert len(groups) == 56 and all(groups[s + '_' + d] for s in states for d in dirs)
by = {m['name']: m for m in metrics}
for g, names in groups.items(): assert len({by[n]['rgba_sha256'] for n in names}) > 1, ('static', g)
for s in states: assert len({by[groups[s + '_' + d][0]]['rgba_sha256'] for d in dirs}) == 8
assert not dest.exists(), 'never overwrite a delivery'; dest.mkdir(parents=True)
pages = []; page = []; x = y = rowh = 0
def lay(names):
    global x, y, rowh
    out = []
    for n in sorted(names, key=lambda n: -(by[n]['physical_bbox'][3] - by[n]['physical_bbox'][1])):
        b = by[n]['physical_bbox']; w, h = b[2] - b[0], b[3] - b[1]
        if x + w + 2 > 1024: x = 0; y += rowh; rowh = 0
        out.append((n, x + 1, y + 1)); x += w + 2; rowh = max(rowh, h + 2)
    return out
for g, names in sorted(groups.items(), key=lambda kv: -max(by[n]['physical_bbox'][3] - by[n]['physical_bbox'][1] for n in kv[1])):
    saved = (x, y, rowh); trial = [(g, *t) for t in lay(names)]
    if y + rowh > 2048:
        ox, oy, oh = saved; pages.append((page, math.ceil((oy + oh) / 4) * 4)); page = []; x = y = rowh = 0
        trial = [(g, *t) for t in lay(names)]; assert y + rowh <= 2048
    page.extend(trial)
if page: pages.append((page, math.ceil((y + rowh) / 4) * 4))
sheets = []; gpu = 0; webp = 0; merged = {}; checks = 0
for i, (items, h) in enumerate(pages):
    sheet = Image.new('RGBA', (1024, h)); frames = {}; anims = collections.defaultdict(list)
    for g, n, px, py in items:
        b = by[n]['physical_bbox']; crop = images[n].crop(b); sheet.paste(crop, (px, py))
        frames[n] = {'frame': {'x': px, 'y': py, 'w': crop.width, 'h': crop.height}, 'rotated': False, 'trimmed': True,
                     'spriteSourceSize': {'x': b[0], 'y': b[1], 'w': crop.width, 'h': crop.height}, 'sourceSize': {'w': 128, 'h': 128}, 'anchor': info['anchor']}
        anims[g].append(n)
    for g in anims: anims[g].sort(); assert anims[g] == groups[g]
    merged.update(anims); stem = 'atlas-' + str(i)
    sheet.save(dest / (stem + '.webp'), quality=78, method=6, alpha_quality=100)
    dec = Image.open(dest / (stem + '.webp')).convert('RGBA'); assert dec.getchannel('A').tobytes() == sheet.getchannel('A').tobytes()
    for g, n, px, py in items:
        b = by[n]['physical_bbox']; back = Image.new('RGBA', (128, 128)); back.paste(dec.crop((px, py, px + b[2] - b[0], py + b[3] - b[1])), (b[0], b[1]))
        assert sha(back.getchannel('A').tobytes()) == by[n]['physical_mask_sha256']; checks += 1
    data = {'frames': frames, 'animations': dict(anims), 'meta': {'app': 'Project-authored DeathKnight (Blender-native rig, no third-party skeleton)', 'version': '2', 'image': stem + '.webp', 'format': 'RGBA8888', 'size': {'w': 1024, 'h': h}, 'scale': '.5', 'fps': info['fps']}}
    (dest / (stem + '.webp.json')).write_text(json.dumps(data, separators=(',', ':'))); sheets.append(stem + '.webp.json')
    gpu += 1024 * h * 4; webp += (dest / (stem + '.webp')).stat().st_size
assert merged == dict(groups) and gpu <= 12 * 1024 ** 2
kit = dict(old); kit['sheets'] = sheets; kit['animations'] = states; kit['anchor'] = info['anchor']
kit['dodge_contract'] = dict(old['dodge_contract'], source='project-authored dodge action', source_seconds=.4, source_frames=[0, 1, 2, 3, 4, 5],
    authored_action='dodge', root_translation='in-place root; simulation owns travel')
kit['scale_comp'] = K
(dest / 'kit-descriptor.json').write_text(json.dumps(kit, indent=2))
A = info['anchor']; sock = {}
for r in records:
    hl = r['sockets']['hand.L']
    sock.setdefault(r['animation'], []).append([round((hl[0] - A['x'] * 256) / 2 * K, 4), round((hl[1] - A['y'] * 256) / 2 * K, 4)])
for k in sock: assert len(sock[k]) == len(groups[k])
(dest.parent / 'sockets-v7.json').write_text(json.dumps(sock, separators=(',', ':')))
rep = {'status': 'PASS', 'frames': len(records), 'groups': len(groups), 'pages': [[1024, h] for _, h in pages], 'rgba_mib': gpu / 1024 ** 2, 'webp_bytes': webp, 'alpha_exact_frames': checks, 'scale_comp': K}
print(json.dumps(rep, indent=1))
