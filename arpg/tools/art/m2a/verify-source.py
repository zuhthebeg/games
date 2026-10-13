"""Read-only reopened-blend geometry, anatomy and ground proof (Windows Blender).
Independent of bake's per-frame pose counters; originals/prepared GLBs are hashed.
"""
import bpy,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
config=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
reports=[]
for job in config['characters']:
    name=job['name'];info=json.loads((Path(config['output'])/name/'frames.json').read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=job['model'])
    imported=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    defaults={b.name:b.matrix_basis.copy() for b in imported.pose.bones}
    bpy.ops.wm.open_mainfile(filepath=str(Path(config['source'])/(name+'-baked.blend')))
    scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE');root=bpy.data.objects['Facing']
    skinned=[bpy.data.objects[n] for n in info['pose_check']['skinned_objects']]
    assert skinned and all(any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers) for o in skinned)
    def select(state,direction,frame):
        rig.animation_data.action=None
        for b in rig.pose.bones:b.matrix_basis=defaults[b.name].copy()
        a=bpy.data.actions[job['animations'][state]];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
        root.rotation_euler.z=math.radians(config['directions'][direction]+job.get('facing_offset',0))
        scene.frame_set(math.floor(frame),subframe=frame%1);rig.location.x=rig.location.y=0;bpy.context.view_layer.update()
    def points():
        dg=bpy.context.evaluated_depsgraph_get();v=[]
        for o in skinned:
            obj=o.evaluated_get(dg);mesh=obj.to_mesh();v.extend(obj.matrix_world@p.co for p in mesh.vertices);obj.to_mesh_clear()
        return v
    motion={};wing_motion={};min_idle_z=float('inf');root_positions=[]
    for state in job['animations']:
        samples=[];wings=[]
        for r in [r for r in info['frames'] if r['animation']==state+'_E']:
            select(state,'E',r['source_frame']);samples.append(points())
            root_positions.append(rig.matrix_world@rig.pose.bones[job['root_bones'][0] if job['root_bones'] else 'Root'].head)
            if state=='idle':min_idle_z=min(min_idle_z,min(p.z for p in samples[-1]))
            if name=='bat':wings.append({n:rig.pose.bones[n].matrix_basis.to_quaternion().copy() for n in ['Wing1.L','Wing1.R','Wing2.L','Wing2.R']})
        rms=max(math.sqrt(sum((a-b).length_squared for a,b in zip(samples[0],p))/len(p)) for p in samples)
        assert rms>.001,(name,state,'static skin',rms)
        motion[state]={'source':job['animations'][state],'samples':len(samples),'max_skinned_rms_world':rms}
        if state=='idle' and name=='bat':
            wing_motion={n:max(wings[0][n].rotation_difference(w[n]).angle for w in wings) for n in wings[0]}
            assert all(v>.001 for v in wing_motion.values())
    # Anatomical facing is verified from head/neck (humanoid, ghost) and nose/body (bat),
    # not merely different textures or the configured Facing object.
    vectors={};a,b=('Nose','Body') if name=='bat' else ('Head','Neck')
    for direction,angle in config['directions'].items():
        select('idle',direction,0)
        v=(rig.matrix_world@rig.pose.bones[a].head)-(rig.matrix_world@rig.pose.bones[b].head);v.z=0;v.normalize()
        expected=Vector((math.cos(math.radians(angle-90)),math.sin(math.radians(angle-90)),0))
        dot=v.dot(expected);assert dot>.9,(name,direction,'anatomical facing',dot)
        vectors[direction]={'bones':[a,b],'anatomical_xy':list(v)[:2],'expected_xy':list(expected)[:2],'dot':dot}
    if name=='bat':assert min_idle_z>0,(name,'bat must hover above anchor',min_idle_z)
    camera=scene.camera;assert camera.data.type=='ORTHO';assert abs(camera.data.ortho_scale-info['framing']['ortho_scale'])<1e-6
    bpy.context.view_layer.update();origin=camera.matrix_world.inverted()@Vector((0,0,0))
    anchor={'x':.5+origin.x/camera.data.ortho_scale,'y':.5-origin.y/camera.data.ortho_scale}
    assert max(abs(anchor[k]-info['anchor'][k]) for k in anchor)<1e-6
    assert all(not o.data.use_shadow for o in scene.objects if o.type=='LIGHT')
    visible=[o.name for o in scene.objects if o.type=='MESH' and not o.hide_render]
    assert all(not any(s in n.lower() for s in ['ground','shadow','plane']) for n in visible)
    max_error=0
    for record in info['frames']:
        state,direction=record['animation'].rsplit('_',1);select(state,direction,record['source_frame'])
        p=world_to_camera_view(scene,camera,Vector((0,0,0)));error=max(abs(p.x-anchor['x']),abs(1-p.y-anchor['y']))*config['frame_size'];assert error<.001
        max_error=max(error,max_error)
    report={'id':name,'ok':True,'model_sha256':hashlib.sha256(Path(job['model']).read_bytes()).hexdigest(),'original_sha256':hashlib.sha256((Path(config['source'])/(name+'.glb')).read_bytes()).hexdigest(),'checked_meshes':[o.name for o in skinned],'skinned_clip_motion':motion,'direction_vectors':vectors,'wing_motion_radians':wing_motion,'min_idle_vertex_z':min_idle_z,'frames_checked':len(info['frames']),'ground_anchor':anchor,'max_ground_error_px':max_error,'baked_ground_shadow':False,'light_shadows':False}
    reports.append(report)
    print('SOURCE_RESULT',json.dumps(report),flush=True)
Path(config['source']).parent.joinpath('source-validation.json').write_text(json.dumps({'ok':True,'results':reports},indent=2))
