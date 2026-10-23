"""Offline weapon-layer-only attack re-bake from the shipped independent atlas.

Run: python3 rotate-attack-weapons.py ASSET_DIR [REVIEW_PNG]
Original rigid meshes are retained; their projected colour and linear camera-Z
samples rotate together about the *authored* mainhand socket. Bow is untouched.
No body/armor or shield image is decoded/re-encoded. The existing melee clip has
little wrist pronation, so this bounded attack-phase rotation supplies the arc.
"""
import copy
import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw

root=Path(sys.argv[1]); review=Path(sys.argv[2]) if len(sys.argv)>2 else None
manifest_path=root/'manifest.json'; m=json.loads(manifest_path.read_text()); before=copy.deepcopy(m)
assert m['version']=='warrior-player-independent-v1' and len(m['frames'])==368
names=m['frames']; keys=('sword','blunt','wand','staff')
# Attack is thirteen sampled frames (source action 1H_Melee_Attack_Slice_Horizontal).
# Contact target is facing-specific; ramp angle across wind-up and recovery.
# This is a post-bake planar correction, NOT a new 3D pose or bow-draw clip.
key_angles=((0,0),(2,.35),(4,.55),(6,1),(8,.9),(10,.4),(12,0))
impact_target={'S':-180,'SE':-28,'E':-20,'NE':-40,'N':-155,'NW':-155,'W':-165,'SW':-175}
def angle(name):
    state,direction,index=name.split('_')
    if state!='attack': return 0
    i=int(index)
    a,b=next(((x,y),(xx,yy)) for (x,y),(xx,yy) in zip(key_angles,key_angles[1:]) if x<=i<=xx)
    weight=a[1]+(b[1]-a[1])*(i-a[0])/(b[0]-a[0])
    impact=m['sockets'][f'attack_{direction}_006']['hands']['r'];u=impact['pixel'];v=impact['axisPixel']
    source_impact=math.degrees(math.atan2(v[1]-u[1],v[0]-u[0]))
    delta=(source_impact-impact_target[direction]+180)%360-180
    # Pillow positive angles subtract from the screen-space direction.
    return weight*delta

def unpack(layer):
    meta=before['layers'][layer]; color=Image.open(root/meta['image']).convert('RGBA'); z=Image.open(root/meta['depth']).convert('RGB'); assert color.size==z.size
    out={}
    for n,f in meta['frames'].items():
        rect=meta['rects'][f['index']]; xy=tuple(rect[:2]); box=(xy[0],xy[1],xy[0]+rect[2],xy[1]+rect[3]); pos=f['offset']
        rgba=Image.new('RGBA',(192,192));depth=Image.new('RGB',(192,192))
        rgba.paste(color.crop(box),(pos[0]+32,pos[1]+32));depth.paste(z.crop(box),(pos[0]+32,pos[1]+32));out[n]=(rgba,depth)
    return out

def shelves(entries):
    x=y=h=0;rects={}
    for n,b in entries:
        w=b[2]-b[0];height=b[3]-b[1]
        if x+w+2>1024:x=0;y+=h;h=0
        rects[n]=[x+1,y+1,w,height];x+=w+2;h=max(h,height+2)
    return rects,[1024,(y+h+3)//4*4]

original={k:unpack(k) for k in keys}; altered={}; bounds={}
for k in keys:
    altered[k]={}
    for n,(c,z) in original[k].items():
        deg=angle(n)
        if deg:
            socket=m['sockets'][n]['hands']['r']['pixel'];cx,cy=(socket[0]+32,socket[1]+32)
            # Pillow positive angle rotates counter-clockwise in screen space.
            c=c.rotate(deg,Image.Resampling.NEAREST,center=(cx,cy));z=z.rotate(deg,Image.Resampling.NEAREST,center=(cx,cy))
        altered[k][n]=(c,z);bounds[k,n]=c.getbbox()
        if not bounds[k,n]:raise ValueError(('empty weapon',k,n))
for k in keys:
    meta=m['layers'][k]; present=list(meta['frames'])
    rects,size=shelves([(n,bounds[k,n]) for n in sorted(present,key=lambda n:-(bounds[k,n][3]-bounds[k,n][1]))]);assert size[1]<=4096,(k,size)
    canvas=Image.new('RGBA',size);depth=Image.new('RGB',size); frames={};ordered=[]
    for n in present:
        b=bounds[k,n];r=rects[n];c,z=altered[k][n];canvas.paste(c.crop(b),tuple(r[:2]));depth.paste(z.crop(b),tuple(r[:2]))
        frames[n]={'index':len(ordered),'offset':[b[0]-32,b[1]-32]};ordered.append(r)
    canvas.save(root/meta['image'],lossless=True,method=4);depth.save(root/meta['depth'],optimize=True)
    meta.update(size=size,rects=ordered,frames=frames)
# Repack only shared *layout metadata*. Its rectangle union must contain the
# new per-frame weapon extent; leave every other source atlas byte-identical.
for n in names:
    old=m['layout']['frames'][n]['trim'];boxes=[(old[0],old[1],old[0]+old[2],old[1]+old[3])]
    boxes.extend((bounds[k,n][0]-32,bounds[k,n][1]-32,bounds[k,n][2]-32,bounds[k,n][3]-32) for k in keys if (k,n) in bounds)
    b=(min(v[0] for v in boxes),min(v[1] for v in boxes),max(v[2] for v in boxes),max(v[3] for v in boxes))
    assert min(b[:2])>=-32 and max(b[2:])<=160,(n,b)
    m['layout']['frames'][n]['trim']=[b[0],b[1],b[2]-b[0],b[3]-b[1]]
rr,sz=shelves([(n,(v['trim'][0],v['trim'][1],v['trim'][0]+v['trim'][2],v['trim'][1]+v['trim'][3])) for n,v in sorted(m['layout']['frames'].items(),key=lambda nv:-nv[1]['trim'][3])]);assert sz[1]<=4096,sz
for n,r in rr.items():m['layout']['frames'][n]['rect']=r
m['layout']['size']=sz
m['version']='warrior-player-independent-v2';manifest_path.write_text(json.dumps(m,separators=(',',':')))
if review:
    fixed={key:unpack(key) for key in ('base','hands','feet','body','head')}
    selected=[f'attack_{d}_{i:03d}' for k in ('sword','staff') for d in ('S','E','N','W') for i in (2,6,9)]
    sheet=Image.new('RGB',(6*128,8*128),(26,30,36));dr=ImageDraw.Draw(sheet)
    for idx,n in enumerate(selected):
        k='sword' if idx<12 else 'staff';r=idx//3;col=(idx%3)*2
        for side,source in enumerate((original,altered)):
            pieces=[tuple(im.crop((32,32,160,160)) for im in fixed[key][n]) for key in fixed]+[tuple(im.crop((32,32,160,160)) for im in source[k][n])]
            colors=[a.load() for a,b in pieces];depths=[b.load() for a,b in pieces]
            out=Image.new('RGB',(128,128),(26,30,36));pixels=out.load()
            for y in range(128):
                for x in range(128):
                    hits=sorted(((z[x,y][0]+256*z[x,y][1],c[x,y]) for c,z in zip(colors,depths) if c[x,y][3]),reverse=True)
                    v=(26.,30.,36.)
                    for _,rgba in hits:
                        alpha=rgba[3]/255;v=tuple(rgba[j]*alpha+v[j]*(1-alpha) for j in range(3))
                    pixels[x,y]=tuple(round(t) for t in v)
            sheet.paste(out,((col+side)*128,r*128));dr.text(((col+side)*128+2,r*128+2),('B' if side==0 else 'A')+' '+k[:1]+n.split('_')[1]+n[-3:],fill='yellow')
    review.parent.mkdir(parents=True,exist_ok=True);sheet.save(review,optimize=True)
print(json.dumps({'frames':len(names),'changedAttackFrames':sum(bool(angle(n)) for n in names),'layers':list(keys),'layout':sz,'review':str(review) if review else None}))
