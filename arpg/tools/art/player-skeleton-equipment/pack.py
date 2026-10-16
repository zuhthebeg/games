"""Pack sparse independent colour+16-bit camera Z; never pre-render 32 combinations.
python3 pack.py OFFLINE_ROOT DEST [--checkpoint]
"""
import sys,json,math,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);dest=Path(sys.argv[2]);folder=root/'frames/player-skeleton-equipment'
info=json.loads((folder/'frames.json').read_text());names=[r['name'] for r in info['frames']]
layers=['base','hands','feet','body','head','sword','blunt'];manifest={'id':'player-skeleton-equipment','size':128,'fps':12,'anchor':info['anchor'],'animation_durations':{'dodge':.2,'hit':.15,'death':.6},'frames':names,'animations':{},'layers':{},'layout':{'frames':{}},'depth':{'near':3,'far':9,'encoding':'RG16 little endian linear camera Z; smaller is nearer'}}
for r in info['frames']:manifest['animations'].setdefault(r['animation'],[]).append(r['name'])
for g in manifest['animations']:manifest['animations'][g].sort()
images={};depths={};bounds={};metrics={'layers':{},'source':info,'nonstatic':{}}
for layer in layers:
 for n in names:
  im=Image.open(folder/(n+'.'+layer+'.png')).convert('RGBA');images[layer,n]=im;bounds[layer,n]=im.getbbox()
  candidates=list(folder.glob(n+'.'+layer+'.depth*.png'))
  assert len(candidates)==1,(n,layer,candidates)
  z=Image.open(candidates[0]);assert z.mode in ('I;16','I'),(z.mode,candidates[0])
  depths[layer,n]=z
 for group,frames in manifest['animations'].items():
  if layer=='base' and len(frames)>1:assert len({hashlib.sha256(images[layer,n].tobytes()).hexdigest() for n in frames})>1,group
# Union of ALL layers defines fixed common output layout, independent of selected gear.
def shelves(entries):
 x=y=h=0;rects={}
 for n,b in entries:
  w=b[2]-b[0];hh=b[3]-b[1]
  if x+w+2>1024:x=0;y+=h;h=0
  rects[n]=[x+1,y+1,w,hh];x+=w+2;h=max(h,hh+2)
 return rects,[1024,math.ceil((y+h)/4)*4]
union={}
for n in names:
 bs=[bounds[l,n] for l in layers if bounds[l,n]]
 union[n]=(min(b[0] for b in bs),min(b[1] for b in bs),max(b[2] for b in bs),max(b[3] for b in bs))
rects,size=shelves([(n,union[n]) for n in sorted(names,key=lambda n:-(union[n][3]-union[n][1]))]);assert size[1]<=4096,size
manifest['layout']['size']=size
for n,b in union.items():manifest['layout']['frames'][n]={'rect':rects[n],'trim':[b[0],b[1],b[2]-b[0],b[3]-b[1]]}
dest.mkdir(parents=True,exist_ok=True)
for layer in layers:
 present=[n for n in names if bounds[layer,n]];lr,ls=shelves([(n,bounds[layer,n]) for n in sorted(present,key=lambda n:-(bounds[layer,n][3]-bounds[layer,n][1]))]);assert ls[1]<=4096
 color=Image.new('RGBA',ls);depth=Image.new('RGB',ls);frames={};rs=[]
 for n in present:
  b=bounds[layer,n];r=lr[n];color.paste(images[layer,n].crop(b),(r[0],r[1]));zc=depths[layer,n].crop(b)
  encoded=Image.new('RGB',zc.size);encoded.putdata([(int(v)&255,int(v)>>8,0) for v in zc.getdata()]);depth.paste(encoded,(r[0],r[1]))
  frames[n]={'index':len(rs),'offset':list(b[:2])};rs.append(r)
 color.save(dest/(layer+'.webp'),lossless=True,method=4);depth.save(dest/(layer+'-z.png'),optimize=True)
 manifest['layers'][layer]={'image':layer+'.webp','depth':layer+'-z.png','size':ls,'frames':frames,'rects':rs}
 metrics['layers'][layer]={'decodedRGBABytes':ls[0]*ls[1]*8,'transferBytes':sum((dest/f).stat().st_size for f in [layer+'.webp',layer+'-z.png'])}
manifest['metrics']={'sourceDecodedRGBABytes':sum(x['decodedRGBABytes'] for x in metrics['layers'].values()),'transferBytes':sum(x['transferBytes'] for x in metrics['layers'].values()),'outputRGBABytes':size[0]*size[1]*4,'cacheOutputsMax':2}
(dest/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
# Checkpoint is a true model composite using exactly the runtime nearest-depth rule.
selected=[n for n in names if n.startswith(('idle_S_','idle_N_','idle_E_','dodge_S_','attack_E_'))]
composite=Image.new('RGB',(6*128,math.ceil(len(selected)*3/6)*150),(24,28,34));draw=ImageDraw.Draw(composite)
for i,(n,gear) in enumerate((n,gear) for n in selected for gear in [[],['hands','feet','body','head','sword'],['blunt']]):
 chosen=['base']+gear;out=Image.new('RGBA',(128,128));pix=out.load();cs={l:images[l,n].load() for l in chosen};zs={l:depths[l,n].load() for l in chosen}
 for y in range(128):
  for x in range(128):
   fragments=sorted([(zs[l][x,y],cs[l][x,y]) for l in chosen if cs[l][x,y][3]],reverse=True)
   v=[0.,0.,0.,0.]
   for z,c in fragments:
    a=c[3]/255;aa=a+v[3]*(1-a)
    if aa:v=[(c[k]*a+v[k]*v[3]*(1-a))/aa for k in range(3)]+[aa]
   pix[x,y]=tuple(round(v[k]) for k in range(3))+(round(v[3]*255),)
 x=i%6*128;y=i//6*150;composite.paste(out,(x,y+22),out);draw.text((x,y),n+(' bare' if not gear else ' kit' if len(gear)>1 else ' maul'),fill='white')
composite.save(root/'model-checkpoint.png')
(root/'packing-proof.json').write_text(json.dumps({'frames':len(names),'groups':len(manifest['animations']),'metrics':manifest['metrics'],'layers':metrics['layers'],'checkpoint':info['preview'],'visualApproval':False},indent=2))
print(json.dumps({'frames':len(names),'groups':len(manifest['animations']),'metrics':manifest['metrics']}))

if '--portrait-module' in sys.argv:
 module=Path(sys.argv[sys.argv.index('--portrait-module')+1])
 dk=json.loads((dest.parent/'player-death-knight/atlas-0.webp.json').read_text())
 entries={manifest['id']:{'anchor':manifest['anchor'],'size':manifest['layout']['size'],'frames':{n:v for n,v in manifest['layout']['frames'].items() if n.startswith('idle_') and n.endswith('_000')}}}
 entries['player-death-knight']={'anchor':dk['frames']['idle_S_000']['anchor'],'size':[dk['meta']['size']['w'],dk['meta']['size']['h']],'frames':{n:{'rect':[v['frame'][k] for k in ['x','y','w','h']],'trim':[v['spriteSourceSize'][k] for k in ['x','y','w','h']]} for n,v in dk['frames'].items() if n.startswith('idle_') and n.endswith('_000')}}
 module.write_text('// Generated from actual kit metadata by tools/art/player-skeleton-equipment/pack.py.\nexport const SKELETON_PORTRAITS = '+json.dumps(entries,separators=(',',':'))+';\n')
