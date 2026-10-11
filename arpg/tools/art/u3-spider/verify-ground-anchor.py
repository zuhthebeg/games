"""Read-only Blender ground-anchor diagnosis; no renders, source saves or screenshots.
Run Blender --python this_file -- offline/config.json. Prints JSON evidence.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
config = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())
job = config['characters'][0]
info = json.loads((Path(config['output']) / job['name'] / 'frames.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=job['model'])
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
defaults = {b.name:b.matrix_basis.copy() for b in rig.pose.bones}
bpy.ops.wm.open_mainfile(filepath=str(Path(config['source']) / (job['name']+'-baked.blend')))
scene=bpy.context.scene;camera=scene.camera;rig=next(o for o in scene.objects if o.type=='ARMATURE');root=bpy.data.objects['Facing']
meshes=[o.name for o in scene.objects if o.type=='MESH' and not o.hide_render]
assert set(meshes)=={'Cube','Cube_outline'}, meshes
assert all(not o.data.use_shadow for o in scene.objects if o.type=='LIGHT')
def anchor():
    v=world_to_camera_view(scene,camera,Vector((0,0,0)))
    return {'x':v.x,'y':1-v.y}
def set_camera(target):
    pitch=math.radians(config['pitch'])
    camera.location=target+Vector((0,-6*math.cos(pitch),6*math.sin(pitch)))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
# Project the saved final camera, independently of the raw metadata's stored anchor.
set_camera(Vector(info['framing']['target']));bpy.context.view_layer.update()
old=info['anchor'];correct=anchor()
assert correct['y']-old['y']>.12
samples=[]
for record in info['frames']:
    state,direction=record['animation'].rsplit('_',1)
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.matrix_basis=defaults[bone.name].copy()
    action=bpy.data.actions[job['animations'][state]];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    root.rotation_euler.z=math.radians(config['directions'][direction])
    t=record['source_frame'];scene.frame_set(math.floor(t),subframe=t%1)
    rig.location.x=rig.location.y=0;bpy.context.view_layer.update()
    a=anchor();assert max(abs(a[k]-correct[k]) for k in ('x','y'))<1e-6
    body=rig.matrix_world@rig.pose.bones['Body'].head;body.z=0
    v=world_to_camera_view(scene,camera,body)
    samples.append({'animation':record['animation'],'groundOffsetPx':[(v.x-a['x'])*128,(1-v.y-a['y'])*128]})
report={'old_anchor':old,'correct_anchor':correct,'delta_px':(correct['y']-old['y'])*128,'visible_meshes':meshes,'baked_ground_shadow':False,'light_shadows':False,'samples':len(samples),'max_body_ground_offset_px':max(math.hypot(*s['groundOffsetPx']) for s in samples),'states_directions':sorted(set(s['animation'] for s in samples)),'screenshots':0}
print('GROUND_ANCHOR_JSON '+json.dumps(report))
