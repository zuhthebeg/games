"""Pillow already installed. Offline PNGs never enter runtime asset directories."""
from pathlib import Path
import json, hashlib, sys
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[3]
source=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/mnt/c/Users/user/ai-tools/arpg-art/skill-icons-1028')
cfg=json.loads(Path(__file__).with_name('prompts.json').read_text())
out=root/'assets/skill-icons'; out.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[];sheet=Image.new('RGB',(5*200,2*232),'#171b23');draw=ImageDraw.Draw(sheet)
for i,item in enumerate(cfg['icons']):
 p=source/(item['id']+'.png'); im=Image.open(p).convert('RGB'); assert im.size==(768,768)
 webp=out/(item['id']+'.webp'); im.resize((256,256),Image.Resampling.LANCZOS).save(webp,'WEBP',quality=65,method=6)
 assert webp.stat().st_size<15360
 rows.append(dict(id=item['id'],source=str(p),sourceSha256=sha(p),webpSha256=sha(webp),bytes=webp.stat().st_size))
 x=(i%5)*200;y=(i//5)*232;sheet.paste(Image.open(webp).resize((196,196)),(x,y));draw.text((x+4,y+200),item['id'],fill='white')
sheet.save(source/'contact-sheet.png')
provenance=dict(platform='win32',gpu='NVIDIA GeForce RTX 3080 Ti',pipeline='existing generate-image-win.py build_pipe, local cached LuminarQMix v7, no paid API or download',modelSnapshot=cfg['model'],settings='prompts.json',delivery=dict(width=256,height=256,format='WebP',quality=65,method=6,resample='LANCZOS'),generatedOutputsLicense='AI-generated outputs; no claim of third-party CC0 or exclusive copyright',assets=rows,totalBytes=sum(r['bytes'] for r in rows))
Path(__file__).with_name('provenance.json').write_text(json.dumps(provenance,indent=2)+chr(10))
print(json.dumps(dict(icons=len(rows),totalBytes=provenance['totalBytes'],contactSheet=str(source/'contact-sheet.png'))))
