"""Independent reopened-Blender proof of skin, 8-way facing, movement and ground anchor.
No render-generation counters or claimed arm poses are used as source truth.
"""
import bpy,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
cfg=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());results=[]
for job in cfg['characters']:
    info=json.loads((Path(cfg['output'])/job['name']/'frames.json').read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=job['model'])
    imported=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    defaults={b.name:b.matrix_basis.copy() for b in imported.pose.bones}
    bpy.ops.wm.open_mainfile(filepath=str(Path(cfg['source'])/(job['name']+'-baked.blend')))
    scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE');root=bpy.data.objects['Facing']
    meshes=[bpy.data.objects[n] for n in info['pose_check']['skinned_objects']]
    assert len(meshes)==1 and all(any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers) for o in meshes)
    if job['name']=='spirit':
        assert set(rig.pose.bones.keys())=={'Root','Core','Nose','Tail','Shard0','Shard1','Shard2','Shard3'},'limbless floating anatomy'
    def select(state,direction,frame):
        rig.animation_data.action=None
        for b in rig.pose.bones:b.matrix_basis=defaults[b.name].copy()
        a=bpy.data.actions[job['animations'][state]];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
        root.rotation_euler.z=math.radians(cfg['directions'][direction]);scene.frame_set(math.floor(frame),subframe=frame%1)
        rig.location.x=rig.location.y=0;bpy.context.view_layer.update()
    def points():
        dg=bpy.context.evaluated_depsgraph_get();p=[]
        for o in meshes:
            evaluated=o.evaluated_get(dg);m=evaluated.to_mesh();p.extend(evaluated.matrix_world@v.co for v in m.vertices);evaluated.to_mesh_clear()
        return p
    motion={};bone_motion={};idle_floor=float('inf')
    for state in job['animations']:
        poses=[];bones=[]
        for r in [r for r in info['frames'] if r['animation']==state+'_E']:
            select(state,'E',r['source_frame']);poses.append(points());bones.append({b.name:(rig.matrix_world@b.head).copy() for b in rig.pose.bones})
        if state=='idle':idle_floor=min(p.z for pose in poses for p in pose)
        rms=max(math.sqrt(sum((a-b).length_squared for a,b in zip(poses[0],p))/len(p)) for p in poses)
        assert rms>.001,(job['name'],state,'static source skin',rms)
        motion[state]={'source':job['animations'][state],'samples':len(poses),'max_skinned_rms_world':rms}
        bone_motion[state]={n:max((b[n]-bones[0][n]).length for b in bones) for n in bones[0]}
    assert idle_floor>.1 if job['name']=='spirit' else abs(idle_floor)<.001,(job['name'],'idle hover/feet',idle_floor)
    # Front is a real anatomical cue: eye/head centre vs neck, or nozzle vs core.
    vectors={}
    for direction,angle in cfg['directions'].items():
        select('idle',direction,0)
        if job['name']=='spirit':a=rig.pose.bones['Nose'].head;b=rig.pose.bones['Core'].head
        else:
            # Fore-facing head inset, transformed from rig-local stone head mesh coordinates.
            transform=rig.pose.bones['Head'].matrix@rig.pose.bones['Head'].bone.matrix_local.inverted()
            a=transform@Vector((0,-.3,2.02));b=transform@Vector((0,0,2.02))
        v=rig.matrix_world@(a-b);v.z=0;v.normalize();expected=Vector((math.cos(math.radians(angle-90)),math.sin(math.radians(angle-90)),0))
        dot=v.dot(expected);assert dot>.9,(job['name'],direction,dot)
        vectors[direction]={'anatomical_xy':list(v)[:2],'expected_xy':list(expected)[:2],'dot':dot}
    anchor=info['anchor'];error=0
    for r in info['frames']:
        state,direction=r['animation'].rsplit('_',1);select(state,direction,r['source_frame'])
        p=world_to_camera_view(scene,scene.camera,Vector((0,0,0)))
        error=max(error,max(abs(p.x-anchor['x']),abs(1-p.y-anchor['y']))*128)
    assert error<.001
    assert all(not o.data.use_shadow for o in scene.objects if o.type=='LIGHT')
    visible={o.name for o in scene.objects if o.type=='MESH' and not o.hide_render}
    assert visible=={meshes[0].name,meshes[0].name+'_outline'},('unexpected ground/extra geometry',visible)
    r={'id':job['name'],'ok':True,'model_sha256':hashlib.sha256(Path(job['model']).read_bytes()).hexdigest(),'checked_meshes':[o.name for o in meshes],'skinned_clip_motion':motion,'direction_vectors':vectors,'frames_checked':len(info['frames']),'max_ground_error_px':error,'bone_head_motion_world':bone_motion,'vertices':sum(len(o.data.vertices) for o in meshes),'bones':list(rig.pose.bones.keys()),'min_idle_vertex_z':idle_floor,'no_ground_mesh':True,'no_baked_shadow':True}
    results.append(r);print('SOURCE_RESULT',json.dumps(r),flush=True)
Path(cfg['source']).parent.joinpath('source-validation.json').write_text(json.dumps({'ok':True,'results':results},indent=2))
