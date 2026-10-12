"""Run Blender on saved original source; evaluate actual object keyframes/ground support."""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Vector
c=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text()); root=Path(c['source']); bpy.ops.wm.open_mainfile(filepath=str(root/'original-copper-dragon.blend'))
s=bpy.context.scene; names=[o.name for o in bpy.data.objects]; paws=[o for o in bpy.data.objects if 'grounded paw' in o.name]; wings=[o for o in bpy.data.objects if o.name.startswith('Membranous wing')]; legs=[o for o in bpy.data.objects if o.type=='EMPTY' and ' leg ' in o.name]
assert len(paws)==len(legs)==4 and len(wings)==2
samples=[]; motion={}; starts={a:i*30+1 for i,a in enumerate(c['frame_counts'])}
for a,n in c['frame_counts'].items():
 poses=[]
 for i in range(n):
  s.frame_set(starts[a]+i); bpy.context.view_layer.update(); poses.append([v for o in bpy.data.objects if o.type=='MESH' for v in tuple(o.matrix_world@o.data.vertices[0].co)])
  if a=='idle': samples.append([list(o.matrix_world.translation) for o in paws])
 motion[a]=max(math.dist(poses[0],p) for p in poses); assert motion[a]>.001,(a,'source frozen')
foot_drift=max(math.dist(samples[0][i],sample[i]) for sample in samples for i in range(4)); assert foot_drift<1e-7
foot_min=[]
s.frame_set(1)
for p in paws: foot_min.append(min((p.matrix_world@v.co).z for v in p.data.vertices))
assert all(-.01<=z<=.02 for z in foot_min),foot_min
assert len([o for o in bpy.data.objects if 'claw' in o.name and ('Fore' in o.name or 'Hind' in o.name)])==12
proof={'ok':True,'original_meshes':len([o for o in bpy.data.objects if o.type=='MESH']),'separate_legs':len(legs),'membrane_wings':len(wings),'idle_paw_world_drift':foot_drift,'idle_paw_min_world_z':foot_min,'source_clip_mesh_motion':motion,'clip_start_frames':starts,'source_type':'original procedural object-keyed meshes','imported_armatures':len([o for o in bpy.data.objects if o.type=='ARMATURE'])}
(root.parent/'source-validation.json').write_text(json.dumps(proof,indent=2)); print(json.dumps(proof,indent=2))
