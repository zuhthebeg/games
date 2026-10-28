"""Offline art contract. Run from repository root after full bake and pack."""
import json, hashlib, subprocess, collections
from pathlib import Path
from PIL import Image
here=Path(__file__).resolve().parent
repo=here.parents[4]
cfg=json.loads((here/'config.json').read_text())
prov=json.loads((here/'provenance.json').read_text())
assert hashlib.sha256((repo/prov['base_source']).read_bytes()).hexdigest()==prov['base_sha256']
root=Path(subprocess.check_output(['wslpath','-u',cfg['output']],text=True).strip()).parent
source=root/'frames/venom-dragon'
info=json.loads((source/'frames.json').read_text()); assert not info['preview']
source_check=json.loads((here/'source-validation.json').read_text()); assert source_check['status']=='PASS'
assert source_check['animated_objects']==9
assert info['geometry']==dict(legs=4,wings=2,claws=12,neck_segments=4,tail_segments=6,mesh_objects=113,venom_ornaments=22)
assert len(info['frames'])==264
assert len({tuple(r['ground_anchor'].values()) for r in info['frames']})==1
folder=repo/'arpg/assets/sprites/venom-dragon'
frames={}; clips={}; decoded=0; sizes=[]
for meta in sorted(folder.glob('*.json')):
 data=json.loads(meta.read_text()); im=Image.open(folder/data['meta']['image']).convert('RGBA')
 assert im.size==tuple(data['meta']['size'][k] for k in ['w','h'])
 assert max(im.size)<2048
 decoded+=im.width*im.height*4; sizes.append(list(im.size))
 clips.update(data['animations'])
 for name,f in data['frames'].items():
  r=f['frame']; assert r['w']==r['h']==128 and f['anchor']==info['anchor']
  tile=im.crop((r['x'],r['y'],r['x']+128,r['y']+128)); alpha=tile.getchannel('A')
  original=Image.open(source/(name+'.png')).convert('RGBA')
  assert alpha.tobytes()==original.getchannel('A').tobytes(),name+' alpha'
  box=alpha.getbbox(); assert box and min(box[:2])>0 and max(box[2:])<128,(name,box)
  frames[name]=hashlib.sha256(tile.tobytes()).hexdigest()
assert len(frames)==264 and len(clips)==40
for state,n in cfg['frame_counts'].items():
 for direction in cfg['directions']:
  names=clips[state+'_'+direction]; assert len(names)==n
  assert names==[f'{state}_{direction}_{i:03d}' for i in range(n)]
  assert len({frames[k] for k in names})>=2,(state,direction,'static')
 assert len({frames[clips[state+'_'+d][0]] for d in cfg['directions']})==8
for r in info['frames']:
 x,y,X,Y=r['projected_bounds']; assert 0<x<X<1 and 0<y<Y<1
wire=sum(p.stat().st_size for p in folder.iterdir())
assert wire<=1_000_000 and decoded<=20*1024**2
# Exact preservation of tracked baseline files outside the additive ledger.
changed=subprocess.check_output(['git','diff','55c8844b19db91c6c4d514cfb272378ced7a561a','--name-only'],cwd=repo,text=True).splitlines()
changed+=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=repo,text=True).splitlines()
assert not [p for p in changed if p!='arpg/assets-ledger.md' and not p.startswith(('arpg/tools/art/dragon-variants/ember/','arpg/assets/sprites/ember-dragon/','arpg/tools/art/dragon-variants/venom/','arpg/assets/sprites/venom-dragon/'))],changed
assert subprocess.check_output(['git','diff','55c8844b19db91c6c4d514cfb272378ced7a561a','--','arpg/tools/art/dragon-variants/frost','arpg/assets/sprites/frost-dragon','arpg/tools/art/original-dragon','arpg/assets/sprites/dragon','arpg/assets/sprites/gargoyle','arpg/assets/sprites/manifest.json'],cwd=repo)==b''
result=dict(status='PASS',frames=264,clips=40,directions=8,frame_size=128,wire_bytes=wire,decoded_rgba_bytes=decoded,atlas_sizes=sizes,anchor=info['anchor'],geometry=info['geometry'],preservation='Tracked baseline outside scoped additions identical; shared manifest, original source/copper and gargoyle byte-identical',limitations='Offline art only; no registration, gameplay, deployment or physical-device test')
(here/'validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
