"""New-directory-only packer. Keeps full RGBA/masks offline; no shared manifest writes.
python3 pack-verify.py OFFLINE_ROOT NEW_KIT_DIR --checkpoint | --pack
Physical128 pixels -> Pixi meta.scale .5 -> logical256. This is expansion2,
NOT TextureSource.resolution2: actual existing Pixi parser sets resolution=.5.
"""
from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib,math,sys,collections
root=Path(sys.argv[1]);dest=Path(sys.argv[2]);pack='--pack' in sys.argv
f=root/'frames/player-skeleton-archer';info=json.loads((f/'frames.json').read_text());records=info['frames'];preview=root/'preview';preview.mkdir(exist_ok=True)
def sha(b):return hashlib.sha256(b).hexdigest()
images={};metrics=[];errors=[]
for r in records:
 im=Image.open(f/(r['name']+'.png')).convert('RGBA');a=im.getchannel('A');b=a.getbbox(); opaque=sum(a.histogram()[128:]);cov=opaque/65536*100
 if not b or b[0]<=0 or b[1]<=0 or b[2]>=256 or b[3]>=256:errors.append([r['name'],'source clipped/empty',b])
 if cov<5 or cov>60:errors.append([r['name'],'UNCHANGED source 5..60 opaque percent',cov])
 p=r['pose']
 if max(p['arm_degrees_from_bind'])<=10 or p['skin_rms_from_bind_height']<=.015:errors.append([r['name'],'source frozen/bind'])
 contact=r.get('contact')
 if contact and not contact['released']:
  for k in ['bow_grip_error','string_right_error','nock_right_error']:
   if contact[k]>.015:errors.append([r['name'],k,contact[k]])
 small=im.resize((128,128),Image.Resampling.LANCZOS); sa=small.getchannel('A'); sb=sa.getbbox();sc=sum(sa.histogram()[128:])/16384*100
 # Coverage is measured relative to ORIGINAL full canvas, never trimmed area.
 if pack and not 5<=sc<=60:errors.append([r['name'],'physical coverage 5..60',sc])
 if pack and (not sb or sb[0]<=0 or sb[1]<=0 or sb[2]>=128 or sb[3]>=128):errors.append([r['name'],'physical any-alpha clipped',sb])
 images[r['name']]=small
 metrics.append({'name':r['name'],'source_png_sha256':sha((f/(r['name']+'.png')).read_bytes()),'source_rgba_sha256':sha(im.tobytes()),'source_mask_sha256':sha(a.tobytes()),'source_opaque_pixels':opaque,'logical_source_area':65536,'source_opaque_percent':cov,'source_bbox':b,'physical_rgba_sha256':sha(small.tobytes()),'physical_mask_sha256':sha(sa.tobytes()),'physical_opaque_percent':sc,'physical_bbox':sb,'pose':p,'contact':contact})
groups=collections.defaultdict(list)
for r in records:groups[r['animation']].append(r['name'])
# Source checkpoint honest independent metrics, not success if failed.
report={'status':'PASS' if not errors else 'FAIL','mode':'full source + packing' if pack else 'source checkpoint','errors':errors,'frames':len(records),'anchor':info['anchor'],'source_coverage_range':[min(m['source_opaque_percent'] for m in metrics),max(m['source_opaque_percent'] for m in metrics)],'physical_coverage_range':[min(m['physical_opaque_percent'] for m in metrics),max(m['physical_opaque_percent'] for m in metrics)],'source_gate_percent':[5,60],'source_original_canvas':[256,256],'physical_canvas':[128,128],'logical_to_physical':.5,'inverse_expand':2,'pixi_actual_texture_source_resolution':.5,'pixi_meta_scale':'.5','gpu_bytes_not_compressed_bytes':True}
(root/'source-mask-stats.json').write_text(json.dumps(metrics,indent=2));(root/'packing-validation.json').write_text(json.dumps(report,indent=2))
# Review previews do not alter original source.
dirs=['E','SE','S','SW','W','NW','N','NE'];states=['idle','run','attack','hit','death','dodge']
contact=Image.new('RGB',(8*180,6*204),(23,27,34));draw=ImageDraw.Draw(contact)
for row,state in enumerate(states):
 for col,di in enumerate(dirs):
  names=groups[state+'_'+di]
  if not names:continue
  idx= min(len(names)-1, len(names)//2 if state!='idle' else 0)
  im=Image.open(f/(names[idx]+'.png')).convert('RGBA').resize((180,180))
  draw.text((col*180+4,row*204+4),f'{state} {di}',fill='white');contact.paste(im,(col*180,row*204+24),im)
contact.save(preview/'contact-sheet.png')
game=Image.new('RGB',(8*128,6*152),(23,27,34));draw=ImageDraw.Draw(game)
for row,state in enumerate(states):
 for col,di in enumerate(dirs):
  names=groups[state+'_'+di]
  if not names:continue
  n=names[len(names)//2 if state!='idle' else 0];im=images[n];game.paste(im,(col*128,row*152+24),im);draw.text((col*128+4,row*152+4),f'{state} {di}',fill='white')
game.save(preview/'game-size.png')
phase_names=[]
for idx in [2,6,7,8]:
 n=f'attack_E_{idx:03d}'
 if n in images:phase_names.append(n)
ph=Image.new('RGB',(len(phase_names)*256,280),(23,27,34));dr=ImageDraw.Draw(ph)
for col,n in enumerate(phase_names):
 im=Image.open(f/(n+'.png')).convert('RGBA');ph.paste(im,(col*256,24),im);dr.text((col*256+4,4),n,fill='white')
ph.save(preview/'arrow-release-four-frames.png')
(preview/'preview-meta.json').write_text(json.dumps({'agent_review_required':True,'user_approval':False,'contact':'original source256 resized180','game':'physical128, fullcanvas; gameplay placement NOT integrated','attack_phase_records':[r for r in records if r['name'] in phase_names],'dodge':{'source':'Dodge_Backward','original_range':[0,9.600000381469727],'source_seconds':.4,'loop':False,'root_translation':'suppressed horizontal root/hips only, actual skeletal lean/limb motion retained','integration':'unregistered proposal: map dodge state explicitly, never idle; simulation owns translation; no runtime edits','duration_binding':'future caller must map normalized dodge progress across .4s source; current combat duration not changed'},'anchor':info['anchor']},indent=2))
if not pack:print(json.dumps(report,indent=2));sys.exit(0 if not errors else 2)
assert not info['preview'],'checkpoint cannot pack';assert not errors,errors
assert len(groups)==48 and all(groups[state+'_'+di] for state in states for di in dirs)
for state in states:
 assert len({next(m['source_rgba_sha256'] for m in metrics if m['name']==groups[state+'_'+di][0]) for di in dirs})==8,state
for group,names in groups.items():assert len({next(m['source_rgba_sha256'] for m in metrics if m['name']==n) for n in names})>1,('static',group)
assert not dest.exists(), 'Never overwrite existing delivery'
dest.mkdir(parents=True);archive=root/'atlases';archive.mkdir(exist_ok=True)
# Shelf packing alpha-trims with 1px gutter, fixed1024 width and max2048 height.
pages=[];page=[];x=y=rowh=0
for r in records:
 n=r['name'];im=images[n];b=im.getchannel('A').getbbox();crop=im.crop(b);cw,ch=crop.size
 if x+cw+2>1024:x=0;y+=rowh;rowh=0
 if y+ch+2>2048:pages.append((page,math.ceil((y+rowh)/4)*4));page=[];x=y=rowh=0
 page.append((r,crop,b,x+1,y+1));x+=cw+2;rowh=max(rowh,ch+2)
if page:pages.append((page,math.ceil((y+rowh)/4)*4))
sheets=[];gpu=0;webp=0;decoded_stats=[]
for i,(page,height) in enumerate(pages):
 sheet=Image.new('RGBA',(1024,height));frames={};anims=collections.defaultdict(list)
 for r,im,b,x,y in page:
  n=r['name'];sheet.paste(im,(x,y));frames[n]={'frame':{'x':x,'y':y,'w':im.width,'h':im.height},'rotated':False,'trimmed':True,'spriteSourceSize':{'x':b[0],'y':b[1],'w':im.width,'h':im.height},'sourceSize':{'w':128,'h':128},'anchor':info['anchor']};anims[r['animation']].append(n)
 name=f'atlas-{i}';sheet.save(archive/(name+'.png'));sheet.save(dest/(name+'.webp'),quality=78,method=6,alpha_quality=100)
 decoded=Image.open(dest/(name+'.webp')).convert('RGBA');assert decoded.getchannel('A').tobytes()==sheet.getchannel('A').tobytes()
 data={'frames':frames,'animations':dict(anims),'meta':{'app':'Independent CC0 skeleton archer source','version':'1','image':name+'.webp','format':'RGBA8888','size':{'w':1024,'h':height},'scale':'.5','fps':info['fps']}}
 (dest/(name+'.webp.json')).write_text(json.dumps(data,separators=(',',':')));sheets.append(name+'.webp.json');gpu+=1024*height*4;webp+=(dest/(name+'.webp')).stat().st_size
 for r,im,b,x,y in page:
  n=r['name'];back=Image.new('RGBA',(128,128));dc=decoded.crop((x,y,x+im.width,y+im.height));back.paste(dc,(b[0],b[1]));assert back.getchannel('A').tobytes()==images[n].getchannel('A').tobytes();decoded_stats.append({'name':n,'delivered_reconstructed_mask_sha256':sha(back.getchannel('A').tobytes()),'physical_source_mask_sha256':sha(images[n].getchannel('A').tobytes()),'alpha_exact':True})
assert gpu<=12*1024**2,('hard GPU limit',gpu)
kit={'id':'player-skeleton-archer','label':'해골 궁수 — 미등록 후보','registered':False,'content_ids':[],'sheets':sheets,'animations':states,'fps':info['fps'],'anchor':info['anchor'],'logical_frame_size':256,'physical_frame_size':128,'meta_scale':'.5','pixi_texture_resolution':.5,'logical_expansion':2,'dodge_contract':json.loads((preview/'preview-meta.json').read_text())['dodge'],'source_gate_unchanged':True,'parent_visual_review_required':True}
(dest/'kit-descriptor.json').write_text(json.dumps(kit,ensure_ascii=False,indent=2))
report.update({'status':'PASS','groups':48,'unique_octants_each_state':8,'nonstatic_groups':48,'sheets':[[1024,h] for _,h in pages],'capacity_allocated_pixels':sum(1024*h for _,h in pages),'rgba_bytes':gpu,'rgba_mib':gpu/1024**2,'target_8mib_met':gpu<=8*1024**2,'hard_12mib_met':True,'webp_bytes':webp,'frame_alpha_exact':len(decoded_stats),'native_player_integration':False})
(root/'packing-validation.json').write_text(json.dumps(report,indent=2));(root/'delivered-mask-stats.json').write_text(json.dumps(decoded_stats,indent=2));print(json.dumps(report,indent=2))
