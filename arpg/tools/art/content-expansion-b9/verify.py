from pathlib import Path
from PIL import Image,ImageChops
import json,hashlib,collections,sys
repo=Path(__file__).resolve().parents[3]
config=json.loads((Path(__file__).parent/'config.json').read_text())
frames=Path('/mnt/c/Users/user/ai-tools/arpg-art/content-expansion-b9/frames')
manifest={x['id']:x for x in json.loads((repo/'assets/sprites/manifest.json').read_text())}
summary={}
for job in config['characters']:
 name=job['name'];entry=manifest[name];records=json.loads((frames/name/'frames.json').read_text())['frames'];assert len(records)==len({x['name'] for x in records})
 atlas=repo/'assets/sprites'/name; clips={}; decoded=0
 for sheet in entry['sheets']:
  j=json.loads((atlas/sheet).read_text());im=Image.open(atlas/j['meta']['image'].split('?')[0]).convert('RGBA');decoded+=im.width*im.height*4
  for clip,names in j['animations'].items():clips[clip]=[im.crop((j['frames'][n]['frame']['x'],j['frames'][n]['frame']['y'],j['frames'][n]['frame']['x']+128,j['frames'][n]['frame']['y']+128)) for n in names]
 for state in ('idle','run','attack','hit','death'):
  for direction in config['directions']:
   key=state+'_'+direction;ims=clips[key];assert len(ims)>=2,(name,key,'few frames')
   assert ImageChops.difference(ims[0],ims[-1]).getbbox(),(name,key,'frozen')
   assert all(im.getchannel('A').getbbox() for im in ims),(name,key,'empty')
 assert decoded<=16*1048576,(name,decoded)
 assert {r['source'] for r in records}==set(job['animations'].values()),name
 source=Path('/mnt/c/Users/user/ai-tools/arpg-art/content-expansion-b9/source')
 for suffix in ('glb','html'):
  data=(source/f'{name}.{suffix}').read_bytes();assert hashlib.sha256(data).hexdigest() in (Path(__file__).parent/name/'PROVENANCE.md').read_text()
 summary[name]={'clips':len(clips),'frames':len(records),'decodedMiB':round(decoded/1048576,2),'webBytes':entry['bytes']}
print(json.dumps(summary,ensure_ascii=False))
