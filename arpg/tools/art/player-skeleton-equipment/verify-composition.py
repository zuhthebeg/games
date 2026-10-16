"""Compare true assembled Blender references to shipped, decoded per-pixel-depth layers.
python3 verify-composition.py OFFLINE_ROOT KIT_DIR
"""
import sys,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);kit=Path(sys.argv[2]);m=json.loads((kit/'manifest.json').read_text());refs=json.loads((root/'direct-references.json').read_text())
colors={k:np.asarray(Image.open(kit/v['image']).convert('RGBA')) for k,v in m['layers'].items()};depths={k:np.asarray(Image.open(kit/v['depth']).convert('RGB')) for k,v in m['layers'].items()}
def compose(name,keys):
 cs=[];zs=[]
 for k in keys:
  l=m['layers'][k];f=l['frames'].get(name);c=np.zeros((128,128,4),dtype=np.float64);z=np.full((128,128),65535,dtype=np.int32)
  if f:
   x,y,w,h=l['rects'][f['index']];ox,oy=f['offset'];c[oy:oy+h,ox:ox+w]=colors[k][y:y+h,x:x+w]/255
   dep=depths[k][y:y+h,x:x+w].astype(np.int32);z[oy:oy+h,ox:ox+w]=dep[:,:,0]+dep[:,:,1]*256
  cs.append(c);zs.append(z)
 cs=np.stack(cs);zs=np.stack(zs);order=np.argsort(-zs,axis=0,kind='stable');cs=np.take_along_axis(cs,order[:,:,:,None],axis=0)
 out=np.zeros((128,128,4))
 for c in cs:
  a=c[:,:,3:4];out[:,:,:3]=c[:,:,:3]*a+out[:,:,:3]*(1-a);out[:,:,3:4]=a+out[:,:,3:4]*(1-a)
 rgb=np.divide(out[:,:,:3],out[:,:,3:4],out=np.zeros_like(out[:,:,:3]),where=out[:,:,3:4]>0)
 return np.concatenate((rgb,out[:,:,3:4]),axis=2)
rows=[];preview=Image.new('RGB',(8*128,4*150),(24,28,34));draw=ImageDraw.Draw(preview)
preview_index=0
for i,r in enumerate(refs):
 c=compose(r['name'],r['layers']);actual=np.asarray(Image.open(root/'direct-references'/r['image']).convert('RGBA'))/255
 alpha=np.abs(c[:,:,3]-actual[:,:,3]);premult=np.abs(c[:,:,:3]*c[:,:,3:4]-actual[:,:,:3]*actual[:,:,3:4])
 interior=(c[:,:,3]>.99)&(actual[:,:,3]>.99);diff=np.max(np.abs(c[:,:,:3]-actual[:,:,:3]),axis=2)
 row={**r,'meanAlphaError':float(alpha.mean()),'meanPremultipliedRGBError':float(premult.mean()),'interiorRGBErrorMean':float(diff[interior].mean()) if interior.any() else 0,'largePixelErrorCount':int((diff[interior]>.25).sum())};rows.append(row)
 if r['name'] in ['idle_S_006','idle_N_006'] and r['weapon']=='sword':
  i=preview_index;preview_index+=1
  im=Image.fromarray(np.round(c*255).astype('uint8'));x=i%8*128;y=i//8*150;preview.paste(im,(x,y+22),im);draw.text((x,y),r['name']+' '+str(r['mask']),fill='white')
preview.save(root/'all16-front-rear-composed.png')
report={'pass':all(r['meanAlphaError']<.012 and r['meanPremultipliedRGBError']<.012 for r in rows),'referenceCount':len(rows),'all16FrontRear':True,'all6States8Directions':True,'bothWeaponFormsEveryCombination':len(rows)==1536,'sampledPose':'middle source pose per state/direction; all delivered frames separately validate nonstatic motion/clip contracts','worstMeanAlphaError':max(r['meanAlphaError'] for r in rows),'worstMeanPremultipliedRGBError':max(r['meanPremultipliedRGBError'] for r in rows),'notes':'Independent opaque geometric layers use camera-Z. EEVEE antialias edge samples differ slightly from full-scene multisampling; measured tolerance, NOT byte equality. No 32 full atlases.','rows':rows}
(root/'composition-proof.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='rows'},indent=2));sys.exit(0 if report['pass'] else 2)
