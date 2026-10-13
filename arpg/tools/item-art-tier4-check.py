"""Verify T4 alpha support and distinct silhouettes; optional JSON evidence output."""
from pathlib import Path
from PIL import Image
from itertools import combinations
import json, sys
root=Path(__file__).resolve().parents[1]/'assets/items'
manifest=json.loads((root/'manifest.json').read_text())
new=[r for r in manifest if r['source']=='arpg/tools/item-art-tier4.py']
assert len(new)==11
masks={};rows=[]
for r in manifest:
    im=Image.open(root/r['file']).convert('RGBA');assert im.size==(96,96)
    a=im.getchannel('A');masks[r['file']]=[v>=128 for v in a.get_flattened_data()]
    if r not in new:continue
    opaque=sum(v==255 for v in a.get_flattened_data());visible=sum(masks[r['file']])
    assert opaque>800 and visible>900,(r['file'],opaque,visible)
    assert a.getbbox() and a.getextrema()==(0,255)
    assert all(a.getpixel((x,y))==0 for x in range(96)for y in [0,95])
    assert all(a.getpixel((x,y))==0 for y in range(96)for x in [0,95])
    small={str(size):sum(v>=128 for v in im.resize((size,size),Image.Resampling.LANCZOS).getchannel('A').get_flattened_data())for size in [48,64]}
    assert min(small.values())>100
    other=[(name,sum(x!=y for x,y in zip(masks[r['file']],mask)))for name,mask in masks.items()if name!=r['file']]
    rows.append(dict(file=r['file'],opaquePixels255=opaque,maskPixels128=visible,bounds=a.getbbox(),small=small,bytes=r['bytes']))
pairs=[dict(a=a['file'],b=b['file'],maskDifference=sum(x!=y for x,y in zip(masks[a['file']],masks[b['file']])))for a,b in combinations(new,2)]
assert min(p['maskDifference']for p in pairs)>100
for r in rows:
    others=[(name,sum(x!=y for x,y in zip(masks[r['file']],mask)))for name,mask in masks.items()if name!=r['file']]
    nearest=min(others,key=lambda p:p[1]);assert nearest[1]>100,nearest
    r['nearestFile'],r['nearestMaskDifference']=nearest
report=dict(ok=True,alphaThreshold=128,files=len(new),distinctMasks=len({bytes(masks[r['file']])for r in new}),minPairDifference=min(p['maskDifference']for p in pairs),rows=rows,pairs=pairs)
if len(sys.argv)>1:Path(sys.argv[1]).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
