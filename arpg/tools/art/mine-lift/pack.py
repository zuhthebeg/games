"""Pack original Blender frames with installed Pillow; no dependencies installed."""
from PIL import Image
from pathlib import Path
import sys,json,hashlib
src=Path(sys.argv[1]);dest=Path(sys.argv[2]);dest.mkdir(parents=True,exist_ok=True)
a=Image.new('RGBA',(1536,768));sheet=Image.new('RGB',(768,384),'#27312e');checks=[]
for i in range(32):
 im=Image.open(src/('frame-%02d.png'%i)).convert('RGBA');assert im.size==(192,192);assert im.getbbox();a.paste(im,((i%8)*192,(i//8)*192));checks.append(hashlib.sha256(im.tobytes()).hexdigest())
 if i%4==0:sheet.paste(im,((i//4%4)*192,(i//16)*192),im)
a.save(dest/'lift.webp','WEBP',quality=82,method=6);sheet.save(src/'contact-sheet.png');assert len(set(checks))>=16
p=dest/"lift.webp";(dest/"budget.json").write_text(json.dumps({"width":1536,"height":768,"frames":32,"frameSize":192,"fps":4,"wireBytes":p.stat().st_size,"rgbaBytes":1536*768*4,"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"uniqueFrames":len(set(checks))},indent=2))
print((dest/'budget.json').read_text())
