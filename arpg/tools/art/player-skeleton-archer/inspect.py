import bpy,json
from pathlib import Path
from mathutils import Vector
p=Path('C:/Users/user/ai-tools/arpg-art/player-skeleton-archer')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='C:/Users/user/ai-tools/arpg-art/source/KayKit-Character-Pack-Skeletons-1.0-main/addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Rogue.glb')
r=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
for t in r.animation_data.nla_tracks:t.mute=True
r.animation_data.use_nla=False
base={b.name:b.matrix_basis.copy() for b in r.pose.bones}
data={'rig':list(map(list,r.matrix_world)), 'meshes':[{'name':o.name,'vertices':len(o.data.vertices),'skin':[(m.type,m.object.name if m.type=='ARMATURE' else None) for m in o.modifiers]} for o in bpy.context.scene.objects if o.type=='MESH'],'bones':[{ 'name':b.name,'parent':b.parent.name if b.parent else None,'head':list(r.matrix_world@b.head),'tail':list(r.matrix_world@b.tail)} for b in r.pose.bones],'clips':{}}
for n in ['Idle','2H_Ranged_Aiming','2H_Ranged_Shoot','2H_Ranged_Shooting','Dodge_Backward','Dodge_Left','Death_A']:
 a=bpy.data.actions.get(n);r.animation_data.action=a;r.animation_data.action_slot=a.slots[0]
 rows=[]
 for f in [a.frame_range[0],sum(a.frame_range)/2,a.frame_range[1]]:
  for b in r.pose.bones:b.matrix_basis=base[b.name].copy()
  bpy.context.scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
  rows.append({'frame':f,**{b:list(r.matrix_world@r.pose.bones[b].tail) for b in ['handslot.l','handslot.r','upperarm.l','upperarm.r','lowerarm.l','lowerarm.r','head','root'] if b in r.pose.bones}})
 data['clips'][n]={'range':list(a.frame_range),'samples':rows}
(p/'inspection.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
print('INSPECT_DONE',flush=True)
