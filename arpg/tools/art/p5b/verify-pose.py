"""Windows Blender, independent full-frame skinned geometry and no-T-pose gate."""
import bpy,json,math,sys
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]);source=root.parent/'source';report=[]
def points(objects):
 dg=bpy.context.evaluated_depsgraph_get();result=[]
 for o in objects:
  e=o.evaluated_get(dg);m=e.to_mesh();result.extend(v.co.copy() for v in m.vertices);e.to_mesh_clear()
 return result
for name in ['hero-sword','hero-bow','hero-focus']:
 bpy.ops.wm.open_mainfile(filepath=str(source/(name+'-baked.blend')));scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE')
 skin=[o for o in scene.objects if o.type=='MESH' and not o.name.endswith('_outline') and o.name.startswith(('Knight_Body','Knight_Arm','Knight_Leg'))]
 assert len(skin)==5 and all(any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers) for o in skin)
 action=bpy.data.actions['T-Pose'];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];scene.frame_set(0);bpy.context.view_layer.update();defaults={b.name:b.matrix_basis.copy() for b in rig.pose.bones};bind=points(skin)
 records=json.loads((root.parent/'output'/'frames'/name/'frames.json').read_text())['frames'];rows=[]
 for r in records:
  for b in rig.pose.bones:b.matrix_basis=defaults[b.name]
  action=bpy.data.actions[r['source']];assert action.name!='T-Pose';rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];sf=r['source_frame'];scene.frame_set(math.floor(sf),subframe=sf%1);bpy.context.view_layer.update()
  angle=max(math.degrees(rig.pose.bones[n].matrix_basis.to_quaternion().rotation_difference(defaults[n].to_quaternion()).angle) for n in ['upperarm.l','upperarm.r'])
  posed=points(skin);assert len(posed)==len(bind);rms=math.sqrt(sum((a-b).length_squared for a,b in zip(posed,bind))/len(bind))/2.301
  assert angle>10 and rms>.015,(name,r['name'],angle,rms)
  rows.append({'frame':r['name'],'armDegrees':angle,'skinRMSHeight':rms})
 report.append({'kit':name,'checked':len(rows),'tPoses':0,'frozenSkin':0,'minArmDegrees':min(r['armDegrees'] for r in rows),'minSkinRMSHeight':min(r['skinRMSHeight'] for r in rows),'rows':rows})
(root/'pose-validation.json').write_text(json.dumps(report,indent=2));print('P5-B independent skin/pose PASS')
