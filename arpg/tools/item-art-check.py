"""Decode, alpha-edge and delivery-budget checks. Optional JSON report path."""
from pathlib import Path
from PIL import Image
import PIL
import hashlib
import json
import sys
root = Path(__file__).resolve().parents[1] / 'assets/items'
manifest = json.loads((root / 'manifest.json').read_text())
results = []
for entry in manifest:
    path = root / entry['file']
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == entry['sha256'], path
    assert len(raw) == entry['bytes'], path
    with Image.open(path) as original:
        assert original.size == (96,96) and original.mode == 'RGBA', path
        im = original.copy()
    alpha = im.getchannel('A')
    assert alpha.getextrema() == (0,255), path
    assert all(alpha.getpixel((x,y)) == 0 for x in range(96) for y in [0,95]), path
    assert all(alpha.getpixel((x,y)) == 0 for y in range(96) for x in [0,95]), path
    small = []
    for size in [48,64]:
        a = im.resize((size,size), Image.Resampling.LANCZOS).getchannel('A')
        visible = sum(v>=128 for v in a.getdata())
        assert visible>90, (path,size,visible)
        assert a.getbbox(), path
        small.append(dict(size=size,opaquePixels=visible,bounds=a.getbbox()))
    results.append(dict(file=entry['file'],bytes=len(raw),bounds=alpha.getbbox(),sizes=small))
summary = dict(ok=True,pillow=PIL.__version__,files=len(results),encodedBytes=sum(r['bytes'] for r in results),
               transparentBorders=True,reviewSizes=[48,64],results=results)
if len(sys.argv)>1: Path(sys.argv[1]).write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='results'}))
