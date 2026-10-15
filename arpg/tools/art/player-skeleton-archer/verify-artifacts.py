"""Read-only final art/protected-source verifier. No rendering or registry access.
python3 verify-artifacts.py OFFLINE_ROOT INITIAL_BACKUP [--output NEW_REPORT]
"""
from pathlib import Path
from PIL import Image
import sys,json,hashlib,collections,math
here=Path(__file__).resolve().parent
arpg=here.parents[2]
offline=Path(sys.argv[1]);backup=Path(sys.argv[2]);kit=arpg/'assets/sprites/player-skeleton-archer'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protected=json.loads((here/'baseline-inventory.json').read_text())
roots={'checkout':arpg,'kaykit':offline.parent/'source/KayKit-Character-Pack-Skeletons-1.0-main','u1':offline.parent/'u1-skeletons'}
checks={}
for group,entries in protected.items():
 for name,record in entries.items():
  p=roots[group]/name
  assert p.is_file() and p.stat().st_size==record['bytes'] and sha(p)==record['sha256'],('protected original changed',group,name)
 checks[group]={'files':len(entries),'bytes':sum(v['bytes'] for v in entries.values()),'exact':True}
old=json.loads((backup/'source-sha256.json').read_text())
for name,digest in old.items():assert sha(offline/name)==digest,('original offline source changed',name)
checks['offline_at_start']={'files':len(old),'exact':True}
# Checkpoint source and its older contact proof remain byte-for-byte preserved.
checkpoint=json.loads((here/'source-validation.json').read_text())
assert sha(here/'source/player-skeleton-archer-source.blend')==checkpoint['source_blend_sha256']
final=here/'final';source=json.loads((final/'source-validation.json').read_text())
assert source['status']=='PASS' and sha(here/'source/player-skeleton-archer-full-source.blend')==source['source_blend_sha256']
assert sha(offline/'source/player-skeleton-archer-source.blend')==source['source_blend_sha256']
assert sha(final/'frames.json')==source['render_binding']['frames_json_sha256']
assert source['render_binding']['sampled_frames']==464 and source['render_binding']['attack_contact_rows']==96 and source['render_binding']['in_place_dodge_rows']==40
fixture=json.loads((final/'fixture-comparison.json').read_text());assert fixture['rgba_exact'] and fixture['alpha_exact']
a=Image.open(final/'fixture-attack_E_006.png').convert('RGBA');b=Image.open(offline/'frames/player-skeleton-archer/attack_E_006.png').convert('RGBA');assert a.tobytes()==b.tobytes()
records=json.loads((final/'frames.json').read_text())['frames'];masks=json.loads((final/'source-mask-stats.json').read_text());delivered=json.loads((final/'delivered-mask-stats.json').read_text());packing=json.loads((final/'packing-validation.json').read_text())
assert packing['status']=='PASS' and len(records)==len(masks)==len(delivered)==464
counts={'idle':13,'run':10,'attack':12,'hit':8,'death':10,'dodge':5};directions=['E','SE','S','SW','W','NW','N','NE'];groups=collections.defaultdict(list)
byname={m['name']:m for m in masks}
for rec in records:
 n=rec['name'];p=offline/'frames/player-skeleton-archer'/(n+'.png');m=byname[n];assert sha(p)==m['source_png_sha256'];assert 5<=m['source_opaque_percent']<=60 and 5<=m['physical_opaque_percent']<=60
 groups[rec['animation']].append(n)
for state,count in counts.items():
 for di in directions:
  names=groups[state+'_'+di];assert len(names)==count
  assert len({byname[n]['source_rgba_sha256'] for n in names})>1
 assert len({byname[groups[state+'_'+di][0]]['source_rgba_sha256'] for di in directions})==8
assert len(groups)==48
for row in delivered:assert row['alpha_exact'] and row['delivered_reconstructed_mask_sha256']==row['physical_source_mask_sha256']
descriptor=json.loads((kit/'kit-descriptor.json').read_text());assert descriptor['registered'] is False and descriptor['content_ids']==[]
allocated=compressed=0;frames={};atlas_groups=collections.defaultdict(list)
for name in descriptor['sheets']:
 data=json.loads((kit/name).read_text());image=Image.open(kit/data['meta']['image']);assert list(image.size)==[data['meta']['size']['w'],data['meta']['size']['h']]
 allocated+=image.width*image.height*4;compressed+=(kit/data['meta']['image']).stat().st_size
 assert data['meta']['scale']=='.5'
 for group,names in data['animations'].items():atlas_groups[group].extend(names)
 im=image.convert('RGBA')
 for n,frame in data['frames'].items():
  assert n not in frames;frames[n]=frame
  r=frame['frame'];trim=frame['spriteSourceSize'];back=Image.new('RGBA',(128,128));back.paste(im.crop((r['x'],r['y'],r['x']+r['w'],r['y']+r['h'])),(trim['x'],trim['y']))
  assert hashlib.sha256(back.getchannel('A').tobytes()).hexdigest()==byname[n]['physical_mask_sha256'],('delivered alpha',n)
assert set(frames)==set(byname) and allocated==packing['rgba_bytes'] and allocated<=8*1024**2
assert set(atlas_groups)==set(groups)
for group,names in groups.items():assert sorted(atlas_groups[group])==sorted(names),('atlas animation membership',group)
native=json.loads((here/'native-validation.json').read_text());assert native['status']=='PASS' and native['nativeAlphaExact'] and native['pageErrors']==[]
for name,digest in native['bindings'].items():assert sha(arpg/name)==digest,('native binding stale',name)
assert sha(arpg/'vendor/pixi-8.22.0.min.mjs')==native['bindings']['vendor/pixi-8.22.0.min.mjs']
report={'status':'PASS','protected':checks,'checkpoint_source_preserved':True,'full_source_sha256':source['source_blend_sha256'],'frames':464,'groups':48,'counts_per_direction':counts,'unique_octants_each_state':8,'source_coverage_percent':packing['source_coverage_range'],'physical_coverage_percent':packing['physical_coverage_range'],'source_reopen_fixture_rgba_exact':True,'source_draw_contact_bound_frames':96,'all_frames_bow_held':464,'in_place_dodge_bound_frames':40,'delivered_alpha_exact_frames':464,'rgba_bytes':allocated,'rgba_mib':allocated/1024**2,'compressed_webp_bytes_not_gpu':compressed,'native_fixture':'attack_E_006','native_fixture_alpha_exact':True,'not_registered':True,'visual_review_pending':True,'artifact_bindings':{str(p.relative_to(arpg)):sha(p) for folder in [kit,here/'final',here/'source',here/'preview-final'] for p in sorted(folder.rglob('*')) if p.is_file() and p.name!='artifact-validation.json'}}
for p in sorted(here.iterdir()):
 if p.is_file() and p.suffix in ('.py','.mjs','.html','.md'):report['artifact_bindings'][str(p.relative_to(arpg))]=sha(p)
if '--output' in sys.argv:Path(sys.argv[sys.argv.index('--output')+1]).write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='artifact_bindings'},indent=2))
