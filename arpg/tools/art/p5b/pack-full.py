"""Validate every B combination against full 3D and pack lossless trimmed sources."""
import json,sys,hashlib,math
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(sys.argv[1]);dest=Path(sys.argv[2]);dest.mkdir(parents=True,exist_ok=True)
summary=[];total=0

def shelf(boxes,width=1024):
 x=y=row=0;rects=[]
 for w,h in boxes:
  if x+w+2>width:y+=row;x=row=0
  rects.append([x+1,y+1,w,h]);x+=w+2;row=max(row,h+2)
 return rects,[width, max(4,math.ceil((y+row)/4)*4)]
def read(p):return Image.open(p).convert('RGBA')
def premul(im):
 a=np.array(im,dtype=np.int16);a[:,:,:3]=(a[:,:,:3]*a[:,:,3:4]+127)//255;return a
for name in ['hero-sword','hero-bow','hero-focus']:
 folder=root/'frames'/name;info=json.loads((folder/'frames.json').read_text());records=info['frames'];names=[r['name'] for r in records]
 kit={'hero-sword':'blade','hero-bow':'bow','hero-focus':'focus'}[name];out=dest/kit;out.mkdir(exist_ok=True)
 layers=['base','mask']+['head-'+h for h in info['heads'] if h!='none']+[f'weapon-{w}-{h}' for w in info['weapons'] for h in info['heads']]
 worst=0;diff_frames=0;clipped=0;head_occluded=0;mask_counts=[0,0,0];unions=[]
 for r in records:
  assert r['source']!='T-Pose';assert max(r['pose']['arm_degrees_from_bind'])>10;assert r['pose']['skin_rms_from_bind_height']>.015
  n=r['name'];base=read(folder/'base'/(n+'.png'));box=base.getchannel('A').getbbox();assert box is not None
  union=box;mask=np.array(read(folder/'mask'/(n+'.png')))
  for c in range(3):mask_counts[c]+=int((mask[:,:,c]>128).sum())
  for h in info['heads']:
   head=read(folder/('head-'+h)/(n+'.png')) if h!='none' else Image.new('RGBA',(128,128))
   for w in info['weapons']:
    weapon=read(folder/f'weapon-{w}-{h}'/(n+'.png'));reference=read(folder/f'reference-{w}-{h}'/(n+'.png'))
    composed=Image.alpha_composite(Image.alpha_composite(base,head),weapon)
    difference=np.abs(premul(composed)-premul(reference)).max(axis=2);count=int((difference>0).sum());worst=max(worst,count);diff_frames+=count>0
    assert count==0,(kit,n,h,w,'depth/coverage mismatch',count)
    bbox=reference.getchannel('A').getbbox();assert bbox is not None
    if bbox[0]==0 or bbox[1]==0 or bbox[2]==128 or bbox[3]==128:clipped+=1
    union=(min(union[0],bbox[0]),min(union[1],bbox[1]),max(union[2],bbox[2]),max(union[3],bbox[3]))
   if h!='none' and n.startswith(('death_','dodge_')) and head.getchannel('A').getbbox():head_occluded+=1
  unions.append(union)
 assert clipped==0;assert all(mask_counts)
 manifest={'version':'b1','kit':kit,'size':128,'fps':10,'anchor':info['camera']['anchor'],'frames':names,'animations':{},'layers':{},'layout':{}}
 for r in records:manifest['animations'].setdefault(r['animation'],[]).append(r['name'])
 rects,size=shelf([(b[2]-b[0],b[3]-b[1]) for b in unions]);assert size[1]<=4096
 manifest['layout']={'size':size,'frames':{n:{'rect':rect,'trim':[b[0],b[1],b[2]-b[0],b[3]-b[1]]} for n,b,rect in zip(names,unions,rects)}}
 measures=[]
 for layer in layers:
  unique=[];lookup={};frames={}
  for n in names:
   im=read(folder/layer/(n+'.png'));bbox=im.getchannel('A').getbbox()
   if not bbox:frames[n]=None;continue
   im=im.crop(bbox);digest=hashlib.sha256(im.tobytes()+str(im.size).encode()).hexdigest()
   if digest not in lookup:lookup[digest]=len(unique);unique.append(im)
   frames[n]={'index':lookup[digest],'offset':[bbox[0],bbox[1]]}
  rects,size=shelf([im.size for im in unique]);atlas=Image.new('RGBA',size)
  for im,rect in zip(unique,rects):atlas.paste(im,(rect[0],rect[1]))
  p=out/(layer+'.webp');atlas.save(p,'WEBP',lossless=True,method=6);decoded=read(p);assert decoded.tobytes()==atlas.tobytes(),(layer,'lossless mismatch')
  sizebytes=p.stat().st_size;total+=sizebytes
  manifest['layers'][layer]={'image':p.name,'size':size,'rects':rects,'frames':frames,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
  measures.append({'layer':layer,'bytes':sizebytes,'rgbaBytes':size[0]*size[1]*4,'unique':len(unique)})
 mp=out/'manifest.json';mp.write_text(json.dumps(manifest,separators=(',',':')));total+=mp.stat().st_size
 combos=len(records)*len(info['heads'])*len(info['weapons'])
 summary.append({'kit':kit,'frames':len(records),'clips':len(manifest['animations']),'combinations':combos,'mismatchedFrames':diff_frames,'worstPixels':worst,'cropped':clipped,'tPoseFrames':0,'maskPixels':mask_counts,'headDodgeDeathNonempty':head_occluded,'layoutRGBABytes':size[0]*size[1]*4 if False else manifest['layout']['size'][0]*manifest['layout']['size'][1]*4,'layers':measures,'manifestBytes':mp.stat().st_size})
 print(kit,'PASS',combos,flush=True)
report={'status':'PASS','totalSourceBytes':total,'gate':'B AA1 full6x8, exact premultiplied RGBA matches; not A or real phone','kits':summary}
(dest/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
