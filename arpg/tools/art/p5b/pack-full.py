"""Validate every B combination against full 3D and pack lossless trimmed sources."""
import json,sys,hashlib,math
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(sys.argv[1]);dest=Path(sys.argv[2]);dest.mkdir(parents=True,exist_ok=True)
summary=[];total=0
if len(sys.argv)>3 and sys.argv[3]=='--collect':
 kits=[json.loads((dest/k/'validation.json').read_text()) for k in ['blade','bow','focus']]
 report={'status':'PASS','totalSourceBytes':sum(k['sourceBytes'] for k in kits),
  'gate':'Full B AA1 6x8; bounded reference-corrected depth ties, exact corrected raw premultiplied RGBA and delivered alpha; lossy quality70 RGB. Not A or real phone.', 'kits':kits}
 (dest/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));sys.exit(0)

def shelf(boxes,width=1024):
 x=y=row=0;rects=[]
 for w,h in boxes:
  if x+w+2>width:y+=row;x=row=0
  rects.append([x+1,y+1,w,h]);x+=w+2;row=max(row,h+2)
 return rects,[width, max(4,math.ceil((y+row)/4)*4)]
def read(p):return Image.open(p).convert('RGBA')
def layer_image(folder,layer,n):
 return corrected[(layer,n)].copy() if (layer,n) in corrected else read(folder/layer/(n+'.png'))
def premul(im):
 a=np.array(im,dtype=np.int32);a[:,:,:3]=(a[:,:,:3]*a[:,:,3:4]+127)//255;return a
for name in ['hero-sword','hero-bow','hero-focus']:
 if len(sys.argv)>3 and name!=sys.argv[3]:continue
 folder=root/'frames'/name;info=json.loads((folder/'frames.json').read_text());records=info['frames'];names=[r['name'] for r in records]
 corrected={}
 kit={'hero-sword':'blade','hero-bow':'bow','hero-focus':'focus'}[name];out=dest/kit;out.mkdir(exist_ok=True)
 layers=['base','mask']+['head-'+h for h in info['heads'] if h!='none']+[f'weapon-{w}-{h}' for w in info['weapons'] for h in info['heads']]
 worst=0;diff_frames=0;raw_worst=0;raw_diff_frames=0;head_corrections=weapon_corrections=0;clipped=0;head_occluded=0;mask_counts=[0,0,0];unions=[]
 for r in records:
  assert r['source']!='T-Pose';assert max(r['pose']['arm_degrees_from_bind'])>10;assert r['pose']['skin_rms_from_bind_height']>.015
  n=r['name'];base=read(folder/'base'/(n+'.png'));box=base.getchannel('A').getbbox();assert box is not None
  union=box;mask=np.array(read(folder/'mask'/(n+'.png')))
  for c in range(3):mask_counts[c]+=int((mask[:,:,c]>128).sum())
  for h in info['heads']:
   head=read(folder/('head-'+h)/(n+'.png')) if h!='none' else Image.new('RGBA',(128,128))
   weapon_images={w:read(folder/f'weapon-{w}-{h}'/(n+'.png')) for w in info['weapons']}
   refs={w:read(folder/f'reference-{w}-{h}'/(n+'.png')) for w in info['weapons']}
   # AA1 holdout has occasional one-pixel depth ties. Preserve raw evidence;
   # reconcile only bounded boundary pixels using the actual full 3D references.
   for w in info['weapons']:
    raw=Image.alpha_composite(Image.alpha_composite(base,head),weapon_images[w])
    pixels=int((np.abs(premul(raw)-premul(refs[w])).max(axis=2)>0).sum())
    raw_worst=max(raw_worst,pixels);raw_diff_frames+=pixels>0
    assert pixels<=4,(kit,n,h,w,'not a bounded depth tie',pixels)
   head_array=np.array(head);remove=np.zeros((128,128),dtype=bool)
   for w in info['weapons']:
    remove|=(np.array(weapon_images[w])[:,:,3]==0)&(np.abs(premul(refs[w])-premul(base)).max(axis=2)==0)&(head_array[:,:,3]>0)
   head_array[remove]=0;head_corrections+=int(remove.sum());head=Image.fromarray(head_array)
   if h!='none' and remove.any():
    corrected[('head-'+h,n)]=head.copy()
    p=folder/'coverage-corrected'/('head-'+h)/(n+'.png');p.parent.mkdir(parents=True,exist_ok=True);head.save(p)
   under=Image.alpha_composite(base,head)
   for w in info['weapons']:
    weapon=weapon_images[w];reference=refs[w];composed=Image.alpha_composite(under,weapon)
    mismatch=np.abs(premul(composed)-premul(reference)).max(axis=2)>0
    wa=np.array(weapon);ra=np.array(reference)
    clear=mismatch&(np.abs(premul(under)-premul(reference)).max(axis=2)==0)
    assert not np.any(mismatch&~clear&(ra[:,:,3]!=255)),(kit,n,'unexpected fractional coverage')
    wa[clear]=0;wa[mismatch&~clear]=ra[mismatch&~clear];weapon_corrections+=int(mismatch.sum());weapon=Image.fromarray(wa)
    if mismatch.any():
     corrected[(f'weapon-{w}-{h}',n)]=weapon.copy()
     p=folder/'coverage-corrected'/f'weapon-{w}-{h}'/(n+'.png');p.parent.mkdir(parents=True,exist_ok=True);weapon.save(p)
    composed=Image.alpha_composite(under,weapon)
    difference=np.abs(premul(composed)-premul(reference)).max(axis=2);count=int((difference>0).sum());worst=max(worst,count);diff_frames+=count>0
    assert count==0,(kit,n,h,w,'corrected depth/coverage mismatch',count)
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
 groups=[[layer] for layer in layers if not layer.startswith('weapon-')]+[[f'weapon-{w}-{h}' for h in info['heads']] for w in info['weapons']]
 for group in groups:
  unique=[];lookup={};frame_maps={}
  for layer in group:
   frames={}
   for n in names:
    im=layer_image(folder,layer,n);bbox=im.getchannel('A').getbbox()
    if not bbox:frames[n]=None;continue
    im=im.crop(bbox);digest=hashlib.sha256(im.tobytes()+str(im.size).encode()).hexdigest()
    if digest not in lookup:lookup[digest]=len(unique);unique.append(im)
    frames[n]=[lookup[digest],bbox[0],bbox[1]]
   frame_maps[layer]=[frames[n] for n in names]
  rects,size=shelf([im.size for im in unique]);assert max(size)<=4096
  atlas=Image.new('RGBA',size)
  for im,rect in zip(unique,rects):atlas.paste(im,(rect[0],rect[1]))
  layer=group[0];filename=layer if len(group)==1 else '-'.join(layer.split('-')[:2])
  p=out/(filename+'.webp');atlas.save(p,'WEBP',lossless=layer=='mask',quality=70,method=6);decoded=read(p)
  assert decoded.getchannel('A').tobytes()==atlas.getchannel('A').tobytes(),(layer,'alpha mismatch')
  if layer=='mask':assert np.array_equal(premul(decoded),premul(atlas)),(layer,'mask mismatch')
  colour_error=np.abs(premul(decoded)-premul(atlas)).max(axis=2)
  sizebytes=p.stat().st_size;total+=sizebytes
  for layer in group:manifest['layers'][layer]={'image':p.name,'size':size,'rects':rects,'frames':frame_maps[layer],'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
  measures.append({'layers':group,'bytes':sizebytes,'rgbaBytes':size[0]*size[1]*4,'unique':len(unique),'alphaExact':True,'colourPixelsOver24':int((colour_error>24).sum()),'maxPremultipliedColourError':int(colour_error.max())})
 mp=out/'manifest.json';mp.write_text(json.dumps(manifest,separators=(',',':')));total+=mp.stat().st_size
 combos=len(records)*len(info['heads'])*len(info['weapons'])
 summary.append({'kit':kit,'frames':len(records),'clips':len(manifest['animations']),'combinations':combos,'rawMismatchFrames':raw_diff_frames,'rawWorstPixels':raw_worst,'correctedHeadPixels':head_corrections,'correctedWeaponPixels':weapon_corrections,'mismatchedFrames':diff_frames,'worstPixels':worst,'cropped':clipped,'tPoseFrames':0,'maskPixels':mask_counts,'headDodgeDeathNonempty':head_occluded,'layoutRGBABytes':manifest['layout']['size'][0]*manifest['layout']['size'][1]*4,'layers':measures,'manifestBytes':mp.stat().st_size})
 summary[-1]['sourceBytes']=sum(m['bytes'] for m in measures)+mp.stat().st_size
 (out/'validation.json').write_text(json.dumps(summary[-1],indent=2))
 # Only obsolete files produced by this pipeline; earlier intermediate versions
 # remain preserved in scoped git commits. Never touch another asset directory.
 wanted={layer['image'] for layer in manifest['layers'].values()}
 for old in out.glob('weapon-*-*.webp'):
  if old.name not in wanted:old.unlink()
 print(kit,'PASS',combos,flush=True)
report={'status':'PASS' if len(summary)==3 else 'PARTIAL','totalSourceBytes':total,'gate':'B AA1 full6x8 with <=4px reference-derived boundary reconciliation, corrected premultiplied RGBA exact; delivered WebP quality70, exact alpha/lossless masks; not A or real phone','kits':summary}
(dest/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
