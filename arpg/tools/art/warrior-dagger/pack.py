"""Pack offline Blender RGBA128 renders; no source model is copied to public assets."""
import json,hashlib,math,sys
from pathlib import Path
from PIL import Image,ImageDraw
src=Path(sys.argv[1]);dst=Path(sys.argv[2]);dst.mkdir(parents=True,exist_ok=True)
clips={'idle':13,'run':10,'attack':13,'death':10};directions=['E','SE','S','SW','W','NW','N','NE'];anchor={'x':.5,'y':.6370674967765808}
frames={};animations={};layout=[];x=y=2;shelf=0;width=1024
for clip,n in clips.items():
 for di in directions:
  names=[]
  for i in range(n):
   name=f'{clip}_{di}_{i:03}';im=Image.open(src/'frames'/f'{name}.png').convert('RGBA');assert im.size==(128,128)
   box=im.getchannel('A').getbbox();assert box,name
   crop=im.crop(box);w,h=crop.size
   if x+w+2>width:x=2;y+=shelf+4;shelf=0
   frames[name]={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':False,'trimmed':True,'spriteSourceSize':{'x':box[0],'y':box[1],'w':w,'h':h},'sourceSize':{'w':128,'h':128},'anchor':anchor};layout.append((crop,x,y));names.append(name);x+=w+4;shelf=max(shelf,h)
  animations[f'{clip}_{di}']=names
height=math.ceil((y+shelf+2)/64)*64;assert height<=2048
atlas=Image.new('RGBA',(width,height));
for crop,x,y in layout:atlas.paste(crop,(x,y))
# Lossless WebP preserves inspected alpha and colour exactly.
import io
buf=io.BytesIO();atlas.save(buf,format='WEBP',lossless=True,method=6);data=buf.getvalue();stamp=hashlib.sha256(data).hexdigest()[:12];image='atlas-'+stamp+'.webp';sheet='atlas-'+stamp+'.webp.json';(dst/image).write_bytes(data)
meta={'app':'v4 native128 dagger offline bake','version':'1','image':image,'format':'RGBA8888','size':{'w':width,'h':height},'scale':'1','fps':12}
(dst/sheet).write_text(json.dumps({'frames':frames,'animations':animations,'meta':meta},separators=(',',':'))+'\n')
proof=json.loads((src/'provenance.json').read_text());proof['delivery']={'frames':len(frames),'sheet':sheet,'image':image,'dimensions':[width,height],'decodedBytes':width*height*4,'bytes':len(data)+(dst/sheet).stat().st_size,'fallbacks':{'hit':'runtime idle','dodge':'runtime idle'},'perFrameSHA256':{p.stem:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((src/'frames').glob('*.png'))}}
(dst.parent.parent.parent/'tools/art/warrior-dagger/provenance.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof['delivery'],default=str)[:300])
