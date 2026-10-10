"""B alternative: fixed clothed base + depth-masked head/weapon overlays.
Representative middle idle/attack pose × 8 dirs × 3 kits × 3 hats only.
Uses Blender Holdout shader for occlusion, not a guessed direction order.
"""
import bpy,json,sys,math,time
from pathlib import Path
cfg=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());root=Path(cfg['offline'])
assert root.as_posix().lower()=='c:/users/user/ai-tools/arpg-art/p4-paperdoll'
summary=[];tag=cfg.get('partial_tag','partial');assert tag in ['partial','partial-hard']
for kit in cfg['kits']:
 name=kit['name'];bpy.ops.wm.open_mainfile(filepath=str(root/(name+'-paperdoll.blend')));scene=bpy.context.scene
 scene.eevee.taa_render_samples=cfg.get('partial_samples',16)
 rig=next(o for o in scene.objects if o.type=='ARMATURE');facing=bpy.data.objects['Facing']
 meshes=[o for o in scene.objects if o.type=='MESH'];original={o:tuple(o.data.materials) for o in meshes}
 hold=bpy.data.materials.new('P4 depth holdout');hold.use_nodes=True;hold.use_backface_culling=True;n=hold.node_tree.nodes;n.clear();shader=n.new('ShaderNodeHoldout');out=n.new('ShaderNodeOutputMaterial');hold.node_tree.links.new(shader.outputs[0],out.inputs['Surface'])
 body=[o for o in meshes if o.name.startswith(('Knight_Head','Knight_Body','Knight_Arm','Knight_Leg'))]
 heads={key:[o for o in meshes if o.name.startswith(prefix)] for key,prefix in [('knight','Knight_Helmet'),('barbarian','Barbarian_Hat'),('mage','Mage_Hat')]}
 weaponprefix={'hero-sword':('1H_Sword',),'hero-bow':('longbow','bowstring'),'hero-focus':('staff shaft','staff crown','staff crystal')}[name]
 weapon=[o for o in meshes if o.name.startswith(weaponprefix)]
 assert body and weapon and all(heads.values())
 action=bpy.data.actions['T-Pose'];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];scene.frame_set(0);bpy.context.view_layer.update();defaults={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
 records=json.loads((root/'frames'/name/'frames.json').read_text())['frames'];chosen=[]
 for anim in ['idle','attack']:
  for direction in cfg['directions']:
   seq=[r for r in records if r['animation']==anim+'_'+direction];chosen.append(seq[len(seq)//2])
 folder=root/tag/name;folder.mkdir(parents=True,exist_ok=True);start=time.perf_counter()
 def render(filename,visible,occluders=()):
  for o in meshes:
   o.hide_render=o not in visible and o not in occluders
   o.data.materials.clear()
   if o in occluders:o.data.materials.append(hold)
   else:
    for m in original[o]:o.data.materials.append(m)
  scene.render.filepath=str(filename);bpy.ops.render.render(write_still=True)
 for r in chosen:
  for bone in rig.pose.bones:bone.matrix_basis=defaults[bone.name]
  clip=bpy.data.actions[r['source']];rig.animation_data.action=clip;rig.animation_data.action_slot=clip.slots[0];sf=r['source_frame'];scene.frame_set(math.floor(sf),subframe=sf%1);facing.rotation_euler.z=math.radians(cfg['directions'][r['name'].split('_')[1]]);bpy.context.view_layer.update()
  render(folder/(r['name']+'-base.png'),body)
  for key,head in heads.items():
   stem=r['name']+'-'+key
   render(folder/(stem+'-head.png'),head,body)
   render(folder/(stem+'-weapon.png'),weapon,body+head)
   render(folder/(stem+'-reference.png'),body+head+weapon)
 summary.append({'kit':name,'pose_records':chosen,'head_variants':list(heads),'seconds':time.perf_counter()-start,'taa_samples':scene.eevee.taa_render_samples,'method':'body + head(depth holdout against body) + weapon(depth holdout against body/head)'});(root/(tag+'-summary.json')).write_text(json.dumps(summary,indent=2))
