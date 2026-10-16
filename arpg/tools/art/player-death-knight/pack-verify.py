"""New-directory-only unregistered pack; full groups remain on a single page.
python3 pack-verify.py OFFLINE_ROOT NEW_KIT_DIR [--pack]
RGBA128 physical, Pixi resolution .5 -> logical256. Lossless alpha proof.
"""
from pathlib import Path
from PIL import Image,ImageDraw
import sys,json,math,hashlib,collections
root=Path(sys.argv[1]);dest=Path(sys.argv[2]);pack='--pack' in sys.argv
f=root/'frames/player-death-knight';info=json.loads((f/'frames.json').read_text());records=info['frames'];groups=collections.defaultdict(list);images={};metrics=[];errors=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
for r in records:
 n=r['name'];im=Image.open(f/(n+'.png')).convert('RGBA');a=im.getchannel('A');b=a.getbbox();small=im.resize((128,128),Image.Resampling.LANCZOS);sa=small.getchannel('A');sb=sa.getbbox()
 cov=sum(a.histogram()[128:])/65536*100;sc=sum(sa.histogram()[128:])/16384*100
 if not b or min(b[:2])<=0 or max(b[2:])>=256:errors.append([n,'source alpha boundary',b])
 if not sb or min(sb[:2])<=0 or max(sb[2:])>=128:errors.append([n,'physical alpha boundary',sb])
 if not 5<=cov<=60 or not 5<=sc<=60:errors.append([n,'fullcanvas coverage 5..60',cov,sc])
 if r['contact']['blade_grip_error']>.0001:errors.append([n,'blade detached'])
 images[n]=small;groups[r['animation']].append(n)
 metrics.append({'name':n,'source_png_sha256':sha((f/(n+'.png')).read_bytes()),'rgba_sha256':sha(im.tobytes()),'source_mask_sha256':sha(a.tobytes()),'physical_mask_sha256':sha(sa.tobytes()),'coverage':cov,'physical_coverage':sc,'source_bbox':b,'physical_bbox':sb})
for g in groups:groups[g].sort()
preview=root/('preview-full' if pack else 'preview-checkpoint');preview.mkdir(exist_ok=True)
directions=['E','SE','S','SW','W','NW','N','NE'];states=['idle','run','attack','hit','death','dodge']
for size,name in [(128,'actual-size-128.png'),(256,'source-256.png')]:
 sheet=Image.new('RGB',(8*size,6*(size+22)),(23,27,34));draw=ImageDraw.Draw(sheet)
 for row,state in enumerate(states):
  for col,di in enumerate(directions):
   names=groups.get(state+'_'+di,[])
   if not names:continue
   n=names[0 if state=='idle' else len(names)//2];im=images[n] if size==128 else Image.open(f/(n+'.png')).convert('RGBA')
   sheet.paste(im,(col*size,row*(size+22)+22),im);draw.text((col*size+3,row*(size+22)+3),state+' '+di,fill='white')
 sheet.save(preview/name)
# Front / side / rear and complete attack + forward dodge phases at actual size.
selected=[n for g in ['idle_S','idle_E','idle_N','attack_S','attack_E','attack_N','dodge_S','dodge_E','dodge_N'] for n in groups.get(g,[])]
cols=13;phase=Image.new('RGB',(cols*128,math.ceil(len(selected)/cols)*150),(23,27,34));draw=ImageDraw.Draw(phase)
for i,n in enumerate(selected):
 x=i%cols*128;y=i//cols*150;phase.paste(images[n],(x,y+22),images[n]);draw.text((x+2,y+3),n,fill='white')
phase.save(preview/'front-side-back-attack-dodge-phases-128.png')
for di in ['S','E','N']:
 names=groups.get('attack_'+di,[])+groups.get('dodge_'+di,[])
 if names:
  seq=[]
  for n in names:
   canvas=Image.new('RGB',(256,280),(23,27,34));im=Image.open(f/(n+'.png')).convert('RGBA');canvas.paste(im,(0,24),im);ImageDraw.Draw(canvas).text((3,3),n,fill='white');seq.append(canvas)
  seq[0].save(preview/('attack-dodge-'+di+'.gif'),save_all=True,append_images=seq[1:],duration=84,loop=0)
fixture=root/'fixture-attack_E_006.png';fixture_exact=None
if fixture.exists():
 fixture_exact=Image.open(fixture).convert('RGBA').tobytes()==Image.open(f/'attack_E_006.png').convert('RGBA').tobytes()
 assert fixture_exact,'reopened source fixture differs'
report={'status':'FAIL' if errors else 'PASS','errors':errors,'frames':len(records),'groups':len(groups),'source_coverage_range':[min(m['coverage'] for m in metrics),max(m['coverage'] for m in metrics)],'physical_coverage_range':[min(m['physical_coverage'] for m in metrics),max(m['physical_coverage'] for m in metrics)],'fixture_rgba_exact':fixture_exact,'visual_approval':False}
(root/'source-mask-stats.json').write_text(json.dumps(metrics,indent=2));(root/'packing-validation.json').write_text(json.dumps(report,indent=2))
if not pack:print(json.dumps(report,indent=2));sys.exit(0 if not errors else 2)
assert not info['preview'] and not errors,errors
assert len(groups)==48 and all(groups[s+'_'+d] for s in states for d in directions)
by={m['name']:m for m in metrics}
for g,names in groups.items():assert len({by[n]['rgba_sha256'] for n in names})>1,('static',g)
for s in states:assert len({by[groups[s+'_'+d][0]]['rgba_sha256'] for d in directions})==8
assert not dest.exists(),'never overwrite a delivery';dest.mkdir(parents=True)
# Greedy shelves but page decision is transactional for an ENTIRE group.
# Object.assign(animations, sheet.animations) therefore never loses group fragments.
pages=[];page=[];x=y=rowh=0
for g,names in sorted(groups.items(),key=lambda kv:-max(by[n]['physical_bbox'][3]-by[n]['physical_bbox'][1] for n in kv[1])):
 saved=(x,y,rowh);trial=[]
 for n in sorted(names,key=lambda n:-(by[n]['physical_bbox'][3]-by[n]['physical_bbox'][1])):
  b=by[n]['physical_bbox'];crop=images[n].crop(b);w,h=crop.size
  if x+w+2>1024:x=0;y+=rowh;rowh=0
  trial.append((g,n,crop,b,x+1,y+1));x+=w+2;rowh=max(rowh,h+2)
 if y+rowh>2048:
  ox,oy,oh=saved;pages.append((page,math.ceil((oy+oh)/4)*4));page=[];x=y=rowh=0;trial=[]
  for n in sorted(names,key=lambda n:-(by[n]['physical_bbox'][3]-by[n]['physical_bbox'][1])):
   b=by[n]['physical_bbox'];crop=images[n].crop(b);w,h=crop.size
   if x+w+2>1024:x=0;y+=rowh;rowh=0
   trial.append((g,n,crop,b,x+1,y+1));x+=w+2;rowh=max(rowh,h+2)
  assert y+rowh<=2048
 page.extend(trial)
if page:pages.append((page,math.ceil((y+rowh)/4)*4))
archive=root/'atlases';archive.mkdir(exist_ok=True);sheets=[];gpu=0;webp=0;owners={};merged={};alpha_checks=0
for i,(items,h) in enumerate(pages):
 sheet=Image.new('RGBA',(1024,h));frames={};anims=collections.defaultdict(list)
 for g,n,crop,b,x,y in items:
  sheet.paste(crop,(x,y));frames[n]={'frame':{'x':x,'y':y,'w':crop.width,'h':crop.height},'rotated':False,'trimmed':True,'spriteSourceSize':{'x':b[0],'y':b[1],'w':crop.width,'h':crop.height},'sourceSize':{'w':128,'h':128},'anchor':info['anchor']};anims[g].append(n)
 for g in anims:
  anims[g].sort();assert g not in owners;owners[g]=i;assert anims[g]==groups[g]
 merged.update(anims)
 stem='atlas-'+str(i);sheet.save(archive/(stem+'.png'));sheet.save(dest/(stem+'.webp'),quality=78,method=6,alpha_quality=100)
 decoded=Image.open(dest/(stem+'.webp')).convert('RGBA');assert decoded.getchannel('A').tobytes()==sheet.getchannel('A').tobytes()
 for g,n,crop,b,x,y in items:
  back=Image.new('RGBA',(128,128));back.paste(decoded.crop((x,y,x+crop.width,y+crop.height)),(b[0],b[1]));assert sha(back.getchannel('A').tobytes())==by[n]['physical_mask_sha256'];alpha_checks+=1
 data={'frames':frames,'animations':dict(anims),'meta':{'app':'Project original DeathKnight geometry / KayKit CC0 skeletal base','version':'1','image':stem+'.webp','format':'RGBA8888','size':{'w':1024,'h':h},'scale':'.5','fps':info['fps']}}
 filename=stem+'.webp.json';(dest/filename).write_text(json.dumps(data,separators=(',',':')));sheets.append(filename);gpu+=1024*h*4;webp+=(dest/(stem+'.webp')).stat().st_size
assert merged==dict(groups) and gpu<=12*1024**2
contract={'source':'Dodge_Forward','source_seconds':.4,'source_frames':[0,1.92,3.84,5.76,7.68,9.6],'sample_count':6,'presentation_seconds':.2,'loop':False,'endpoint_included':True,'phase':'atlasFrame duration .2 maps 6 frames; final source endpoint at age >= 1/6s','root_translation':'horizontal root/hips constant drivers; simulation owns travel','not_run_alias':True,'registration_pending':True}
kit={'id':'player-death-knight','label':'Original DeathKnight — unregistered candidate','registered':False,'content_ids':[],'sheets':sheets,'animations':states,'fps':info['fps'],'animation_durations':{'dodge':.2,'hit':.15,'death':.6},'anchor':info['anchor'],'logical_frame_size':256,'physical_frame_size':128,'meta_scale':'.5','pixi_texture_resolution':.5,'logical_expansion':2,'dodge_contract':contract,'parent_visual_review_required':True}
(dest/'kit-descriptor.json').write_text(json.dumps(kit,indent=2));total=sum(p.stat().st_size for p in dest.iterdir())
report.update(status='PASS',nonstatic_groups=48,unique_octants_each_state=8,sheets=[[1024,h] for _,h in pages],rgba_bytes=gpu,rgba_mib=gpu/1024**2,soft_8mib_met=gpu<=8*1024**2,hard_12mib_met=True,webp_bytes=webp,total_delivery_bytes=total,frame_alpha_exact=alpha_checks,group_owner_page=owners,Object_assign_complete_group_merge=True)
(root/'packing-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
