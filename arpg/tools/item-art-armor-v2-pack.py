"""Pack selected, directly reviewed model sources without replacing legacy manifest."""
import argparse,json,hashlib
from PIL import ImageFilter,ImageChops
import numpy as np
from pathlib import Path
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('--reviewed',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parents[1];src=Path('/mnt/c/Users/user/ai-tools/outputs/arpg-armor-v2-20261018-pass2');out=root/'assets/items'
record=json.loads((src/'generation.json').read_text());third=Path(str(src).replace('pass2','pass3'))
if (third/'generation.json').exists():
 fixes={r['id']:r for r in json.loads((third/'generation.json').read_text())['assets']}
 record['assets']=[fixes.get(r['id'],r) for r in record['assets']]
sheet=Image.new('RGB',(1000,430),'#20201e');d=ImageDraw.Draw(sheet)
for i,r in enumerate(record['assets']):
 source=Path('/mnt/c')/r['sourceWindowsPath'][3:].replace('\\','/')
 assert hashlib.sha256(source.read_bytes()).hexdigest()==r['sourceSha256'], source
 im=Image.open(source).convert('RGB')
 pixels=np.array(im);low=pixels.min(axis=2);spread=pixels.max(axis=2)-low
 candidate=Image.fromarray(np.uint8((low>145)&(spread<110))*255).copy()
 ImageDraw.floodfill(candidate,(0,0),127,thresh=0)
 alpha=Image.fromarray(np.uint8(np.array(candidate)!=127)*255).copy()
 alpha=alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.45))
 im=im.convert('RGBA');im.putalpha(alpha)
 tile=Image.new('RGBA',im.size,'#252726');tile.alpha_composite(im);im=tile.convert('RGB')
 sheet.paste(im.resize((184,184),Image.Resampling.LANCZOS),(i*200+8,30));d.text((i*200+8,8),r['id'],fill='white')
 for j,n in enumerate([44,64]):sheet.paste(im.resize((n,n),Image.Resampling.LANCZOS),(i*200+8+j*80,240));d.text((i*200+8+j*80,315),str(n)+'px',fill='white')
 if a.reviewed:
  target=out/(r['id']+'-armor-v2.webp');im.resize((256,256),Image.Resampling.LANCZOS).save(target,'WEBP',quality=88,method=6)
  raw=target.read_bytes();r.update(output=target.name,outputSha256=hashlib.sha256(raw).hexdigest(),outputBytes=len(raw),outputSize=[256,256],alpha=False,reviewedDirectly=True)
contact=Path('/home/cocy/.openclaw/workspace/tmp/arpg-armor-v2-contact.png');sheet.save(contact)
if a.reviewed:
 record.update(schemaVersion=1,targetUse='in-game web ARPG inventory icons',offline=True,paidApiUsed=False,installs=False,runtime='Windows native diffusion-win Python via PowerShell; CPU offload with CUDA inference',cachedRevision='0640e5837d88a339cfb3d9a9ac2715c93a54c036',scheduler='EulerAncestralDiscreteScheduler',generationScriptSha256=hashlib.sha256((root/'tools/item-art-armor-v2-generate.py').read_bytes()).hexdigest(),encoding={'format':'WebP','quality':88,'method':6,'postprocessing':'RGB conversion and Lanczos square downscale only; white-background boundary flood fill (min RGB >145, channel spread <110), 1px matte erosion and 0.45px feather, composite on charcoal #252726 then Lanczos downscale; no painted replacement'},attempts=13,rejected=8,rejectedSources=['arpg-armor-v2-20261018: all five wrong subjects (character armor/lantern)', 'arpg-armor-v2-20261018-pass2: greaves too long, hood had eyes/ears, shield became barrel'],contactSheet=str(contact),deliveredContactSheet='/home/cocy/.openclaw/workspace/tmp/arpg-armor-v2-delivered-contact.png',review='Direct private contact-sheet inspection at 184px and actual 44/64px; no browser screenshots. Two complete boots per pair, closed empty visor helmet, empty leather hood, front shield.')
 (out/'armor-v2-manifest.json').write_text(json.dumps(record,indent=2)+'\n')
print(contact)
