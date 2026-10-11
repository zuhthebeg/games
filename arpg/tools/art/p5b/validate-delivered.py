"""Offline/static delivered-asset contract and byte/hash gate; no screenshot."""
import hashlib,json,sys
from pathlib import Path
from PIL import Image
base=Path(sys.argv[1]);report=json.loads((base/'validation.json').read_text());assert report['status']=='PASS';assert len(report['kits'])==3
actual=0;budgets=[]
# A previous live output can belong to a different (larger) family during swaps.
prior_output=max(k['layoutRGBABytes'] for k in report['kits'])
for kit in report['kits']:
 folder=base/kit['kit'];m=json.loads((folder/'manifest.json').read_text());assert len(m['animations'])==48;assert len(m['frames']) in [384,392]
 assert set(m['animations'])=={a+'_'+d for a in ['idle','run','attack','dodge','hit','death'] for d in ['E','SE','S','SW','W','NW','N','NE']}
 assert kit['mismatchedFrames']==kit['worstPixels']==kit['cropped']==kit['tPoseFrames']==0
 actual+=(folder/'manifest.json').stat().st_size
 seen=set()
 for name,layer in m['layers'].items():
  p=folder/layer['image'];assert hashlib.sha256(p.read_bytes()).hexdigest()==layer['sha256'];actual+=p.stat().st_size if p.name not in seen else 0;seen.add(p.name)
  im=Image.open(p);assert list(im.size)==layer['size'];assert max(im.size)<=4096
  for frame in layer['frames']:
   if frame is None:continue
   x,y,w,h=layer['rects'][frame[0]];assert 0<=x<x+w<=im.width and 0<=y<y+h<=im.height
   ox,oy=frame[1:];assert 0<=ox<ox+w<=128 and 0<=oy<oy+h<=128
 kit_peak=0
 for h in ['none','knight','barbarian','mage']:
  for w in ['standard','alternate']:
   keys=['base','mask']+(['head-'+h] if h!='none' else [])+[f'weapon-{w}-{h}']
   source=sum(m['layers'][k]['size'][0]*m['layers'][k]['size'][1]*4 for k in keys)
   # Conservative CPU RGBA working bytes: selected decoded sources, two pixel
   # arrays, weapon tint canvas, current output+readback, and prior output.
   staging=sum(m['layers'][k]['size'][0]*m['layers'][k]['size'][1]*4 for k in ['base','mask',f'weapon-{w}-{h}'])
   output=m['layout']['size'][0]*m['layout']['size'][1]*4
   peak=source+staging+2*output+prior_output+128*128*8
   assert peak<=64*1024*1024,(kit['kit'],h,w,'CPU RGBA budget',peak)
   kit_peak=max(kit_peak,peak)
 budgets.append({'kit':kit['kit'],'accountedPeakCPUBytes':kit_peak,'uniqueSourcePages':len(seen),'sourceBytes':kit['sourceBytes']})
 assert kit['rawWorstPixels']<=4
assert actual==report['totalSourceBytes'];assert actual<=3_000_000,('source byte budget',actual)
print(json.dumps({'status':'PASS','totalSourceBytes':actual,'frameCombinations':sum(k['combinations'] for k in report['kits']),'cpuRGBABudgetMiB':64,'kits':budgets,'realPhone':False,'gpuMemoryMeasured':False}))
