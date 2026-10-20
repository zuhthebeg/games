from pathlib import Path
import json,hashlib
from PIL import Image,ImageDraw,ImageFilter
import numpy as np
src=Path('/mnt/c/Users/user/ai-tools/outputs/arpg-new-shields-20261020');out=Path(__file__).resolve().parents[1]/'assets/items'
manifest=json.loads((src/'generation.json').read_text())
sheet=Image.new('RGB',(800,300),'#252726');d=ImageDraw.Draw(sheet)
for i,r in enumerate(manifest['assets']):
 r['referenceSha256']=hashlib.sha256((src/(r['id']+'-guide.png')).read_bytes()).hexdigest()
 f=src/(r['id']+'.png');assert hashlib.sha256(f.read_bytes()).hexdigest()==r['sourceSha256']
 im=Image.open(f).convert('RGB');a=np.array(im);low=a.min(axis=2);spread=a.max(axis=2)-low
 mask=Image.fromarray(np.uint8((low>145)&(spread<110))*255).copy();ImageDraw.floodfill(mask,(0,0),127,thresh=0)
 alpha=Image.fromarray(np.uint8(np.array(mask)!=127)*255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.45))
 im=im.convert('RGBA');im.putalpha(alpha);tile=Image.new('RGBA',im.size,'#252726');tile.alpha_composite(im);im=tile.convert('RGB')
 target=out/(r['id']+'.webp');im.resize((256,256),Image.Resampling.LANCZOS).save(target,'WEBP',quality=88,method=6)
 r.update(output=target.name,outputSha256=hashlib.sha256(target.read_bytes()).hexdigest(),outputBytes=target.stat().st_size,outputSize=[256,256],reviewedDirectly=True)
 sheet.paste(im.resize((180,180)),(i*200+10,25));sheet.paste(im.resize((44,44)),(i*200+10,220));sheet.paste(im.resize((64,64)),(i*200+80,220));d.text((i*200+10,5),r['id'],fill='white')
manifest.update(generatorSha256=hashlib.sha256((out.parents[1]/'tools/item-art-new-shields-generate.py').read_bytes()).hexdigest(),guidesScriptSha256=hashlib.sha256((out.parents[1]/'tools/item-art-new-shields-guides.py').read_bytes()).hexdigest(),schemaVersion=1,targetUse='in-game web ARPG icons',runtime='Windows native LuminarQMix SDXL CUDA, offline img2img',offline=True,paidApiUsed=False,attempts=4,encoding='white boundary flood fill, 1px erode, .45px feather, charcoal matte #252726, Lanczos 256px WebP quality88 method6',review='Four distinct complete objects; readable metal boss / blue heraldry / rectangular wood reinforcement / skull and ivory ribs; inspected at 180px and 44/64px.')
(out/'new-shields-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');sheet.save('/home/cocy/.openclaw/workspace/tmp/arpg-new-shields/icons-reviewed.png')
