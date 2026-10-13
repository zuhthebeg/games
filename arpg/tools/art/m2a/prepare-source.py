"""Derive missing ghoul recoil/death and bat fast-flight on original rigs.
Original downloads remain unchanged; derived GLBs are offline inputs to bake.py.
Run in Windows Blender with -- <offline source directory>.
"""
import bpy, sys, math, json, hashlib
from pathlib import Path
from mathutils import Quaternion, Vector, Matrix
args=sys.argv[sys.argv.index('--')+1:]
root=Path(args[0])
selected=args[args.index('--only')+1] if '--only' in args else None
reports=json.loads((root/'preparation.json').read_text()) if selected and (root/'preparation.json').exists() else []
for name in ['ghoul','ghost','bat']:
    if selected and name!=selected:continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root/(name+'.glb')))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    for t in rig.animation_data.nla_tracks: t.mute=True
    rig.animation_data.use_nla=False
    print('IMPORT',name,'MESHES',[o.name for o in bpy.context.scene.objects if o.type=='MESH'],'BONES',[b.name for b in rig.pose.bones],'ACTIONS',[(a.name,list(a.frame_range)) for a in bpy.data.actions],flush=True)
    derived=[]
    if name=='ghoul':
        idle=bpy.data.actions['Zombie|ZombieIdle']
        rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0]
        bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
        stance={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
        # Original idle has a broad head/body lurch (>7px bbox-center drift).
        # Retain its complete timeline on the same rig, with half-amplitude local
        # motion around the first authored stance; bake/render depsgraphs read
        # actual keyed channels, not unstable post-evaluation matrix edits.
        end=int(idle.frame_range[1]);native=[]
        for frame in sorted(set(range(0,end+1,2))|{end}):
            rig.animation_data.action=idle;rig.animation_data.action_slot=idle.slots[0]
            bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
            native.append((frame,{b.name:b.matrix_basis.copy() for b in rig.pose.bones}))
        calm=bpy.data.actions.new('M2a_Ghoul_CalmIdle');calm.use_fake_user=True;rig.animation_data.action=calm
        for frame,matrices in native:
            for bone in rig.pose.bones:
                loc,rot,scale=stance[bone.name].decompose();dl,dr,ds=matrices[bone.name].decompose()
                bone.matrix_basis=Matrix.LocRotScale(loc.lerp(dl,.5),rot.slerp(dr,.5),scale.lerp(ds,.5))
                bone.keyframe_insert('rotation_quaternion',frame=frame);bone.keyframe_insert('location',frame=frame);bone.keyframe_insert('scale',frame=frame)
        derived.append(calm.name)
        for clip,frames in [('M2a_Ghoul_Recoil',[(0,0),(2,1),(5,.5),(8,0)]),('M2a_Ghoul_Death',[(0,0),(5,.15),(10,.55),(16,1),(20,1)])]:
            action=bpy.data.actions.new(clip);action.use_fake_user=True;rig.animation_data.action=action
            for frame,strength in frames:
                for bone in rig.pose.bones:
                    bone.matrix_basis=stance[bone.name].copy()
                    angles={'Spine':-18,'Neck':15,'LeftArm':-12,'RightArm':-12} if 'Recoil' in clip else {'Hips':85,'Spine':-12,'Neck':18,'LeftArm':22,'RightArm':-22,'LeftUpLeg':15,'RightUpLeg':-15}
                    if bone.name in angles:
                        bone.rotation_quaternion=bone.rotation_quaternion @ Quaternion(Vector((1,0,0)),math.radians(angles[bone.name])*strength)
                    bone.keyframe_insert('rotation_quaternion',frame=frame);bone.keyframe_insert('location',frame=frame);bone.keyframe_insert('scale',frame=frame)
            derived.append(clip)
    if name=='bat':
        # One authored flight cycle is retained for idle; fast-flight is a time-scaled copy.
        fast=bpy.data.actions['BatArmature|Bat_Flying'].copy();fast.name='M2a_Bat_FastFlight';fast.use_fake_user=True
        for layer in fast.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.co.x*=.65;key.handle_left.x*=.65;key.handle_right.x*=.65
        derived.append(fast.name)
    # Export all imported actions and local additions, with the original skin intact.
    for a in bpy.data.actions:a.use_fake_user=True
    rig.animation_data.action=None
    bpy.ops.export_scene.gltf(filepath=str(root/(name+'-prepared.glb')),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_anim_slide_to_zero=True)
    reports=[r for r in reports if r['id']!=name]
    reports.append({'id':name,'original_sha256':hashlib.sha256((root/(name+'.glb')).read_bytes()).hexdigest(),'prepared_sha256':hashlib.sha256((root/(name+'-prepared.glb')).read_bytes()).hexdigest(),'derived_clips':derived})
reports.sort(key=lambda r:['ghoul','ghost','bat'].index(r['id']))
(root/'preparation.json').write_text(json.dumps(reports,indent=2))
