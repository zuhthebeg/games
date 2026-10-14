"""Original bow/arrow and authored contact-driven attack on unchanged CC0 skinned Rogue.
Executed by adapted bake.py inside its verified import context. No body mesh conversion.
"""
from mathutils import Quaternion
# Capture genuine original aiming stance, then solve both five-bone arm chains.
aim_clip=bpy.data.actions['2H_Ranged_Aiming']
rig.animation_data.action=aim_clip; rig.animation_data.action_slot=aim_clip.slots[0]
scene.frame_set(20); bpy.context.view_layer.update()
aim_basis={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
targets={}; constraints=[]
for side in ['l','r']:
    obj=bpy.data.objects.new('Archer_hand_target_'+side,None);bpy.context.collection.objects.link(obj)
    c=rig.pose.bones['handslot.'+side].constraints.new('IK');c.target=obj;c.chain_count=5;c.use_tail=True;c.use_stretch=False;c.iterations=100
    targets[side]=obj;constraints.append((rig.pose.bones['handslot.'+side],c))
bow_center=Vector((.10,-.66,1.04))
pose_samples=[]
for f in range(25):
    rig.animation_data.action=None
    scene.frame_set(f)
    for b in rig.pose.bones:b.matrix_basis=aim_basis[b.name].copy()
    # Explicit nock -> full draw -> release -> follow through -> recover.
    if f<=12: pull=.13+.28*(f/12)**.7
    elif f<=14: pull=.41
    elif f<=18: pull=.41+.055*(f-14)/4
    else: pull=.465-(.465-.13)*(f-18)/6
    targets['l'].location=bow_center
    targets['r'].location=bow_center+Vector((-.06*max(0,min(1,(f-14)/4)),pull,0))
    scene.frame_set(f);bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get(); er=rig.evaluated_get(dg)
    pose_samples.append({b.name:er.pose.bones[b.name].matrix.copy() for b in rig.pose.bones})
for b,c in constraints:b.constraints.remove(c)
for obj in targets.values():bpy.data.objects.remove(obj,do_unlink=True)
attack=bpy.data.actions.new('Archer_Draw_Contact_Release');attack.use_fake_user=True
rig.animation_data.action=attack
for f,poses in enumerate(pose_samples):
    scene.frame_set(f)
    for b in rig.pose.bones:
        kwargs={} if not b.parent else {'parent_matrix':poses[b.parent.name],'parent_matrix_local':b.parent.bone.matrix_local}
        b.matrix_basis=b.bone.convert_local_to_pose(poses[b.name],b.bone.matrix_local,invert=True,**kwargs)
        b.keyframe_insert('location',frame=f);b.keyframe_insert('rotation_quaternion',frame=f);b.keyframe_insert('scale',frame=f)
rig.animation_data.action=None
for b in rig.pose.bones:b.matrix_basis=default_basis[b.name].copy()
job['animations']['attack']=attack.name
