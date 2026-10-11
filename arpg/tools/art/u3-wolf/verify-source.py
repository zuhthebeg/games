"""Independent skinned clip motion and facing proof; run Windows Blender -- config.json."""
import bpy, json, math, sys, hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
config = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())
job = config['characters'][0]
bpy.ops.wm.open_mainfile(filepath=str(Path(config['source']) / 'wolf-baked.blend'))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
root = bpy.data.objects['Facing']
mesh = bpy.data.objects['Wolf']
info = json.loads((Path(config['output']) / 'wolf/frames.json').read_text())
# Reimport for the authored sparse-channel baseline, not a previous clip pose.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=job['model'])
defaults = {b.name:b.matrix_basis.copy() for o in bpy.context.scene.objects if o.type == 'ARMATURE' for b in o.pose.bones}
bpy.ops.wm.open_mainfile(filepath=str(Path(config['source']) / 'wolf-baked.blend'))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
root = bpy.data.objects['Facing']; mesh = bpy.data.objects['Wolf']
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
# Idle head->tail vector is an independent anatomical facing, not texture hashes.
for direction,angle in config['directions'].items():
    rig.animation_data.action=None
    for bone in rig.pose.bones: bone.matrix_basis=defaults[bone.name].copy()
    action=bpy.data.actions[job['animations']['idle']];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    root.rotation_euler.z=math.radians(angle+job.get('facing_offset',0));scene.frame_set(0);bpy.context.view_layer.update()
    head=rig.matrix_world@rig.pose.bones['Head'].head;tail=rig.matrix_world@rig.pose.bones['Tail1'].head
    v=(head-tail);v.z=0;v.normalize()
    expected=Vector((math.cos(math.radians(angle-90)),math.sin(math.radians(angle-90)),0))
    dot=v.dot(expected)
    direction_vectors[direction]={'head_minus_tail_xy':[v.x,v.y],'expected_xy':[expected.x,expected.y],'dot':dot}
    assert dot>0.9,(direction,'facing reversed/misaligned',direction_vectors[direction])
report={'ok':True,'model_sha256':hashlib.sha256(Path(job['model']).read_bytes()).hexdigest(),'skinned_clip_motion':reports,'direction_vectors':direction_vectors,'checked_mesh':'Wolf'}
Path(config['source']).parent.joinpath('source-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
