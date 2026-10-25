"""Validate all 8 delivered gun directions and rasterized muzzle flashes.
Usage: python3 verify_gunner_flash.py [frames-directory]
"""
import json
import math
import sys
from pathlib import Path
from PIL import Image

config = json.loads((Path(__file__).parent / 'config.json').read_text())
root = Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/user/ai-tools/arpg-art/content-expansion-b9/frames') / 'orbital_gunner'
records = json.loads((root / 'frames.json').read_text())['frames']
by_name = {r['name']: r for r in records}
checked = 0
for direction in config['directions']:
    idle = by_name[f'idle_{direction}_000']['gun']
    def angle(g):
        return math.degrees(math.atan2(g['lip'][1] - g['rear'][1], g['lip'][0] - g['rear'][0]))
    baseline = angle(idle)
    attacks = [r for r in records if r['animation'] == f'attack_{direction}']
    assert len(attacks) == 5, (direction, len(attacks))
    for r in attacks:
        g = r['gun']
        difference = abs((angle(g) - baseline + 180) % 360 - 180)
        assert difference <= 15, (r['name'], 'barrel angle', difference)
        assert g['visible'] == (r['frame'] in (1, 2)), (r['name'], 'flash visibility')
        if g['visible']:
            distance = math.dist(g['lip'], g['flash'])
            assert distance <= 5, (r['name'], 'flash to muzzle', distance)
            image = Image.open(root / (r['name'] + '.png')).convert('RGBA')
            points = [(x, y) for y in range(image.height) for x in range(image.width)
                      if math.dist((x, y), g['flash']) <= 13 and
                      (lambda p: p[0] > 240 and p[1] > 220 and p[2] < 225 and p[3] > 80)(image.getpixel((x, y)))]
            assert points, (r['name'], 'no rendered gold flash')
            center = (sum(x for x, _ in points) / len(points), sum(y for _, y in points) / len(points))
            assert math.dist(center, g['flash']) <= 7, (r['name'], 'raster flash center', center, g['flash'])
            alpha = image.getchannel('A')
            edge = max(alpha.crop(box).getextrema()[1] for box in ((0, 0, 128, 2), (0, 126, 128, 128), (0, 0, 2, 128), (126, 0, 128, 128)))
            assert edge <= 30, (r['name'], 'clipped sprite or flash', edge)
        checked += 1
print(f'PASS orbital_gunner barrel angles {checked}/40 <=15deg; flash centers 16/16 <=5px from lip, raster <=7px')
