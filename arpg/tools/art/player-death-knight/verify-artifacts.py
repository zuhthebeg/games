"""Read-only final new-candidate validator, including reference preservation.
python3 verify-artifacts.py OFFLINE_ROOT KIT_DIR PRESERVATION_JSON OUTPUT_JSON
"""
from pathlib import Path
from PIL import Image
import json,sys,hashlib,collections
root,kit,baseline,out=map(Path,sys.argv[1:5]);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protected=json.loads(baseline.read_text());bad=[]
for name,digest in protected.items():
 p=Path(name)
 if not p.is_file() or sha(p)!=digest:bad.append(name)
assert not bad,('protected originals changed',bad)
source=json.loads((root/'source-validation.json').read_text());assert source['status']=='PASS'
assert sha(root/'source/player-death-knight-source.blend')==source['source_blend_sha256']
info=json.loads((root/'frames/player-death-knight/frames.json').read_text());assert len(info['frames'])==source['frames_rechecked']==480
metrics=json.loads((root/'source-mask-stats.json').read_text());by={m['name']:m for m in metrics};groups=collections.defaultdict(list)
for r in info['frames']:
 n=r['name'];assert sha(root/'frames/player-death-knight'/(n+'.png'))==by[n]['source_png_sha256'];groups[r['animation']].append(n)
 assert r['pose']['skin_rms_from_bind_height']>.015
counts={'idle':13,'run':10,'attack':13,'hit':8,'death':10,'dodge':6}
for g,names in groups.items():assert len(names)==counts[g.rsplit('_',1)[0]]
assert len(groups)==48
for di in ['E','SE','S','SW','W','NW','N','NE']:
 dodge=[r for r in info['frames'] if r['animation']=='dodge_'+di];assert all(r['source']=='Dodge_Forward' for r in dodge)
 assert abs(dodge[0]['source_frame'])<.001 and abs(dodge[-1]['source_frame']-9.6)<.001
 assert len({by[r['name']]['rgba_sha256'] for r in dodge})==6
kitinfo=json.loads((kit/'kit-descriptor.json').read_text());assert kitinfo['registered'] is False and kitinfo['content_ids']==[]
merged={};frames={};gpu=0;webp=0
for filename in kitinfo['sheets']:
 data=json.loads((kit/filename).read_text());im=Image.open(kit/data['meta']['image']).convert('RGBA');gpu+=im.width*im.height*4;webp+=(kit/data['meta']['image']).stat().st_size
 assert data['meta']['scale']=='.5' and max(im.size)<=2048
 assert not set(merged).intersection(data['animations']);merged.update(data['animations'])
 for n,fr in data['frames'].items():
  assert n not in frames;frames[n]=fr;a=fr['frame'];b=fr['spriteSourceSize'];back=Image.new('RGBA',(128,128));back.paste(im.crop((a['x'],a['y'],a['x']+a['w'],a['y']+a['h'])),(b['x'],b['y']))
  assert hashlib.sha256(back.getchannel('A').tobytes()).hexdigest()==by[n]['physical_mask_sha256']
assert set(frames)==set(by) and gpu<=12*1024**2
assert merged=={g:sorted(n) for g,n in groups.items()}
fixture=Image.open(root/'fixture-attack_E_006.png').convert('RGBA');original=Image.open(root/'frames/player-death-knight/attack_E_006.png').convert('RGBA');assert fixture.tobytes()==original.tobytes()
report={'status':'PASS','protected_originals':{'files':len(protected),'sha256_exact':True},'source_sha256':source['source_blend_sha256'],'source_reopened':True,'source_rgba_fixture_exact':True,'frames':480,'groups':48,'counts_per_direction':counts,'dodge_endpoint_included_all_octants':True,'all_groups_nonstatic':True,'alpha_exact':480,'Object_assign_group_fragment_loss':False,'rgba_bytes':gpu,'rgba_mib':gpu/1024**2,'webp_bytes':webp,'delivery_bytes':sum(p.stat().st_size for p in kit.iterdir()),'registered':False,'visual_approval':False,'native_browser_or_gameplay_validation':False,'bindings':{str(p):sha(p) for p in sorted(kit.iterdir()) if p.is_file()}}
out.write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
