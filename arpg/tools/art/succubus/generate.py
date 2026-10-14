"""Original adult fitted-garment succubus: authored ring surfaces, articulated bone rig.
Windows Blender 5.2 -b --factory-startup --python generate.py -- config.json [--preview]
No imported models/textures. Front is -Y. Units: total height 3.6 (~7.5 heads).
"""
import bpy, math, json, sys, time
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
cfg=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
preview='--preview' in sys.argv
root=Path(cfg['source']); root.mkdir(parents=True,exist_ok=True)
out=Path(cfg['output'])/'succubus'; out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def material(name,color,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=.64; p.inputs['Metallic'].default_value=metal
 return m
suit=material('Opaque midnight plum fitted armor',(.065,.022,.083),.15)
plate=material('Oxidized wine lacquer plates',(.27,.042,.084),.3)
gold=material('Antique brass seams',(.54,.30,.11),.5)
skin=material('Mature warm face',(.56,.30,.25))
hair=material('Deep auburn sculpted hair',(.055,.017,.028))
wingmat=material('Burgundy bat membrane',(.20,.025,.052))
hornmat=material('Dark ivory horns',(.56,.43,.31))
eye=material('Pale amber iris',(.83,.58,.18))
dark=material('Face lash and pupil',(.015,.006,.012))
lip=material('Muted rose lips',(.28,.043,.051))
meshes=[]; bindings=[]
def mesh(name,verts,faces,mat,bone=None):
 me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
 ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob); ob.data.materials.append(mat)
 for p in me.polygons:p.use_smooth=True
 meshes.append(ob)
 if bone:bindings.append((ob,bone))
 return ob
# Ring lofts have intentional changes in cross section: pelvis/waist/ribcage,
# deltoid/biceps/elbow/forearm, femoral taper/patella/calf/ankle. Not capsules.
def loft(name,rings,mat,bone,segments=24):
 verts=[]
 for x,y,z,rx,ry in rings:
  for i in range(segments):
   a=i*math.tau/segments; verts.append((x+rx*math.cos(a),y+ry*math.sin(a),z))
 faces=[]
 for j in range(len(rings)-1):
  for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
 faces+=[tuple(range(segments-1,-1,-1)),tuple((len(rings)-1)*segments+i for i in range(segments))]
 return mesh(name,verts,faces,mat,bone)
def ell(name,p,s,mat,bone):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=p)
 ob=bpy.context.object; ob.name=name; ob.scale=s; ob.data.materials.append(mat)
 for f in ob.data.polygons:f.use_smooth=True
 meshes.append(ob); bindings.append((ob,bone)); return ob
def tube(name,points,radii,mat,bone,segments=10):
 verts=[]
 for j,p in enumerate(points):
  axis=Vector(points[min(j+1,len(points)-1)])-Vector(points[max(j-1,0)])
  q=axis.to_track_quat('Z','Y')
  for i in range(segments):verts.append(Vector(p)+q@Vector((radii[j]*math.cos(i*math.tau/segments),radii[j]*math.sin(i*math.tau/segments),0)))
 faces=[]
 for j in range(len(points)-1):
  for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
 faces += [tuple(range(segments-1,-1,-1)),tuple((len(points)-1)*segments+i for i in range(segments))]
 return mesh(name,verts,faces,mat,bone)
# Define a real editable skeletal source. Each clothing section follows its joint.
bones={'root':((0,0,0),(0,0,.5),None), 'pelvis':((0,0,1.62),(0,0,2.02),'root'),
 'spine':((0,0,2.02),(0,0,2.78),'pelvis'), 'head':((0,0,2.78),(0,0,3.45),'spine'),
 'tail':((0,.15,1.75),(.1,.7,1.60),'pelvis')}
for s,label in [(-1,'L'),(1,'R')]:
 bones.update({f'thigh.{label}':((s*.23,0,1.68),(s*.24,-.01,.93),'pelvis'),
 f'shin.{label}':((s*.24,-.01,.93),(s*.24,0,.22),f'thigh.{label}'),
 f'foot.{label}':((s*.24,0,.22),(s*.24,-.31,.12),f'shin.{label}'),
 f'arm.{label}':((s*.40,0,2.75),(s*.55,-.01,2.24),'spine'),
 f'forearm.{label}':((s*.55,-.01,2.24),(s*.57,-.12,1.83),f'arm.{label}'),
 f'hand.{label}':((s*.57,-.12,1.83),(s*.57,-.15,1.60),f'forearm.{label}'),
 f'wing.{label}':((s*.20,.14,2.62),(s*.70,.18,2.96),'spine')})
armdata=bpy.data.armatures.new('Adult succubus articulated skeleton'); rig=bpy.data.objects.new('Succubus_Rig',armdata); bpy.context.collection.objects.link(rig); bpy.context.view_layer.objects.active=rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(a,b,parent) in bones.items():
 bn=armdata.edit_bones.new(name);bn.head=a;bn.tail=b
 if parent:bn.parent=armdata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT'); rig.show_in_front=True
# One fitted opaque body surface: pelvis flows through waist into ribcage.
loft('Continuous fitted torso and pelvis',[(0,0,1.54,.16,.15),(0,.015,1.64,.29,.20),
 (0,.022,1.76,.355,.235),(0,.02,1.87,.34,.225),(0,.015,1.98,.28,.19),
 (0,.008,2.10,.225,.158),(0,0,2.21,.238,.17),(0,-.005,2.33,.278,.198),
 (0,-.014,2.45,.325,.223),(0,-.01,2.55,.35,.222),(0,0,2.66,.36,.18),
 (0,0,2.75,.355,.145),(0,0,2.81,.19,.12),(0,0,2.88,.12,.105)],suit,'spine')
loft('Neck',[(0,0,2.86,.115,.105),(0,0,3.03,.12,.11)],skin,'head')
# Adult head: distinct jaw, cheekbones, brow and smaller non-childlike eyes.
loft('Mature sculpted face',[(0,-.025,2.99,.083,.082),(0,-.035,3.04,.105,.108),(0,-.025,3.13,.151,.133),(0,-.01,3.25,.166,.147),(0,.01,3.37,.16,.145),(0,.02,3.44,.10,.10)],skin,'head',32)
for s in [-1,1]:
 ell('Almond eye lid', (s*.070,-.145,3.245),(.041,.012,.016),dark,'head')
 ell('Amber narrow iris',(s*.071,-.157,3.246),(.012,.005,.010),eye,'head')
 ell('Eye pupil',(s*.071,-.162,3.246),(.004,.002,.008),dark,'head')
 tube('Adult brow',[(s*.029,-.143,3.285),(s*.074,-.156,3.289),(s*.116,-.135,3.278)],[.008,.009,.004],hair,'head')
 ell('Ear',(s*.182,.001,3.22),(.04,.037,.085),skin,'head')
# Bridge + angular tip, restrained lip scale and chin.
tube('Nose bridge',[(0,-.136,3.265),(0,-.161,3.205),(0,-.175,3.182)],[.014,.018,.016],skin,'head')
ell('Defined upper lip',(0,-.150,3.116),(.043,.009,.008),lip,'head')
ell('Defined lower lip',(0,-.148,3.102),(.039,.009,.008),lip,'head')
# Hair covers skull and falls BEHIND the face; visible face never a blank ball.
ell('Hair crown',(0,.054,3.365),(.192,.164,.116),hair,'head')
for s in [-1,1]:
 tube('Swept temple lock',[(s*.13,-.06,3.42),(s*.192,-.01,3.29),(s*.20,.08,3.08),(s*.17,.16,2.96)],[.065,.055,.048,.006],hair,'head')
 tube('Long back hair',[(s*.07,.17,3.34),(s*.125,.18,3.06),(s*.14,.20,2.77),(s*.10,.22,2.59)],[.10,.10,.08,.008],hair,'head')
 tube('Swept curved horn',[(s*.12,.015,3.43),(s*.18,.03,3.56),(s*.24,.03,3.67),(s*.24,-.04,3.73),(s*.20,-.09,3.74)],[.07,.056,.035,.017,.002],hornmat,'head')
# Covered arms, elbows, forearms, glove palms and individual fingers.
for s,label in [(-1,'L'),(1,'R')]:
 loft('Sleeved deltoid and biceps '+label,[(s*.40,0,2.76,.13,.135),(s*.45,0,2.63,.14,.125),(s*.50,0,2.45,.108,.102),(s*.55,-.01,2.25,.075,.083)],suit,'arm.'+label)
 loft('Forearm gauntlet '+label,[(s*.55,-.01,2.25,.078,.087),(s*.56,-.045,2.11,.083,.081),(s*.57,-.085,1.98,.077,.074),(s*.57,-.12,1.84,.055,.060)],plate,'forearm.'+label)
 ell('Gloved palm '+label,(s*.57,-.13,1.77),(.062,.04,.094),suit,'hand.'+label)
 for k in range(4):
  x=s*.57+(k-1.5)*.028
  tube('Gloved finger '+label+str(k),[(x,-.14,1.72),(x,-.16,1.65),(x,-.18,1.61)],[.014,.012,.008],suit,'hand.'+label,8)
 tube('Gloved thumb '+label,[(s*.52,-.13,1.80),(s*.49,-.16,1.74),(s*.50,-.18,1.70)],[.021,.018,.01],suit,'hand.'+label)
 # Thighs have a femoral taper; knees patella; calves taper to ankle.
 loft('Covered femoral thigh '+label,[(s*.22,0,1.70,.205,.215),(s*.235,-.008,1.51,.185,.186),(s*.24,-.015,1.30,.148,.148),(s*.24,-.018,1.07,.111,.11),(s*.24,-.01,.94,.10,.105)],suit,'thigh.'+label)
 loft('Shaped armored calf boot '+label,[(s*.24,0,.94,.095,.106),(s*.24,.012,.80,.117,.125),(s*.24,.025,.65,.116,.129),(s*.24,.012,.43,.087,.092),(s*.24,0,.20,.062,.07)],plate,'shin.'+label)
 # Low practical heel with shaped toe box, not floating high heels.
 loft('Closed grounded boot '+label,[(s*.24,-.12,.045,.095,.225),(s*.24,-.12,.11,.095,.225),(s*.24,-.065,.19,.082,.16),(s*.24,0,.25,.065,.075)],suit,'foot.'+label)
 tube('Brass thigh piping '+label,[(s*.30,-.17,1.65),(s*.32,-.145,1.4),(s*.30,-.108,1.12)],[.014,.014,.012],gold,'thigh.'+label)
# Thin garment piping follows the waist; it does not bridge separate blocks.
loft('Waist brass piping',[(0,.008,2.08,.232,.164),(0,.008,2.102,.231,.163)],gold,'spine')
ell('Small waist garnet clasp',(0,-.162,2.091),(.037,.010,.023),plate,'spine')
for s,label in [(-1,'L'),(1,'R')]:
 # Narrow tall bat wings leave torso/hips visible in frontal projection.
 wrist=(s*.77,.20,3.10)
 tips=[(s*1.32,.28,3.36),(s*1.45,.31,2.72),(s*1.15,.35,2.28),(s*.63,.30,2.06)]
 edge=[tips[0],(s*1.13,.30,3.00),tips[1],(s*1.02,.34,2.60),tips[2],(s*.70,.31,2.37),tips[3],(s*.27,.18,2.45)]
 verts=[wrist]+edge
 ob=mesh('Scalloped bat membrane '+label,verts,[(0,i,i+1) for i in range(1,len(verts)-1)],wingmat,'wing.'+label)
 mod=ob.modifiers.new('Membrane thickness','SOLIDIFY');mod.thickness=.014
 tube('Bat wing leading arm '+label,[(s*.20,.14,2.62),(s*.49,.17,2.97),wrist,tips[0]],[.068,.054,.044,.005],suit,'wing.'+label)
 for i,t in enumerate(tips[1:]):tube('Bat wing articulated ray '+label+str(i),[wrist,t],[.027,.004],gold,'wing.'+label)
tube('Long tapering sinuous tail',[(0,.16,1.75),(.08,.43,1.60),(.24,.66,1.28),(.45,.69,.85),(.66,.50,.58),(.81,.28,.66),(.84,.18,.85)],[.06,.055,.048,.040,.031,.023,.012],plate,'tail')
mesh('Tail spade tip',[(.84,.18,.85),(.71,.19,1.00),(.85,.18,1.18),(.98,.18,1.00),(.85,.13,1.00),(.85,.23,1.00)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,5,1),(1,5,2),(2,5,3),(3,5,0)],gold,'tail')
# Weld the opaque garment shell before rigging. No separate armor bulbs or
# exposed joint gaps: union + smoothing connects torso, shoulders and limbs.
body_names=('Continuous fitted torso','Sleeved deltoid','Forearm gauntlet',
 'Gloved palm','Gloved finger','Gloved thumb','Covered femoral',
 'Shaped armored calf','Closed grounded boot','Neck')
body=[o for o in meshes if o.name.startswith(body_names)]
bpy.ops.object.select_all(action='DESELECT')
for ob in body:ob.select_set(True)
bpy.context.view_layer.objects.active=body[0]
bpy.ops.object.join();shell=bpy.context.object;shell.name='Connected opaque fitted garment shell'
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
remesh=shell.modifiers.new('Weld anatomical transitions','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.024;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
sm=shell.modifiers.new('Relax garment transitions','SMOOTH');sm.factor=.7;sm.iterations=5
bpy.ops.object.modifier_apply(modifier=sm.name)
dec=shell.modifiers.new('Stylized low poly surface','DECIMATE');dec.ratio=.24
bpy.ops.object.modifier_apply(modifier=dec.name)
shell.data.materials.clear()
for m in (suit,plate,skin):shell.data.materials.append(m)
for poly in shell.data.polygons:
 c=poly.center;poly.use_smooth=True
 # Colored fitted textile panels on a single mesh, not raised cuirass pieces.
 poly.material_index=2 if c.z>2.89 else 1 if (2.33<c.z<2.64 and c.y<-.10 and abs(c.x)<.30) or (.25<c.z<.88) or (1.87<c.z<2.20 and abs(c.x)>.43) else 0
meshes=[o for o in meshes if o not in body]+[shell]
bindings=[(o,b) for o,b in bindings if o not in body]
# Blended nearest-segment skeletal weights keep the welded joints connected
# through the actual clips. Two closest bones share each garment vertex.
skin_bones=[n for n in bones if n not in ('root','tail','wing.L','wing.R')]
groups={n:shell.vertex_groups.new(name=n) for n in skin_bones}
def segment_distance(v,a,b):
 a,b=Vector(a),Vector(b);d=b-a;t=max(0,min(1,(v-a).dot(d)/d.length_squared));return (v-(a+t*d)).length
for v in shell.data.vertices:
 distances=sorted((segment_distance(v.co,*bones[n][:2]),n) for n in skin_bones)[:2]
 weights=[math.exp(-(d-distances[0][0])/.105) for d,n in distances];total=sum(weights)
 for (distance,n),w in zip(distances,weights):groups[n].add([v.index],w/total,'REPLACE')
shell.parent=rig;mod=shell.modifiers.new('Blended garment skeletal deformation','ARMATURE');mod.object=rig
for ob,bone in bindings:
 ob.parent=rig
 vg=ob.vertex_groups.new(name=bone);vg.add(list(range(len(ob.data.vertices))),1,'REPLACE')
 mod=ob.modifiers.new('Succubus skeletal deformation','ARMATURE');mod.object=rig
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=16
scene.render.resolution_x=scene.render.resolution_y=cfg['frame_size'];scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.fps=cfg['fps'];scene.world.color=(.45,.45,.45)
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
for name,p,energy,size in [('Warm key',(-3,-4,7),700,5),('Cool fill',(4,-1,4),350,4),('Rim',(0,5,6),650,3)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;ob=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(ob);ob.location=p;ob.rotation_euler=(Vector((0,0,1.8))-ob.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Isometric 40deg fixed ground anchor');camera=bpy.data.objects.new(d.name,d);bpy.context.collection.objects.link(camera);scene.camera=camera;d.type='ORTHO'
target=Vector((0,0,1.80));camera.location=target+Vector((0,-10*math.cos(math.radians(40)),10*math.sin(math.radians(40))));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=4.6
counts=cfg['frame_counts']
def rotate(name,x=0,y=0,z=0):
 bn=rig.pose.bones[name];bn.rotation_mode='XYZ';bn.rotation_euler=(x,y,z)
def pose(anim,t,angle):
 rig.rotation_euler=(0,0,math.radians(angle));rig.location=(0,0,0)
 for bn in rig.pose.bones:bn.rotation_mode='XYZ';bn.rotation_euler=(0,0,0);bn.location=(0,0,0)
 w=math.sin(t*math.tau)
 rotate('spine',.012*w,0,.018*w);rotate('head',-.012*w,0,-.01*w)
 for s,label in [(-1,'L'),(1,'R')]:
  rotate('arm.'+label,.08,0,s*.05);rotate('forearm.'+label,.16)
  rotate('wing.'+label,0,.08*w,s*.045*w)
 rotate('tail',.05*w,0,.16*w)
 if anim=='run':
  rig.location.z=.035*(1-math.cos(t*math.tau*2));rotate('spine',.07,0,.065*w)
  for s,label in [(-1,'L'),(1,'R')]:
   swing=s*w;rotate('thigh.'+label,.50*swing);rotate('shin.'+label,-.60*max(0,-swing));rotate('foot.'+label,.20*max(0,-swing));rotate('arm.'+label,-.45*swing,0,s*.08);rotate('forearm.'+label,.30+.15*max(0,swing))
 if anim=='attack':
  a=math.sin(t*math.pi);rotate('spine',.10*a,0,-.34*math.sin(t*math.tau));rotate('arm.R',1.35*a,0,-.30*a);rotate('forearm.R',.50*a);rotate('arm.L',-.35*a,0,-.18*a);rotate('head',-.08*a)
 if anim=='hit':
  a=math.sin(t*math.pi);rotate('pelvis',-.12*a);rotate('spine',-.20*a,0,.12*a);rotate('head',-.16*a);rotate('arm.L',-.18*a,0,-.25*a);rotate('arm.R',-.18*a,0,.25*a)
 if anim=='death':
  a=t*t*(3-2*t);rig.location=(0,.15*a,-.10*a);rotate('root',-1.40*a,0,.18*a);rotate('spine',.20*a);rotate('head',.25*a);rotate('thigh.L',.22*a);rotate('thigh.R',-.20*a);rotate('shin.L',-.25*a);rotate('arm.L',.20*a,0,-.45*a);rotate('arm.R',.50*a,0,.35*a)
 bpy.context.view_layer.update()
def vertices():
 dg=bpy.context.evaluated_depsgraph_get();result=[]
 for ob in meshes:
  ev=ob.evaluated_get(dg);me=ev.to_mesh();result.extend(ev.matrix_world@v.co for v in me.vertices);ev.to_mesh_clear()
 return result
# Fit all deformed poses/octants ONCE, independent of the current animation.
right=camera.rotation_euler.to_matrix()@Vector((1,0,0));up=camera.rotation_euler.to_matrix()@Vector((0,1,0));xs=[];ys=[]
for anim,n in counts.items():
 for angle in cfg['directions'].values():
  for i in range(n):
   pose(anim,i/(n if anim in ('idle','run') else max(1,n-1)),angle)
   for v in vertices():xs.append(v.dot(right));ys.append(v.dot(up))
center=right*((min(xs)+max(xs))/2)+up*((min(ys)+max(ys))/2);delta=center-target;camera.location+=delta;target+=delta;d.ortho_scale=max(max(xs)-min(xs),max(ys)-min(ys))*1.12
bpy.context.view_layer.update();origin=world_to_camera_view(scene,camera,Vector((0,0,0)));anchor={'x':origin.x,'y':1-origin.y}
# Preserve bone-keyed clips in source .blend. Direct sampling uses identical pose().
for ai,(anim,n) in enumerate(counts.items()):
 start=ai*30+1
 for i in range(n):
  pose(anim,i/(n if anim in ('idle','run') else max(1,n-1)),0)
  for bn in rig.pose.bones:
   bn.keyframe_insert(data_path='rotation_euler',frame=start+i);bn.keyframe_insert(data_path='location',frame=start+i)
  rig.keyframe_insert(data_path='location',frame=start+i)
 scene.timeline_markers.new(anim,frame=start)
pose('idle',0,0);bpy.ops.wm.save_as_mainfile(filepath=str(root/'original-adult-succubus.blend'));rig.animation_data_clear()
# Source views are rendered content, never browser screenshots.
if preview:
 scene.render.resolution_x=scene.render.resolution_y=640
 for name,angle,pitch in [('front',0,0),('side',90,0),('back',180,0),('isometric',45,40)]:
  pose('idle',0,angle);camera.location=Vector((0,-10*math.cos(math.radians(pitch)),1.90+10*math.sin(math.radians(pitch))));camera.rotation_euler=(Vector((0,0,1.90))-camera.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=4.35
  scene.render.filepath=str(root/(name+'.png'));bpy.ops.render.render(write_still=True)
 (root/'model-checkpoint.json').write_text(json.dumps({'original':True,'borrowed_assets':[],'adult_head_to_height':7.5,'fully_opaque_body_cover':True,'bones':list(bones),'mesh_objects':len(meshes)},indent=2));print('MODEL_CHECKPOINT_COMPLETE',flush=True);sys.exit(0)
records=[];begin=time.time()
for anim,n in counts.items():
 for direction,angle in cfg['directions'].items():
  for i in range(n):
   t=i/(n if anim in ('idle','run') else max(1,n-1));pose(anim,t,angle);name=f'{anim}_{direction}_{i:03d}';scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
   projected=[world_to_camera_view(scene,camera,v) for v in vertices()]
   records.append({'name':name,'animation':anim+'_'+direction,'frame':i,'ground_anchor':anchor,'projected_bounds':[min(v.x for v in projected),min(1-v.y for v in projected),max(v.x for v in projected),max(1-v.y for v in projected)],'bone_rotations':{bn.name:list(bn.rotation_euler) for bn in rig.pose.bones}})
info={'name':'succubus','frames':records,'seconds':time.time()-begin,'preview':False,'anchor':anchor,'framing':{'ortho_scale':d.ortho_scale,'all_animation_samples':True},'authorship':'Original procedural mesh and skeletal clips by Sol for cocy; no imports','geometry':{'bones':len(bones),'mesh_objects':len(meshes),'adult_height':3.6,'head_height':.46}}
(out/'frames.json').write_text(json.dumps(info,indent=2));print('SUCCUBUS_BAKE_COMPLETE',flush=True)
