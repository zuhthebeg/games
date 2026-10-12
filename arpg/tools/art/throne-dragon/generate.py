"""Original copper western dragon. No imports/models; object-keyed procedural animation.
Blender --background --factory-startup --python generate.py -- config.json [--preview]
"""
import bpy, math, json, sys, time
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
cfg=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text()); preview='--preview' in sys.argv
root=Path(cfg['source']); root.mkdir(parents=True,exist_ok=True)
out=Path(cfg['output'])/cfg['characters'][0]['name']; out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,c):
 m=bpy.data.materials.new(name); m.diffuse_color=(*c,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*c,1); p.inputs['Roughness'].default_value=.8
 return m
copper=mat('Copper scales',(0.42,.045,.012)); ridge=mat('Scarlet dorsal scales',(.65,.12,.025)); ivory=mat('Ivory belly horns claws',(.85,.70,.45)); membrane=mat('Golden burnt orange membrane',(.27,.070,.018)); dark=mat('Mouth nostrils',(.06,.022,.018)); eye=mat('Amber eyes',(1,.75,.04))
def group(name):
 o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); return o
body=group('Grounded torso'); neck=group('Arched neck and reptilian head'); neck.parent=body
wings=[]; legs=[]; tail=group('Long curved tapering tail'); tail.parent=body
meshes=[]
def ell(name,p,s,m,parent=body):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=1,location=p); o=bpy.context.object; o.name=name; o.scale=s; o.data.materials.append(m); o.parent=parent; meshes.append(o); return o
def cone(name,a,b,r1,r2,m,parent=body):
 a,b=Vector(a),Vector(b); d=b-a
 bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=r1,radius2=r2,depth=d.length,location=(a+b)/2); o=bpy.context.object; o.name=name; o.rotation_euler=d.to_track_quat('Z','Y').to_euler(); o.data.materials.append(m); o.parent=parent; meshes.append(o); return o
ell('Horizontal ribcage',(0,.15,1.08),(.53,.9,.53),copper)
ell('Ivory chest underside',(0,-.28,.87),(.39,.65,.35),ivory)
ell('Strong rear haunch torso',(0,.75,.95),(.5,.48,.43),copper)
# Four separately articulated legs, bent at elbows/hocks; three ivory claws each.
for y,label in [(-.5,'Fore'),(.73,'Hind')]:
 for side in [-1,1]:
  g=group(f'{label} leg {side}'); legs.append(g)
  x=side*.43
  a=(x,y,1.05); b=(side*.68,y+.12,.56); c=(side*.64,y-.10,.17)
  ell(label+' shoulder',a,(.24,.28,.31),copper,g); cone(label+' upper',a,b,.23,.16,copper,g); ell(label+' joint',b,(.17,.18,.17),ridge,g); cone(label+' shank',b,c,.14,.10,copper,g)
  ell(label+' grounded paw',(side*.64,y-.21,.10),(.20,.29,.105),copper,g)
  for k in [-1,0,1]: cone(label+' claw',(side*.64+k*.115,y-.39,.095),(side*.64+k*.115,y-.57,.045),.058,.003,ivory,g)
# Long rising S-arched neck with plated ventral segments.
points=[(0,-.51,1.20),(0,-.87,1.46),(0,-1.10,1.87),(0,-1.17,2.22),(0,-1.48,2.37)]
for i,(a,b) in enumerate(zip(points,points[1:])):
 cone('Neck scale segment '+str(i),a,b,.30-i*.027,.27-i*.027,copper,neck)
 ell('Neck ivory plate '+str(i),(0,(a[1]+b[1])/2-.15,(a[2]+b[2])/2),(.18,.14,.20),ivory,neck)
ell('Elongated reptilian skull',(0,-1.64,2.36),(.27,.40,.22),copper,neck)
ell('Long angular snout',(0,-1.98,2.29),(.23,.37,.14),ridge,neck)
ell('Ivory lower jaw',(0,-1.97,2.18),(.21,.31,.065),ivory,neck)
for s in [-1,1]:
 ell('Amber eye',(s*.247,-1.70,2.42),(.032,.079,.054),eye,neck); ell('Slit pupil',(s*.274,-1.72,2.42),(.008,.020,.043),dark,neck)
 ell('Nostril',(s*.12,-2.27,2.32),(.036,.022,.018),dark,neck)
 cone('Swept horn base',(s*.20,-1.48,2.49),(s*.31,-1.16,2.79),.10,.055,ivory,neck); cone('Swept horn tip',(s*.31,-1.16,2.79),(s*.34,-.98,2.87),.055,0,ivory,neck)
 cone('Cheek horn',(s*.24,-1.47,2.27),(s*.39,-1.22,2.36),.06,0,ivory,neck)
# Sweeping long tail distinct from feet.
tp=[(0,.95,.96),(.12,1.43,.84),(.35,1.96,.62),(.66,2.42,.40),(.95,2.78,.31),(1.10,3.14,.40),(1.04,3.46,.53)]
for i,(a,b) in enumerate(zip(tp,tp[1:])): cone('Tapering tail '+str(i),a,b,.27*(1-i/6),.27*(1-(i+1)/6)+.008,copper,tail)
for i in range(6):
 y=-.35+i*.27; cone('Dorsal spine '+str(i),(0,y,1.56),(0,y+.11,1.90-i*.025),.095,0,ivory)
for i,p in enumerate(tp[1:-1]): cone('Tail spine '+str(i),p,(p[0],p[1]+.08,p[2]+.19-i*.022),.055,0,ivory,tail)
# Two expansive BAT membranes, four finger rays, scalloped trailing edge.
for s in [-1,1]:
 g=group('Membranous wing '+str(s)); g.parent=body; wings.append(g)
 shoulder=(s*.37,-.10,1.43); elbow=(s*.86,.02,2.03); wrist=(s*1.42,-.32,2.50)
 cone('Wing upper arm',shoulder,elbow,.12,.085,copper,g); cone('Wing leading edge',elbow,wrist,.085,.06,ridge,g)
 tips=[(s*2.66,-.62,2.32),(s*2.70,.30,1.95),(s*2.28,1.18,1.59),(s*1.40,1.50,1.34)]
 edge=[tips[0],(s*2.29,-.02,1.95),tips[1],(s*2.10,.62,1.65),tips[2],(s*1.47,1.03,1.39),tips[3],(s*.54,.72,1.29)]
 verts=[wrist]+edge; faces=[(0,i,i+1) for i in range(1,len(verts)-1)]; me=bpy.data.meshes.new('Scalloped membrane'); me.from_pydata(verts,[],faces); me.update(); o=bpy.data.objects.new('Wide wing membrane '+str(s),me); bpy.context.collection.objects.link(o); o.parent=g; o.data.materials.append(membrane); meshes.append(o)
 for i,t in enumerate(tips): cone('Wing finger '+str(i),wrist,t,.045,.012,ivory if i==0 else ridge,g)
 cone('Wing thumb claw',wrist,(s*1.48,-.54,2.70),.055,0,ivory,g)
scene=bpy.context.scene; scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=scene.render.resolution_y=cfg['frame_size']; scene.render.resolution_percentage=100; scene.render.film_transparent=True; scene.render.image_settings.file_format='PNG'; scene.render.fps=cfg['fps']; scene.world.color=(.45,.45,.45)
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'
for name,p,energy,size in [('Warm key',(-3,-4,7),700,5),('Cool fill',(4,-1,4),350,4),('Rim',(0,5,6),650,3)]:
 d=bpy.data.lights.new(name,'AREA'); d.energy=energy; d.shape='DISK'; d.size=size; o=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(o); o.location=p; o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Fixed isometric camera'); camera=bpy.data.objects.new('Fixed isometric camera',d); bpy.context.collection.objects.link(camera); scene.camera=camera; d.type='ORTHO'; target=Vector((0,.50,1.25)); camera.location=target+Vector((0,-10*math.cos(math.radians(40)),10*math.sin(math.radians(40)))); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
rootg=group('Direction root')
for o in [body,*legs]: o.parent=rootg
counts=cfg['frame_counts']
def pose(anim,t,angle):
 rootg.rotation_euler=(0,0,math.radians(angle)); body.location=(0,0,0); body.rotation_euler=(0,0,0); body.scale=(1,1,1); neck.rotation_euler=(0,0,0); tail.rotation_euler=(0,0,0)
 for g in legs: g.rotation_euler=(0,0,0); g.location=(0,0,0)
 wave=math.sin(t*math.tau)
 if anim=='idle': body.scale.z=1+.018*wave; neck.rotation_euler.x=.015*wave
 if anim=='run':
  body.location.z=.025*math.cos(t*math.tau*2)
  for i,g in enumerate(legs): g.rotation_euler.x=.16*math.sin(t*math.tau+(i%3)*math.pi); g.location.z=max(0,.065*math.sin(t*math.tau+(i%3)*math.pi))
 if anim=='hit': body.rotation_euler.x=-.12*math.sin(t*math.pi); neck.rotation_euler.x=-.18*math.sin(t*math.pi)
 # Twelve phase-authored samples: 0..5 windup, 6 lock, 7..8 active, 9..11 recovery.
 frame=round(t*11); cue=min(1,frame/6); recover=max(0,(frame-8)/3)
 if anim=='breath':
  neck.rotation_euler.x=-.18*cue if frame<=6 else .32*(1-recover)
  body.scale.z=1+.07*cue if frame<=6 else 1+.03*(1-recover)
 if anim=='stomp':
  lift=.65*cue if frame<=6 else 0
  for g in legs[:2]: g.location.z=lift; g.rotation_euler.x=-.10*cue if frame<=6 else 0
  body.location.z=.17*cue if frame<=6 else -.06*(1-recover)
  neck.rotation_euler.x=.09*cue
 if anim=='tail':
  sweep=.52*cue if frame<=6 else (-.85 if frame==7 else .75)*(1-recover)
  tail.rotation_euler.z=sweep; body.rotation_euler.z=sweep*.12
 if anim=='death':
  body.location.z=-.62*t; body.rotation_euler.y=.65*t; neck.rotation_euler.x=.34*t
  for g in legs: g.location.z=body.location.z; g.rotation_euler.y=body.rotation_euler.y
 if anim!='tail': tail.rotation_euler.z=.07*wave
 for i,g in enumerate(wings): g.rotation_euler.y=(-1 if i==0 else 1)*(.035*wave + (.25*t if anim=='death' else 0))
 bpy.context.view_layer.update()
def vertices(): return [o.matrix_world@v.co for o in meshes for v in o.data.vertices]
# Fit ALL animation frames / ALL directions once; never recenter per frame.
right=camera.rotation_euler.to_matrix()@Vector((1,0,0)); up=camera.rotation_euler.to_matrix()@Vector((0,1,0)); xs=[]; ys=[]
for anim,n in counts.items():
 for angle in cfg['directions'].values():
  for i in range(n):
   pose(anim,i/max(1,n-1),angle)
   for v in vertices(): xs.append(v.dot(right)); ys.append(v.dot(up))
center=right*((min(xs)+max(xs))/2)+up*((min(ys)+max(ys))/2); delta=center-target; camera.location+=delta; target+=delta; d.ortho_scale=max(max(xs)-min(xs),max(ys)-min(ys))*1.12
bpy.context.view_layer.update(); origin=world_to_camera_view(scene,camera,Vector((0,0,0))); anchor={'x':origin.x,'y':1-origin.y}
# Store real object-keyframe clips in .blend, not just sampled PNG animation.
for ai,(anim,n) in enumerate(counts.items()):
 start=ai*30+1
 for i in range(n):
  pose(anim,i/max(1,n-1),0)
  for o in [body,neck,tail,*legs,*wings]:
   for prop in ['location','rotation_euler','scale']: o.keyframe_insert(data_path=prop,frame=start+i)
 scene.timeline_markers.new(anim,frame=start)
# Sampling sets transforms directly; remove evaluation dependency but retain source keys.
bpy.ops.wm.save_as_mainfile(filepath=str(root/'original-copper-dragon.blend'))
for o in [body,neck,tail,*legs,*wings]: o.animation_data_clear()
records=[]; begin=time.time()
for anim,n in counts.items():
 if preview and anim!='idle': continue
 for direction,angle in cfg['directions'].items():
  for i in range(1 if preview else n):
   pose(anim,i/max(1,n-1),angle); name=f'{anim}_{direction}_{i:03d}'; scene.render.filepath=str(out/(name+'.png')); bpy.ops.render.render(write_still=True)
   projected=[world_to_camera_view(scene,camera,v) for v in vertices()]
   records.append({'name':name,'animation':anim+'_'+direction,'frame':i,'ground_anchor':anchor,'projected_bounds':[min(v.x for v in projected),min(1-v.y for v in projected),max(v.x for v in projected),max(1-v.y for v in projected)]})
info={'name':cfg['characters'][0]['name'],'frames':records,'seconds':time.time()-begin,'preview':preview,'anchor':anchor,'framing':{'ortho_scale':d.ortho_scale,'all_animation_samples':True},'authorship':'Original procedural geometry by Sol for cocy; no external models','geometry':{'legs':4,'wings':2,'claws':12,'neck_segments':4,'tail_segments':6,'mesh_objects':len(meshes)}}
(out/'frames.json').write_text(json.dumps(info,indent=2)); print('ORIGINAL_DRAGON_COMPLETE',json.dumps(info['geometry']),flush=True)
