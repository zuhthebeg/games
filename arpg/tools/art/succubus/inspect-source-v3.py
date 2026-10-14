"""Independent .blend source/rig inspection. Windows Blender -b --python this file.
No source edits, no rendering. Exits nonzero on missing rig/coverage/action channels.
"""
import bpy,json,sys,hashlib
from pathlib import Path
cfg=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
root=Path(cfg['source']).parent
bpy.ops.wm.open_mainfile(filepath=str(root/'source/original-adult-succubus.blend'))
rig=bpy.data.objects['Succubus_Rig'];assert rig.type=='ARMATURE';assert len(rig.data.bones)==19,len(rig.data.bones)
markers={x.name:x.frame for x in bpy.context.scene.timeline_markers};assert list(markers)==['idle','run','attack','hit','death']
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
shell=bpy.data.objects['Connected opaque fitted garment shell']
assert len(shell.data.vertices)>1000
assert len(shell.vertex_groups)==15
# Require one welded component, rather than disconnected armor sections.
adj=[[] for v in shell.data.vertices]
for e in shell.data.edges:
 a,b=e.vertices;adj[a].append(b);adj[b].append(a)
seen={0};stack=[0]
while stack:
 for n in adj[stack.pop()]:
  if n not in seen:seen.add(n);stack.append(n)
assert len(seen)==len(adj),(len(seen),len(adj))
blended=0
for v in shell.data.vertices:
 assert abs(sum(g.weight for g in v.groups)-1)<1e-5
 assert len(v.groups)==2
 if min(g.weight for g in v.groups)>.05:blended+=1
assert blended>len(shell.data.vertices)*.25
for ob in meshes:
 assert ob.parent==rig,ob.name
 assert any(m.type=='ARMATURE' and m.object==rig for m in ob.modifiers),ob.name
 assert len(ob.vertex_groups)>0,ob.name
 for m in ob.data.materials:
  assert m.diffuse_color[3]==1
  assert m.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value==1
# Blender 5.2 layered actions: inspect actual channel bags, not obsolete fcurves.
a=rig.animation_data.action;curves=[]
for layer in a.layers:
 for strip in layer.strips:
  for bag in strip.channelbags:curves.extend(bag.fcurves)
assert len(curves)==117,len(curves)
paths={c.data_path for c in curves};assert any('thigh.L' in p for p in paths);assert any('wing.R' in p for p in paths);assert any('tail' in p for p in paths)
# Reopen the saved action and match every keyed source pose to bake records.
records=json.loads((root/'frames/succubus/frames.json').read_text())['frames']
source_clips={}
for anim,n in cfg['frame_counts'].items():
 poses=[];surfaces=[]
 for i in range(n):
  bpy.context.scene.frame_set(markers[anim]+i);bpy.context.view_layer.update()
  expected=next(r for r in records if r['name']==f'{anim}_S_{i:03d}')
  for name,rotation in expected['bone_rotations'].items():
   assert all(abs(x-y)<1e-5 for x,y in zip(rig.pose.bones[name].rotation_euler,rotation)),(anim,i,name)
  poses.append(hashlib.sha256(json.dumps({b.name:list(b.rotation_euler) for b in rig.pose.bones},sort_keys=True).encode()).hexdigest())
  dg=bpy.context.evaluated_depsgraph_get();ev=shell.evaluated_get(dg);me=ev.to_mesh()
  surfaces.append(hashlib.sha256(json.dumps([list(ev.matrix_world@v.co) for v in me.vertices]).encode()).hexdigest());ev.to_mesh_clear()
 assert len(set(poses))>1 and len(set(surfaces))>1,anim
 source_clips[anim]={'keyed_pose_hashes':poses,'unique_keyed_poses':len(set(poses)),'unique_deformed_garment_surfaces':len(set(surfaces))}
result={'ok':True,'bones':len(rig.data.bones),'mesh_objects':len(meshes),'keyed_channels':len(curves),'markers':markers,'all_meshes_rigged':True,'all_materials_opaque':True,'imports':[],'connected_garment_vertices':len(shell.data.vertices),'connected_garment_components':1,'blended_vertices':blended,'normalized_garment_weights':True,'source_clips':source_clips,'exact_source_bone_samples':sum(cfg['frame_counts'].values()),'source_blend_sha256':hashlib.sha256((root/'source/original-adult-succubus.blend').read_bytes()).hexdigest()}
Path(cfg['audit_output']).write_text(json.dumps(result,indent=2));print('SOURCE_VALIDATION',json.dumps(result),flush=True)
