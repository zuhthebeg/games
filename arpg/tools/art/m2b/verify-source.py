"""Read-only reopened M2b blends: native skin, facing, grip, wings and fixed ground."""
import bpy,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
config=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());reports=[]
for job in config['characters']:
 name=job['name'];info=json.loads((Path(config['output'])/name/'frames.json').read_text())
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=job['model'])
 original=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');defaults={b.name:b.matrix_basis.copy() for b in original.pose.bones}
 bpy.ops.wm.open_mainfile(filepath=str(Path(config['source'])/(name+'-baked.blend')))
 scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE');root=bpy.data.objects['Facing'];skin=[bpy.data.objects[n] for n in info['pose_check']['skinned_objects']]
 assert all(any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers) for o in skin)
 def select(state,direction,frame):
  rig.animation_data.action=None
  for b in rig.pose.bones:b.matrix_basis=defaults[b.name].copy()
  a=bpy.data.actions[job['animations'][state]];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
  root.rotation_euler.z=math.radians(config['directions'][direction]+job.get('facing_offset',0));scene.frame_set(math.floor(frame),subframe=frame%1);rig.location.x=rig.location.y=0;bpy.context.view_layer.update()
 def vertices(obj):
  e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();p=[e.matrix_world@v.co for v in m.vertices];e.to_mesh_clear();return p
 def points():return [p for o in skin for p in vertices(o)]
 motion={};wing_motion={};idle_core={};min_idle_z=float('inf');grip_errors=[]
 for state in job['animations']:
  samples=[];wings=[];local_grip=[]
  for r in [r for r in info['frames'] if r['animation']==state+'_E']:
   select(state,'E',r['source_frame']);samples.append(points())
   if state=='idle':min_idle_z=min(min_idle_z,min(p.z for p in samples[-1]))
   if name=='goleling':wings.append({n:rig.pose.bones[n].matrix_basis.to_quaternion().copy() for n in ['Wing1.L','Wing1.R','Wing2.L','Wing2.R']})
   if name=='demon':
    # Source trident is wholly weighted to one original finger joint. Every
    # evaluated vertex must retain its joint-local coordinate throughout clips.
    inverse=(rig.matrix_world@rig.pose.bones['Middle1.L'].matrix).inverted()
    local_grip.append([inverse@p for p in vertices(bpy.data.objects['Trident'])])
  rms=max(math.sqrt(sum((a-b).length_squared for a,b in zip(samples[0],p))/len(p)) for p in samples);assert rms>.001,(name,state,'static skin',rms)
  motion[state]={'source':job['animations'][state],'samples':len(samples),'max_skinned_rms_world':rms}
  if state=='idle' and name=='goleling':
   wing_motion={n:max(wings[0][n].rotation_difference(w[n]).angle for w in wings) for n in wings[0]};assert all(v>.001 for v in wing_motion.values())
  if local_grip:grip_errors.extend(max((a-b).length for a,b in zip(local_grip[0],p)) for p in local_grip)
 vectors={};trident_grip=None
 if name=='demon':
  select('idle','S',0);p=vertices(bpy.data.objects['Trident']);grip=rig.matrix_world@rig.pose.bones['Middle1.L'].head
  center=sum(p,Vector())/len(p);low=min(v.z for v in p);high=max(v.z for v in p)
  error=(Vector((center.x,center.y,low+(high-low)*.30))-grip).length
  assert error<.04,('trident shaft grip',error)
  assert high-low>1.5 and min(v.z for v in p)>-.001
  trident_grip={'shaft_grip_error_world':error,'world_height':high-low,'min_idle_z':low,'retained_original_mesh':True,'original_joint':'Middle1.L'}
 for direction,angle in config['directions'].items():
  select('idle',direction,0)
  if name=='slime':
   eyes=vertices(bpy.data.objects['Green_Blob.001']);v=sum(eyes,Vector())/len(eyes)-(rig.matrix_world@rig.pose.bones['Head'].head)
  else:v=(rig.matrix_world@rig.pose.bones['Head'].head)-(rig.matrix_world@rig.pose.bones['Neck'].head)
  v.z=0;v.normalize();expected=Vector((math.cos(math.radians(angle-90)),math.sin(math.radians(angle-90)),0));dot=v.dot(expected);assert dot>.9,(name,direction,'anatomy',dot);vectors[direction]={'anatomical_xy':list(v)[:2],'expected_xy':list(expected)[:2],'dot':dot,'method':'eye mesh vs Head' if name=='slime' else 'Head vs Neck'}
  centers=[]
  for record in [r for r in info['frames'] if r['animation']=='idle_'+direction]:
   select('idle',direction,record['source_frame']);center=rig.matrix_world@((rig.pose.bones['Head'].head+rig.pose.bones['Neck' if name!='slime' else 'Head2'].head)/2);p=world_to_camera_view(scene,scene.camera,center);centers.append((p.x*128,(1-p.y)*128))
  idle_core[direction]=max(math.dist(a,b) for a in centers for b in centers);assert idle_core[direction]<6,(name,direction,'idle core drift',idle_core[direction])
 anchor=info['anchor'];max_error=0
 for record in info['frames']:
  state,direction=record['animation'].rsplit('_',1);select(state,direction,record['source_frame']);p=world_to_camera_view(scene,scene.camera,Vector());err=max(abs(p.x-anchor['x']),abs(1-p.y-anchor['y']))*128;max_error=max(max_error,err);assert err<.001
 assert all(not o.data.use_shadow for o in scene.objects if o.type=='LIGHT')
 if name=='goleling':assert min_idle_z>0
 if name=='demon':assert max(grip_errors)<.001
 report={'id':name,'ok':True,'model_sha256':hashlib.sha256(Path(job['model']).read_bytes()).hexdigest(),'original_sha256':hashlib.sha256(Path(job['model']).read_bytes()).hexdigest(),'blend_sha256':hashlib.sha256((Path(config['source'])/(name+'-baked.blend')).read_bytes()).hexdigest(),'checked_meshes':[o.name for o in skin],'skinned_clip_motion':motion,'direction_vectors':vectors,'wing_motion_radians':wing_motion,'min_idle_vertex_z':min_idle_z,'idle_body_core_drift_px':idle_core,'frames_checked':len(info['frames']),'ground_anchor':anchor,'max_ground_error_px':max_error,'trident_joint_local_max_error':max(grip_errors) if grip_errors else None,'trident_grip':trident_grip,'baked_ground_shadow':False,'light_shadows':False}
 reports.append(report);print('SOURCE_RESULT',json.dumps(report),flush=True)
Path(config['source']).parent.joinpath('source-validation.json').write_text(json.dumps({'ok':True,'results':reports},indent=2))
