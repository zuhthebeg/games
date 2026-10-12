#!/usr/bin/env python3
"""Resize native RGBA captures, constrain their support to gameplay geometry, pack.
No generated/repainted replacement frames. CLI: FRAMES OUT CONFIG REPORT GIF.
"""
import hashlib, json, math, sys
from pathlib import Path
from PIL import Image, ImageChops
source, output, config_path, report_path, gif_path = map(Path, sys.argv[1:])
config = json.loads(config_path.read_text())
output.mkdir(parents=True, exist_ok=True)
images, frames, clips, checks = [], {}, {}, []
for clip in config['clips']:
    paths = sorted(source.glob(clip['label'] + '-*.png'))
    assert len(paths) == math.ceil(clip['ticks'] / 3), (clip, len(paths))
    keys = []
    shape = clip.get('shape', 'circle')
    anchor = [0.5, 0.5]
    if shape == 'cone': anchor = [0.25, 0.5]
    mask = Image.new('L', (128, 80))
    pixels = mask.load()
    cx, cy = anchor[0]*128, anchor[1]*80
    for y in range(80):
        for x in range(128):
            dx, dy = x-cx, y-cy
            inside = dx*dx+dy*dy <= 34*34
            if shape == 'cone': inside = dx*dx+dy*dy <= 68*68 and abs(math.atan2(dy,dx)) <= math.radians(35)
            if shape == 'dash': inside = -34 <= dx <= 0 and abs(dy) <= 8
            if shape == 'arrow': inside = dx*dx+dy*dy <= 34*34 and abs(dy) <= 8
            pixels[x,y] = 255 if inside else 0
    for path in paths:
        raw = Image.open(path).convert('RGBA')
        assert raw.size == (256,160), raw.size
        bbox = raw.getchannel('A').getbbox()
        assert not bbox or (bbox[0]>0 and bbox[1]>0 and bbox[2]<256 and bbox[3]<160), ('raw clipping/empty',path,bbox)
        im = raw.resize((128,80), Image.Resampling.LANCZOS)
        if shape == 'cone':
            # Move the source origin with the atlas pivot; no geometry stretching.
            shifted=Image.new('RGBA',im.size); shifted.paste(im,(-32,0)); im=shifted
        im.putalpha(ImageChops.multiply(im.getchannel('A'),mask))
        key=path.stem; n=len(images); keys.append(key)
        frames[key]={'frame':{'x':n%8*128,'y':n//8*80,'w':128,'h':80}}
        checks.append({'id':key,'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rawBbox':bbox,'bbox':im.getchannel('A').getbbox(),'shape':shape})
        images.append(im)
    clips[clip['label']]={'frames':keys,'fps':20,'anchor':anchor,'support':68 if shape=='cone' else 34,'shape':shape}
size=(1024,math.ceil(len(images)/8)*80)
atlas=Image.new('RGBA',size)
for n,im in enumerate(images): atlas.paste(im,(n%8*128,n//8*80))
file=output/'atlas.webp';atlas.save(file,'WEBP',quality=82,method=6,exact=True)
decoded=Image.open(file).convert('RGBA')
assert decoded.getchannel('A').tobytes()==atlas.getchannel('A').tobytes()
meta={'version':2,'image':'atlas.webp','size':size,'frameSize':[128,80],'frames':frames,'clips':clips,'source':'Effekseer1.80.7 / Godot4.7.2 Forward+ transparent capture; resized and gameplay-support masked','blendMode':'normal'}
(output/'atlas.json').write_text(json.dumps(meta,separators=(',',':'))+'\n')
total=file.stat().st_size+(output/'atlas.json').stat().st_size
assert total<=250000,total
report={'frames':len(images),'atlasSize':size,'atlasBytes':file.stat().st_size,'jsonBytes':(output/'atlas.json').stat().st_size,'totalBytes':total,'decodedBytes':size[0]*size[1]*4,'alphaLossless':True,'rawClippedFrames':0,'supportMasked':True,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'framesProof':checks}
report_path.write_text(json.dumps(report,indent=2)+'\n')
gif_path.parent.mkdir(parents=True,exist_ok=True)
preview=[]
for im in images:
    bg=Image.new('RGBA',im.size,(20,25,30,255));bg.alpha_composite(im);preview.append(bg.convert('RGB'))
preview[0].save(gif_path,save_all=True,append_images=preview[1:],duration=50,loop=0)
print(json.dumps({k:v for k,v in report.items() if k!='framesProof'}))
