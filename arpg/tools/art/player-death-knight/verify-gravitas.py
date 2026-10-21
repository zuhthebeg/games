"""Independent source reopen, all delivered poses and source-derived hand sockets.
blender -b --python verify-gravitas.py -- C:/.../deathknight-gravitas
"""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view
root=Path(sys.argv[sys.argv.index('--')+1]);source=root/'source/player-death-knight-source.blend'
bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene
rig=next(o for o in scene.objects if o.type=='ARMATURE');facing=bpy.data.objects['Facing']
info=json.loads((root/'frames/player-death-knight/frames.json').read_text());default={n:Matrix(v) for n,v in json.loads(rig['default_basis_json']).items()}
angles={'E':90,'SE':45,'S':0,'SW':-45,'W':-90,'NW':-135,'N':180,'NE':135};sockets={};measure=[]
for rec in info['frames']:
 rig.animation_data.action=None
 for b in rig.pose.bones:b.matrix_basis=default[b.name].copy()
 clip=bpy.data.actions[rec['source']];rig.animation_data.action=clip;rig.animation_data.action_slot=clip.slots[0]
 facing.rotation_euler.z=math.radians(angles[rec['animation'].rsplit('_',1)[1]])
 f=rec['source_frame'];scene.frame_set(math.floor(f),subframe=f%1);bpy.context.view_layer.update()
 points={}
 for side in ['l','r']:
  p=world_to_camera_view(scene,scene.camera,rig.matrix_world@rig.pose.bones['handslot.'+side].tail)
  points[side]=[round((p.x-info['anchor']['x'])*128,4),round((1-p.y-info['anchor']['y'])*128,4)]
 sockets.setdefault(rec['animation'],[]).append(points['l'])
 error=(bpy.data.objects['DK_blade_original'].matrix_world.translation-rig.matrix_world@rig.pose.bones['handslot.r'].tail).length
 assert error<.0001,(rec['name'],error)
 feet=[list(rig.matrix_world@rig.pose.bones['foot.'+s].head) for s in ['l','r']]
 measure.append({'name':rec['name'],'left':points['l'],'right':points['r'],'feet':feet,'grip_error':error})
# Actual source render, no generator execution.
facing.rotation_euler.z=math.radians(90);clip=bpy.data.actions['DK_Gravitas_attack'];rig.animation_data.action=clip;rig.animation_data.action_slot=clip.slots[0];scene.frame_set(12);bpy.context.view_layer.update();scene.render.filepath=str(root/'fixture-attack_E_006.png');bpy.ops.render.render(write_still=True)
(root/'source-derived-sockets.json').write_text(json.dumps({'coordinate_space':'pawn-local physical128; multiply entity atlasScale, NOT .5 sprite correction','anchor':info['anchor'],'groups':sockets},indent=2))
report={'status':'PASS','frames':len(measure),'groups':len(sockets),'max_grip_error':max(x['grip_error'] for x in measure),'source':str(source),'source_actions':[a.name for a in bpy.data.actions if a.name.startswith('DK_Gravitas_')],'measurements':measure}
(root/'gravitas-source-validation.json').write_text(json.dumps(report,indent=2));print('GRAVITAS_VERIFY_PASS',len(measure))
