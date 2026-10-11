"""Independent skinned clip motion and facing proof; run Windows Blender -- config.json."""
import bpy, json, math, sys, hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
config = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())
job = config['characters'][0]
bpy.ops.wm.open_mainfile(filepath=str(Path(config['source']) / 'iron-boar-baked.blend'))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
root = bpy.data.objects['Facing']
mesh = bpy.data.objects['Pig']
info = json.loads((Path(config['output']) / 'iron-boar/frames.json').read_text())
assert info['pose_check']['profile']=='boar'
assert not info['preview']
# Reimport for the authored sparse-channel baseline, not a previous clip pose.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=job['model'])
defaults = {b.name:b.matrix_basis.copy() for o in bpy.context.scene.objects if o.type == 'ARMATURE' for b in o.pose.bones}
bpy.ops.wm.open_mainfile(filepath=str(Path(config['source']) / 'iron-boar-baked.blend'))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
root = bpy.data.objects['Facing']; mesh = bpy.data.objects['Pig']
assert any(m.type == 'ARMATURE' and m.object == rig for m in mesh.modifiers)
def points():
    dg=bpy.context.evaluated_depsgraph_get(); obj=mesh.evaluated_get(dg); m=obj.to_mesh()
    result=[obj.matrix_world@v.co for v in m.vertices]; obj.to_mesh_clear(); return result
reports={}; direction_vectors={}
for state, clip_name in job['animations'].items():
    samples=[]
    for record in [r for r in info['frames'] if r['animation']==state+'_E']:
        rig.animation_data.action=None
        for bone in rig.pose.bones: bone.matrix_basis=defaults[bone.name].copy()
        action=bpy.data.actions[clip_name]; rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
        root.rotation_euler.z=math.radians(config['directions']['E']+job.get('facing_offset',0))
        t=record['source_frame'];scene.frame_set(math.floor(t),subframe=t%1);bpy.context.view_layer.update()
        samples.append(points())
    max_rms=max(math.sqrt(sum((a-b).length_squared for a,b in zip(samples[0],sample))/len(sample)) for sample in samples)
    assert max_rms>0.001,(state,'static skinned clip',max_rms)
    reports[state]={'samples':len(samples),'max_skinned_rms_world':max_rms,'source':clip_name}
# Idle head->body vector is an independent anatomical facing, not texture hashes.
for direction,angle in config['directions'].items():
    rig.animation_data.action=None
    for bone in rig.pose.bones: bone.matrix_basis=defaults[bone.name].copy()
    action=bpy.data.actions[job['animations']['idle']];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    root.rotation_euler.z=math.radians(angle+job.get('facing_offset',0));scene.frame_set(0);bpy.context.view_layer.update()
    head=rig.matrix_world@rig.pose.bones['Head'].head;tail=rig.matrix_world@rig.pose.bones['Body'].head
    v=(head-tail);v.z=0;v.normalize()
    expected=Vector((math.cos(math.radians(angle-90)),math.sin(math.radians(angle-90)),0))
    dot=v.dot(expected)
    direction_vectors[direction]={'head_minus_body_xy':[v.x,v.y],'expected_xy':[expected.x,expected.y],'dot':dot}
    assert dot>0.9,(direction,'facing reversed/misaligned',direction_vectors[direction])
# All four anatomical legs must have real articulated run motion, not only
# a moving root/flat silhouette. Sample independent evaluated bone rotations.
legs=['FrontLeg.L','BackLeg.L','FrontLeg.R','BackLeg.R']
leg_samples={name:[] for name in legs}
for record in [r for r in info['frames'] if r['animation']=='run_E']:
    rig.animation_data.action=None
    for bone in rig.pose.bones: bone.matrix_basis=defaults[bone.name].copy()
    action=bpy.data.actions[job['animations']['run']];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    t=record['source_frame'];scene.frame_set(math.floor(t),subframe=t%1);bpy.context.view_layer.update()
    for name in legs: leg_samples[name].append(rig.pose.bones[name].matrix.to_quaternion().copy())
leg_motion={name:max(q.rotation_difference(samples[0]).angle for q in samples) for name,samples in leg_samples.items()}
assert all(v>.001 for v in leg_motion.values()),leg_motion
# Independently reopened accessories retain actual bone parents and move in run/attack.
accessories={}
for name in ['BoarArmor0','BoarArmor1','BoarArmor2','BoarTuskL','BoarTuskR']:
    obj=bpy.data.objects[name]
    bone='Body' if name.startswith('BoarArmor') else 'Head'
    assert obj.parent == rig and obj.parent_type == 'BONE' and obj.parent_bone == bone
    assert len(obj.data.vertices)>0
    samples=[]
    state='run' if bone=='Body' else 'attack'
    for record in [r for r in info['frames'] if r['animation']==state+'_E']:
        rig.animation_data.action=None
        for b in rig.pose.bones: b.matrix_basis=defaults[b.name].copy()
        action=bpy.data.actions[job['animations'][state]];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
        t=record['source_frame'];scene.frame_set(math.floor(t),subframe=t%1);bpy.context.view_layer.update()
        samples.append(obj.matrix_world.translation.copy())
    motion=max((v-samples[0]).length for v in samples)
    assert motion>.001,(name,'static accessory',motion)
    accessories[name]={'bone':bone,'vertices':len(obj.data.vertices),'max_world_motion':motion,'sampled_clip':state}
recoil=bpy.data.actions[job['animations']['hit']]
assert recoil.use_fake_user and tuple(recoil.frame_range)==(0,8)
report={'ok':True,'model_sha256':hashlib.sha256(Path(job['model']).read_bytes()).hexdigest(),'skinned_clip_motion':reports,'direction_vectors':direction_vectors,'checked_mesh':'Pig','articulated_legs':legs,'run_leg_motion_radians':leg_motion,'local_recoil':job['recoil'],'bone_attached_accessories':accessories}
Path(config['source']).parent.joinpath('source-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
