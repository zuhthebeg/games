"""Check ORIGINAL object-keyed kit, without pretending it is a downloaded skinned rig."""
import json,hashlib,subprocess
from pathlib import Path
from PIL import Image
repo=Path(__file__).resolve().parents[4]; kit=Path(__file__).parent
cfg=json.loads((kit/'config.json').read_text()); root=Path(subprocess.check_output(['wslpath','-u',cfg['output']],text=True).strip())
info=json.loads((root/'dragon/frames.json').read_text()); manifest=json.loads((repo/'arpg/assets/sprites/manifest.json').read_text()); entry=next(e for e in manifest if e['id']=='dragon')
assert not info['preview']; assert info['geometry']['legs']==4 and info['geometry']['wings']==2 and info['geometry']['claws']==12
assert info['framing']['all_animation_samples']; assert 0<entry['anchor']['x']<1 and 0<entry['anchor']['y']<1
records={r['name']:r for r in info['frames']}; seen={}; groups={}; coverage=[]; boxes=[]; total=0
base=repo/'arpg/assets/sprites/dragon'; assert set(p.name for p in base.glob('*.json'))==set(entry['sheets']); assert not list(base.glob('*.png'))
for sheet in entry['sheets']:
 data=json.loads((base/sheet).read_text()); image=Image.open(base/data['meta']['image']).convert('RGBA'); assert max(image.size)<2048; total+=(base/sheet).stat().st_size+(base/data['meta']['image']).stat().st_size
 groups.update(data['animations'])
 for name,f in data['frames'].items():
  r=f['frame']; assert r['w']==r['h']==256; assert f['anchor']==entry['anchor']==records[name]['ground_anchor']; assert name not in seen
  crop=image.crop((r['x'],r['y'],r['x']+256,r['y']+256)); alpha=crop.getchannel('A'); raw=Image.open(root/'dragon'/(name+'.png')).convert('RGBA')
  assert alpha.tobytes()==raw.getchannel('A').tobytes(),(name,'alpha differs from rendered geometry')
  box=alpha.getbbox(); assert box and min(box[:2])>0 and max(box[2:])<256,(name,'clipped',box); boxes.append(box)
  p=records[name]['projected_bounds']; assert min(p)>0 and max(p)<1,(name,'geometry framing',p)
  cov=sum(alpha.point(lambda v:255 if v>=128 else 0).histogram()[128:])/65536; assert .025<cov<.65,(name,'unreadable coverage',cov); coverage.append(cov)
  seen[name]=hashlib.sha256(crop.tobytes()).hexdigest()
assert set(seen)==set(records); assert total==entry['bytes']<=1500000
for anim,n in cfg['frame_counts'].items():
 first=[]
 for direction in cfg['directions']:
  names=groups[anim+'_'+direction]; assert len(names)==n; assert len({seen[s] for s in names})>1,(anim,direction,'frozen clip'); first.append(seen[names[0]])
 assert len(set(first))==8,(anim,'duplicate directions')
# Preserve every non-dragon manifest entry exactly, as well as sim/content/render source.
before=json.loads(subprocess.check_output(['git','show','9103d1f:arpg/assets/sprites/manifest.json'],cwd=repo,text=True))
assert [e for e in before if e['id']!='dragon']==[e for e in manifest if e['id']!='dragon']
changes=subprocess.check_output(['git','diff','--name-only','9103d1f'],cwd=repo,text=True).splitlines(); assert not any(p.startswith('arpg/js/') for p in changes)
source=Path(subprocess.check_output(['wslpath','-u',cfg['source']],text=True).strip())/'original-copper-dragon.blend'; assert source.stat().st_size>10000
source_proof=json.loads((source.parent.parent/'source-validation.json').read_text()); assert source_proof['ok']; assert source_proof['idle_paw_world_drift']<1e-7; assert source_proof['imported_armatures']==0
(kit/'source-validation.json').write_text(json.dumps(source_proof,indent=2))
result={'ok':True,'geometry':info['geometry'],'frames':len(seen),'eight_directions':True,'all_clips_animate':True,'frame_size':256,'ground_anchor':entry['anchor'],'ground_anchor_constant':True,'idle_paw_world_drift':source_proof['idle_paw_world_drift'],'idle_paw_min_world_z':source_proof['idle_paw_min_world_z'],'all_animation_geometry_in_frame':True,'lossless_alpha_verified':len(seen),'clipped_frames':0,'coverage_range':[min(coverage),max(coverage)],'bytes':total,'non_dragon_manifest_unchanged':True,'js_unchanged':True,'source_blend_bytes':source.stat().st_size,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'screenshots':0}
(kit/'validation.json').write_text(json.dumps(result,indent=2)); print(json.dumps(result,indent=2))
