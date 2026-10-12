"""Independently reopen the delivered dragon scene; inspect evaluated skinned clips."""
import bpy, json, math, sys, hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
config=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());job=config['characters'][0]
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=job['model'])
defaults={b.name:b.matrix_basis.copy() for o in bpy.context.scene.objects if o.type=='ARMATURE' for b in o.pose.bones}
bpy.ops.wm.open_mainfile(filepath=str(Path(config['source'])/'dragon-baked.blend'))
scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE');root=bpy.data.objects['Facing'];mesh=bpy.data.objects['Dragon']
assert any(m.type=='ARMATURE' and m.object==rig for m in mesh.modifiers)
info=json.loads((Path(config['output'])/'dragon/frames.json').read_text());assert info['pose_check']['profile']=='dragon' and not info['preview']
def evaluate(state,frame,angle):
 rig.animation_data.action=None
 for bone in rig.pose.bones:bone.matrix_basis=defaults[bone.name].copy()
 a=bpy.data.actions[job['animations'][state]];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
 root.rotation_euler.z=math.radians(angle+job.get('facing_offset',0));scene.frame_set(math.floor(frame),subframe=frame%1);bpy.context.view_layer.update()
def points():
 o=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());m=o.to_mesh();p=[o.matrix_world@v.co for v in m.vertices];o.to_mesh_clear();return p
reports={};direction_vectors={};wing_motion={}
for state in job['animations']:
 samples=[];wings={n:[] for n in ['Wing1.L','Wing1.R','Wing2.L','Wing2.R']}
 for rec in [r for r in info['frames'] if r['animation']==state+'_E']:
  evaluate(state,rec['source_frame'],config['directions']['E']);samples.append(points())
  for n in wings:wings[n].append(rig.pose.bones[n].matrix.to_quaternion().copy())
 rms=max(math.sqrt(sum((a-b).length_squared for a,b in zip(samples[0],s))/len(s)) for s in samples)
 assert rms>.001,(state,'static skinned clip',rms)
 reports[state]={'samples':len(samples),'max_skinned_rms_world':rms,'source':job['animations'][state]}
 if state=='run':
  wing_motion={n:max(q.rotation_difference(qs[0]).angle for q in qs) for n,qs in wings.items()};assert all(v>.001 for v in wing_motion.values()),wing_motion
for direction,angle in config['directions'].items():
 evaluate('idle',0,angle)
 v=rig.matrix_world@(rig.pose.bones['Head'].head-rig.pose.bones['Torso'].head);v.z=0;v.normalize()
 expected=Vector((math.cos(math.radians(angle-90)),math.sin(math.radians(angle-90)),0));dot=v.dot(expected)
 assert dot>.9,(direction,'misaligned facing',dot)
 direction_vectors[direction]={'head_minus_torso_xy':[v.x,v.y],'expected_xy':[expected.x,expected.y],'dot':dot}
body_stability={}
for direction,angle in config['directions'].items():
 samples=[];ground=[]
 for rec in [r for r in info['frames'] if r['animation']=='idle_'+direction]:
  evaluate('idle',rec['source_frame'],angle)
  v=world_to_camera_view(scene,scene.camera,rig.matrix_world@rig.pose.bones['Torso'].head)
  samples.append([v.x*128,v.y*128]);g=world_to_camera_view(scene,scene.camera,Vector((0,0,0)));ground.append([g.x,1-g.y])
 drift=max(math.dist(a,b) for a in samples for b in samples)
 body_stability[direction]={'max_torso_drift_px':drift,'fixed_ground_anchor':ground[0],'ground_drift':max(math.dist(a,b) for a in ground for b in ground)}
 assert drift<6,(direction,'unanchored torso',drift)
 assert all(math.dist(g,[info['anchor']['x'],info['anchor']['y']])<1e-6 for g in ground)
report={'ok':True,'idle_body_stability':body_stability,'checked_mesh':'Dragon','model_sha256':hashlib.sha256(Path(job['model']).read_bytes()).hexdigest(),'skinned_clip_motion':reports,'direction_vectors':direction_vectors,'articulated_wings':list(wing_motion),'run_wing_motion_radians':wing_motion,'hit_source':'original HitReact, not an aliased locomotion clip','source_frame_ranges':{state:list(bpy.data.actions[name].frame_range) for state,name in job['animations'].items()}}
Path(config['source']).parent.joinpath('source-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
