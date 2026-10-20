import bpy,json,math,argparse,sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
parser=argparse.ArgumentParser(description='Export left-hand sockets without rendering or modifying source blends. Requires existing original bake records and scenes.')
parser.add_argument('--art-root',default='C:/Users/user/ai-tools/arpg-art')
parser.add_argument('--output',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=Path(args.art_root)
angles={'E':90,'SE':45,'S':0,'SW':-45,'W':-90,'NW':-135,'N':180,'NE':135}
result={}
for kit,scene_file,record_file in [('atlas-blade',root/'source/hero-sword-baked.blend',root/'output/frames/hero-sword/frames.json'),('atlas-focus',root/'source/hero-focus-baked.blend',root/'output/frames/hero-focus/frames.json'),('blade',root/'p4-paperdoll/hero-sword-paperdoll.blend',root/'output/frames/hero-sword/frames.json'),('focus',root/'p4-paperdoll/hero-focus-paperdoll.blend',root/'output/frames/hero-focus/frames.json'),('skeleton',root/'player-skeleton-equipment/source/player-skeleton-equipment-baked.blend',root/'player-skeleton-equipment/frames/player-skeleton-equipment/frames.json')]:
 bpy.ops.wm.open_mainfile(filepath=str(scene_file));scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE');facing=bpy.data.objects['Facing'];camera=scene.camera
 action=bpy.data.actions['T-Pose'];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];scene.frame_set(0);bpy.context.view_layer.update();defaults={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
 origin=world_to_camera_view(scene,camera,Vector());groups={}
 for r in json.loads(record_file.read_text())['frames']:
  for b in rig.pose.bones:b.matrix_basis=defaults[b.name]
  clip=bpy.data.actions[r['source']];rig.animation_data.action=clip;rig.animation_data.action_slot=clip.slots[0];sf=r['source_frame'];scene.frame_set(math.floor(sf),subframe=sf%1);direction=r['name'].split('_')[1];facing.rotation_euler.z=math.radians(angles[direction]);bpy.context.view_layer.update()
  hand=world_to_camera_view(scene,camera,rig.matrix_world@rig.pose.bones['handslot.l'].tail)
  group='_'.join(r['name'].split('_')[:2]);groups.setdefault(group,[]).append([round((hand.x-origin.x)*128,2),round((origin.y-hand.y)*128,2)])
 result[kit]=groups
 print('EXPORTED',kit,sum(map(len,groups.values())),flush=True)
data=json.dumps(result,separators=(',',':'))
Path(args.output).write_text('// Generated from original CC0 rig handslot.l, original camera, sparse-pose reset and exact delivered frame samples.\n// Reproduce with tools/art/export-shield-anchors.py; pawn-local pixels, before entity sizeScale.\nexport const SHIELD_HAND_ANCHORS = '+data+';\n')
