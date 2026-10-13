"""Verify byte-bound delivery, source alpha/pose, and centroid-aligned species silhouettes.
python3 arpg/tools/art/m2a/verify-delivery.py --repo .
"""
import argparse,sys,json,hashlib,runpy,itertools
from pathlib import Path
from PIL import Image,ImageChops
p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path('.'));args=p.parse_args()
repo=args.repo.resolve();base=repo/'arpg/assets/sprites';art=repo/'arpg/tools/art/m2a';raw=Path('/mnt/c/Users/user/ai-tools/arpg-art/m2a/frames')
verify=runpy.run_path(str(art.parent/'verify_atlases.py'))['verify_character']
manifest=json.loads((base/'manifest.json').read_text());results=[];hashes={};kits={}
for id in ['ghoul','ghost','bat']:
 entry=next(r for r in manifest if r['id']==id);result=verify(base,raw,entry);frames={};groups={};min_opaque=16384;min_full=16384
 for sheet in entry['sheets']:
  meta=json.loads((base/id/sheet).read_text());image=Image.open(base/id/meta['meta']['image']).convert('RGBA');groups.update(meta['animations'])
  for file in [sheet,meta['meta']['image']]:hashes[id+'/'+file]=hashlib.sha256((base/id/file).read_bytes()).hexdigest()
  for name,record in meta['frames'].items():
   r=record['frame'];alpha=image.crop((r['x'],r['y'],r['x']+128,r['y']+128)).getchannel('A');mask=alpha.point(lambda v:255 if v>=128 else 0)
   min_opaque=min(min_opaque,sum(alpha.histogram()[128:]));min_full=min(min_full,sum(alpha.histogram()[250:]))
   box=mask.getbbox();centered=Image.new('L',(256,256));centered.paste(mask,(round(128-(box[0]+box[2])/2),round(128-(box[1]+box[3])/2)))
   frames[name]=centered
 motion={}
 for clip,names in groups.items():
  unique=len({frames[name].tobytes() for name in names})
  assert unique>1,(id,clip,'static animated silhouette')
  motion[clip]={'frames':len(names),'unique_aligned_masks':unique}
 result.update({'min_opaque_pixels_alpha128':min_opaque,'min_opaque_pixels_alpha250':min_full,'animated_silhouettes':motion});results.append(result);kits[id]=(frames,groups,{int.from_bytes(m.convert('1').tobytes(),'big') for m in frames.values()})
pairs=[]
for a,b in itertools.combinations(kits,2):
 samples=[]
 for state in ['idle','run','attack','hit','death']:
  for direction in ['E','SE','S','SW','W','NW','N','NE']:
   aa=kits[a][1][state+'_'+direction];bb=kits[b][1][state+'_'+direction]
   for t in [0,.5,.999]:
    ma=kits[a][0][aa[min(len(aa)-1,int(t*len(aa)))]];mb=kits[b][0][bb[min(len(bb)-1,int(t*len(bb)))]]
    xor=sum(ImageChops.difference(ma,mb).histogram()[128:]);union=sum(ImageChops.lighter(ma,mb).histogram()[128:]);ratio=xor/union
    assert xor>0,(a,b,state,direction,t,'identical silhouette')
    samples.append({'state':state,'direction':direction,'phase':t,'xor_pixels':xor,'xor_over_union':ratio})
 assert not kits[a][2].intersection(kits[b][2]),(a,b,'identical silhouette across any delivered frames')
 all_min=min((ma^mb).bit_count() for ma in kits[a][2] for mb in kits[b][2])
 assert all_min>0
 pairs.append({'all_frame_min_xor_pixels':all_min,'unique_mask_pairs_checked':len(kits[a][2])*len(kits[b][2]),'all_frame_identical_masks':0,'ids':[a,b],'samples':len(samples),'min_xor_pixels':min(r['xor_pixels'] for r in samples),'min_xor_over_union':min(r['xor_over_union'] for r in samples),'identical_silhouettes':0})
proof={'ok':True,'total_frames':sum(r['frames'] for r in results),'results':results,'file_sha256':hashes,'silhouette_method':'alpha >=128, centroid aligned without scaling on 256px canvas, 5 states x 8 octants x 3 phases per species pair','silhouette_pairs':pairs,'empty_frames':0,'identical_silhouettes':0}
(art/'delivered-validation.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2))
