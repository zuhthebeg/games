"""Windows Blender: full P5-B, uncut clothed body; AA1 depth holdout.
No new character/wardrobe assets. All offline binaries stay outside repository.
"""
import bpy,bmesh,json,math,sys,time
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];cfg=json.loads(Path(args[0]).read_text())
root=Path(cfg['offline']);root.mkdir(parents=True,exist_ok=True)
source=Path(cfg['source']); original=source/'KayKit-Character-Pack-Adventures-1.0-main/addons/kaykit_character_pack_adventures/Characters/gltf'
report=[]
def emission(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=True;n=m.node_tree.nodes;n.clear();s=n.new('ShaderNodeEmission');s.inputs[0].default_value=(*color,1);out=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(s.outputs[0],out.inputs['Surface']);return m
def outline(obj,ink):
 hull=obj.copy();hull.data=obj.data.copy();hull.name=obj.name+'_outline';bpy.context.collection.objects.link(hull)
 mesh=bmesh.new();mesh.from_mesh(hull.data);bmesh.ops.reverse_faces(mesh,faces=list(mesh.faces));mesh.to_mesh(hull.data);mesh.free()
 hull.data.materials.clear();hull.data.materials.append(ink)
 for p in hull.data.polygons:p.material_index=0
 mod=hull.modifiers.new('outline expansion','DISPLACE');mod.strength=-.008/(sum(abs(v) for v in obj.matrix_world.to_scale())/3);mod.mid_level=0;mod.direction='NORMAL'
 return hull
for kit in cfg['kits']:
 name=kit['name']
 if '--only' in args and name!=args[args.index('--only')+1]:continue
 start=time.perf_counter();bpy.ops.wm.open_mainfile(filepath=str(source/(name+'-baked.blend')));scene=bpy.context.scene
 rig=next(o for o in scene.objects if o.type=='ARMATURE');facing=bpy.data.objects['Facing'];scene.eevee.taa_render_samples=1
 scene.render.resolution_x=scene.render.resolution_y=128;scene.render.resolution_percentage=100
 target=Vector((0,-.16177570819854736,.9644706845283508));pitch=math.radians(40)
 scene.camera.location=target+Vector((0,-6*math.cos(pitch),6*math.sin(pitch)));scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=5.277437210083008
 meshes=[o for o in scene.objects if o.type=='MESH'];body=[o for o in meshes if o.name.startswith(('Knight_Head','Knight_Body','Knight_Arm','Knight_Leg','Knight_Cape'))]
 heads={'none':[], 'knight':[o for o in meshes if o.name.startswith('Knight_Helmet')]};ink=bpy.data.materials['outline ink'];binding=[]
 for donor,key in [('Barbarian','barbarian'),('Mage','mage')]:
  previous=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(original/(donor+'.glb')));added=set(scene.objects)-previous;other=next(o for o in added if o.type=='ARMATURE')
  err=max(max(abs(other.data.bones[b.name].matrix_local[r][c]-b.matrix_local[r][c]) for r in range(4) for c in range(4)) for b in rig.data.bones);assert err<1e-4
  obj=next(o for o in added if o.name==donor+'_Hat');basis=obj.matrix_basis.copy();obj.parent=rig;obj.matrix_basis=basis
  for mod in obj.modifiers:
   if mod.type=='ARMATURE':mod.object=rig
  heads[key]=[obj,outline(obj,ink)];binding.append({'donor':donor,'rest_error':err,'joints':len(rig.data.bones)})
  for o in added:
   if o!=obj:bpy.data.objects.remove(o,do_unlink=True)
 wp={'hero-sword':('1H_Sword',),'hero-bow':('longbow','bowstring'),'hero-focus':('staff shaft','staff crown','staff crystal')}[name]
 primary=[o for o in meshes if o.name.startswith(wp)];weapons={'standard':primary};alternate=[]
 if name=='hero-sword':
  reference=bpy.data.objects['1H_Sword']
  # Original procedural maul in the same grip coordinate system (not a paid model).
  for label,center,scale,mat in [('shaft',(0,0,.25),(.065,.065,.62),reference.data.materials[0]),('hammer',(0,0,.92),(.37,.18,.23),reference.data.materials[0])]:
   bpy.ops.mesh.primitive_cube_add();obj=bpy.context.object;obj.name='P5 maul '+label
   for v in obj.data.vertices:v.co=Vector((v.co.x*scale[0],v.co.y*scale[1],v.co.z*scale[2]))+Vector(center)
   obj.parent=rig;obj.parent_type='BONE';obj.parent_bone=reference.parent_bone;obj.matrix_basis=reference.matrix_basis.copy();obj.data.materials.append(mat);alternate.extend([obj,outline(obj,ink)])
 else:
  for obj in primary:
   clone=obj.copy();clone.data=obj.data.copy();clone.name='P5 compact '+obj.name;bpy.context.collection.objects.link(clone)
   # Geometry, not sprite scaling: preserve grip and animation; shorten local Z.
   for v in clone.data.vertices:v.co.z*=.68
   alternate.append(clone)
 weapons['alternate']=alternate
 meshes=[o for o in scene.objects if o.type=='MESH'];original_mats={o:tuple(o.data.materials) for o in meshes};original_indices={o:[p.material_index for p in o.data.polygons] for o in meshes}
 hold=bpy.data.materials.new('P5 depth holdout');hold.use_nodes=True;hold.use_backface_culling=True;n=hold.node_tree.nodes;n.clear();s=n.new('ShaderNodeHoldout');out=n.new('ShaderNodeOutputMaterial');hold.node_tree.links.new(s.outputs[0],out.inputs['Surface'])
 mask_mats=[emission('mask '+str(i),c) for i,c in enumerate([(0,0,0),(1,0,0),(0,1,0),(0,0,1)])];mask_indices={}
 for obj in body:
  ids=[];regions={slot:{vg.index for vg in obj.vertex_groups if vg.name in names} for slot,names in [(2,['wrist.l','hand.l','wrist.r','hand.r']),(3,['foot.l','toes.l','foot.r','toes.r'])]}
  for p in obj.data.polygons:
   index=0 if 'Head' in obj.name or obj.name.endswith('_outline') else 1
   if index:
    for slot,group in regions.items():
     score=sum(sum(g.weight for g in obj.data.vertices[v].groups if g.group in group) for v in p.vertices)/len(p.vertices)
     if score>=.5:index=slot
   ids.append(index)
  mask_indices[obj]=ids
 def render(path,visible,occluders=(),mask=False):
  if path.exists():return
  for o in meshes:
   o.hide_render=o not in visible and o not in occluders;o.data.materials.clear()
   mats=[hold] if o in occluders else mask_mats if mask and o in body else original_mats[o]
   for m in mats:o.data.materials.append(m)
   for p,i in zip(o.data.polygons,mask_indices[o] if mask and o in body else original_indices[o]):p.material_index=0 if o in occluders else i
  scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
 action=bpy.data.actions['T-Pose'];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];scene.frame_set(0);bpy.context.view_layer.update();defaults={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
 records=json.loads((Path(cfg['original_frames'])/name/'frames.json').read_text())['frames'];folder=root/'frames'/name;folder.mkdir(parents=True,exist_ok=True)
 for layer in ['base','mask']+['head-'+k for k in heads if k!='none']+[f'weapon-{w}-{h}' for w in weapons for h in heads]+[f'reference-{w}-{h}' for w in weapons for h in heads]: (folder/layer).mkdir(exist_ok=True)
 for r in records:
  for bone in rig.pose.bones:bone.matrix_basis=defaults[bone.name]
  clip=bpy.data.actions[r['source']];assert clip.name!='T-Pose';rig.animation_data.action=clip;rig.animation_data.action_slot=clip.slots[0];sf=r['source_frame'];scene.frame_set(math.floor(sf),subframe=sf%1);facing.rotation_euler.z=math.radians(cfg['directions'][r['name'].split('_')[1]]);bpy.context.view_layer.update()
  filename=r['name']+'.png';render(folder/'base'/filename,body);render(folder/'mask'/filename,body,mask=True)
  for h,head in heads.items():
   if head:render(folder/('head-'+h)/filename,head,body)
   for w,weapon in weapons.items():
    render(folder/f'weapon-{w}-{h}'/filename,weapon,body+head);render(folder/f'reference-{w}-{h}'/filename,body+head+weapon)
 info={'kit':name,'frames':records,'camera':{'ortho_scale':scene.camera.data.ortho_scale,'anchor':{'x':.5,'y':.6202935874462128}},'binding':binding,'aa':1,'body':'uncut original Knight meshes, no wardrobe','heads':list(heads),'weapons':list(weapons),'seconds':time.perf_counter()-start}
 (folder/'frames.json').write_text(json.dumps(info,indent=2));report.append(info);(root/'bake-summary.json').write_text(json.dumps(report,indent=2))
