"""Offline v4 dagger authoring. No body/weight/action edits. --full renders 368 frames."""
import bpy, numpy as np, json, math, os, sys, hashlib
from mathutils import Vector,Matrix
p='C:/Users/user/AppData/Local/Temp/openclaw/warrior-dagger-monster'
source='C:/Users/user/AppData/Local/Temp/openclaw/accurig-warrior-game-kit/skin-repair/review-best-v4/warrior-partial-weight-repair.blend'
bpy.ops.wm.open_mainfile(filepath=source)
s=bpy.context.scene;r=next(o for o in bpy.data.objects if o.type=='ARMATURE');rest=r.data.bones['hand_r'].matrix_local.copy()
r.animation_data.action=None
for b in r.pose.bones:b.matrix_basis.identity()
bpy.context.view_layer.update()
for o in bpy.data.objects:
 if o.name.startswith('Inventory'):o.hide_render=True
# Centre from exact original fist/shaft shared contact, not damaged finger guides.
c=Vector((-.3811730742454529,-.03828069195151329,.4814748167991638))
a=bpy.data.objects['Axe_original'];raw=np.array([list(a.matrix_world@v.co) for v in a.data.vertices]);near=raw[np.linalg.norm(raw-np.array(c),axis=1)<.065]
_,_,vh=np.linalg.svd(near-near.mean(0),full_matrices=False);axis=Vector(vh[0]);thumb=r.matrix_world@r.pose.bones['thumb_01_r'].head
if axis.dot(thumb-c)<0:axis=-axis
# Blade flat follows wrist/palm plane, not arbitrary global Z rotation.
wrist=r.matrix_world@r.pose.bones['hand_r'].head
width=(wrist-c)-axis*(wrist-c).dot(axis);width.normalize();normal=axis.cross(width).normalized()
def mat(name,col,metal):
 m=bpy.data.materials.new(name);m.use_nodes=True;sh=m.node_tree.nodes['Principled BSDF'];sh.inputs['Base Color'].default_value=(*col,1);sh.inputs['Metallic'].default_value=metal;sh.inputs['Roughness'].default_value=.42;return m
steel=mat('Dagger authored steel',(.43,.49,.53),.75);leather=mat('Dagger authored leather',(.075,.035,.018),0);guard=mat('Dagger authored guard',(.15,.17,.18),.65)
def mesh(name,verts,faces,material):
 me=bpy.data.meshes.new(name);me.from_pydata([c+width*x+normal*y+axis*z for x,y,z in verts],[],faces);me.materials.append(material);o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o.vertex_groups.new(name='hand_r').add(list(range(len(verts))),1,'REPLACE');mod=o.modifiers.new('Exact hand_r rigid binding','ARMATURE');mod.object=r;return o
# Oval hilt spans the fist. Guard is on thumb end; blade points away from fingers.
verts=[]
for z in [-.043,.043]:
 for i in range(8):verts.append((.010*math.cos(i*math.tau/8),.009*math.sin(i*math.tau/8),z))
faces=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
mesh('Dagger_hilt',verts,faces,leather)
mesh('Dagger_guard',[(x,y,z) for z in [.041,.052] for y in [-.009,.009] for x in [-.033,.033]],[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],guard)
# Diamond section, 0.18m blade; no borrowed weapon geometry.
verts=[(-.022,0,.052),(0,-.007,.052),(.022,0,.052),(0,.007,.052),(-.019,0,.15),(0,-.005,.15),(.019,0,.15),(0,.005,.15),(0,0,.232)]
mesh('Dagger_blade',verts,[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,8),(5,6,8),(6,7,8),(7,4,8),(3,2,1,0)],steel)
s.render.engine='CYCLES';s.cycles.samples=6;s.cycles.use_denoising=True;s.render.film_transparent=True;s.render.resolution_percentage=100
pitch=math.radians(40);target=Vector((-.035,0,(.6370674967765808-.5)*1.38/math.cos(pitch)))
def camera(az,t=target,scale=1.38):
 a=math.radians(az);s.camera.location=t+Vector((6*math.sin(a)*math.cos(pitch),-6*math.cos(a)*math.cos(pitch),6*math.sin(pitch)));s.camera.rotation_euler=(t-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=scale;s.camera.data.shift_x=0;s.camera.data.shift_y=0
os.makedirs(p+'/milestone',exist_ok=True);os.makedirs(p+'/frames',exist_ok=True)
proof={'sourceSHA256':hashlib.sha256(open(source,'rb').read()).hexdigest(),'gripRest':list(c),'shaftAxis':list(axis),'bladeWidthAxis':list(width),'bladeNormal':list(normal),'bladeLength':.18,'totalLength':.275,'clips':{'idle':13,'run':10,'attack':13,'death':10},'directions':{'E':-90,'SE':-45,'S':0,'SW':45,'W':90,'NW':135,'N':180,'NE':-135},'poses':[]}
# Hand binding invariant: both grip and dagger share identical exact transform.
for clip,n in proof['clips'].items():
 r.animation_data.action=bpy.data.actions['Warrior_'+clip]
 for f in range(n):
  s.frame_set(f+1);bpy.context.view_layer.update();m=r.matrix_world@r.pose.bones['hand_r'].matrix@rest.inverted()@r.matrix_world.inverted();proof['poses'].append({'clip':clip,'frame':f,'grip':list(m@c),'tip':list(m@(c+axis*.232))})
json.dump(proof,open(p+'/provenance.json','w'),indent=2)
if '--full' in sys.argv:
 s.render.resolution_x=128;s.render.resolution_y=128
 for clip,n in proof['clips'].items():
  r.animation_data.action=bpy.data.actions['Warrior_'+clip]
  for d,az in proof['directions'].items():
   camera(az)
   for f in range(n):
    s.frame_set(f+1);s.render.filepath=p+'/frames/'+clip+'_'+d+'_'+str(f).zfill(3)+'.png';bpy.ops.render.render(write_still=True)
else:
 for clip,f in [('idle',3),('attack',7)]:
  r.animation_data.action=bpy.data.actions['Warrior_'+clip];s.frame_set(f+1)
  for d,az in proof['directions'].items():
   camera(az);s.render.resolution_x=256;s.render.resolution_y=256;s.render.filepath=p+'/milestone/'+clip+'_'+d+'.png';bpy.ops.render.render(write_still=True)
 r.animation_data.action=bpy.data.actions['Warrior_idle'];s.frame_set(4);bpy.context.view_layer.update();m=r.matrix_world@r.pose.bones['hand_r'].matrix@rest.inverted()@r.matrix_world.inverted();grip=m@c
 for d,az in [('front',0),('side',90)]:
  camera(az,grip,.42);s.render.resolution_x=384;s.render.resolution_y=384;s.render.filepath=p+'/milestone/grip_'+d+'.png';bpy.ops.render.render(write_still=True)
 r.animation_data.action=bpy.data.actions['Warrior_idle'];s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=p+'/warrior-v4-dagger.blend')
