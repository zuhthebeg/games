"""Post-run evidence validation; no game directory reads/writes.
python3 validate.py /mnt/c/Users/user/ai-tools/arpg-art/p4-paperdoll
"""
import hashlib, json, sys
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1]).resolve();assert str(root)=='/mnt/c/Users/user/ai-tools/arpg-art/p4-paperdoll'
expected={'hero-sword':392,'hero-bow':392,'hero-focus':384};report=[];camera=None
for kit,count in expected.items():
 folder=root/'frames'/kit;info=json.loads((folder/'frames.json').read_text());assert len(info['frames'])==count
 assert len(info['layers'])==12
 assert set(r['animation'].split('_')[0] for r in info['frames'])=={'idle','run','attack','dodge','hit','death'}
 for anim in ['idle','run','attack','dodge','hit','death']:
  assert {r['animation'].split('_')[1] for r in info['frames'] if r['animation'].startswith(anim+'_')}=={'E','SE','S','SW','W','NW','N','NE'}
 if camera is None:camera=info['camera']
 assert camera==info['camera'],'per-kit camera mismatch'
 assert all(b['max_rest_matrix_error']<1e-4 and b['shared_joint_count']==41 for b in info['binding'])
 empty=clipped=0;motions={}
 for layer in info['layers']+['reference']:
  digests=[]
  for r in info['frames']:
   im=Image.open(folder/layer/(r['name']+'.png')).convert('RGBA');assert im.size==(128,128)
   box=im.getchannel('A').getbbox()
   if box is None:empty+=1
   elif box[0]==0 or box[1]==0 or box[2]==128 or box[3]==128:clipped+=1
   digests.append(hashlib.sha256(im.tobytes()).hexdigest())
  motions[layer]=len(set(digests));assert len(set(digests))>8,(kit,layer,'static')
 assert empty==0,(kit,'empty layer frames',empty)
 assert clipped==0,(kit,'clipped layer frames',clipped)
 report.append({'kit':kit,'frames':count,'layer_frames':count*13,'empty_frames':empty,'clipped_frames':clipped,'distinct_rgba_frames_per_layer':motions,'camera_identical':True,'binding':info['binding']})
# Source snapshot digest assertion survives a fresh git checkout because .gitattributes
# explicitly disables newline conversion for HTTP/license evidence.
evidence=Path(__file__).parent/'evidence';manifest=json.loads((evidence/'http-manifest.json').read_text())
for item in manifest['sources']:
 if 'sha256' in item:
  p=evidence/Path(item['path']).name;assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'],p
assert (evidence/'kaykit-bundled-license.txt').read_bytes()==(evidence/'kaykit-license-live.txt').read_bytes()
measurements=json.loads((root/'measurements.json').read_text());assert len(measurements)==3
benchmark=json.loads((root/'browser-benchmark.json').read_text());assert len(benchmark['results'])==6
for b in benchmark['results']:assert b['drawImageCalls']==392*6 and b['frames']==392
output={'status':'PASS','source_snapshot_hashes':'all verified','license_live_equals_bundled':True,'kits':report,'benchmark_cases':6,'scope':'experimental source partitions; NOT §8.3 alignment PASS'}
(root/'validation.json').write_text(json.dumps(output,indent=2));print(json.dumps(output,indent=2))
