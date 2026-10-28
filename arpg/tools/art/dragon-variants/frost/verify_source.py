"""Run inside Blender against generated .blend; checks actual source objects and keys."""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector
cfg=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
source=Path(cfg['source']);bpy.ops.wm.open_mainfile(filepath=str(source/'frost-dragon.blend'))
objects=list(bpy.data.objects)
assert sum(o.type=='MESH' for o in objects)==109
crystals=[o for o in objects if o.name.startswith('Frost ')]
assert len(crystals)==18
assert sum('leg ' in o.name for o in objects)==4
assert sum(o.name.startswith('Membranous wing ') for o in objects)==2
assert all(o.parent and len(o.data.vertices)>8 for o in crystals)
scene=bpy.context.scene
assert [m.name for m in scene.timeline_markers]==list(cfg['frame_counts'])
animated=[o for o in objects if o.animation_data and o.animation_data.action]
assert len(animated)==9
# First keyed idle pose: exact four grounded paw mesh bottoms, no per-frame re-centering.
scene.frame_set(1)
paws=[o for o in objects if 'grounded paw' in o.name]
assert len(paws)==4
bottoms=[min((o.matrix_world@v.co).z for v in o.data.vertices) for o in paws]
assert all(abs(z)<.02 for z in bottoms),bottoms
for name,color in cfg['variant']['palette'].items():
 actual=bpy.data.materials[name].diffuse_color
 assert all(abs(actual[i]-color[i])<1e-5 for i in range(3))
result=dict(status='PASS',mesh_objects=109,crystals=18,animated_objects=len(animated),idle_paw_bottoms=bottoms,states=list(cfg['frame_counts']))
(source/'source-validation.json').write_text(json.dumps(result,indent=2))
print('FROST_SOURCE_PASS',json.dumps(result))
