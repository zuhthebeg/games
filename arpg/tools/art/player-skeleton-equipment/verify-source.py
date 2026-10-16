"""Reopen real source and render direct assembled references, not atlas recolours.
Blender --python verify-source.py -- CONFIG
"""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Matrix
config=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text());root=Path(config['source']).parent
bpy.ops.wm.open_mainfile(filepath=str(Path(config['source'])/'player-skeleton-equipment-source.blend'))
s=bpy.context.scene;r=next(o for o in s.objects if o.type=='ARMATURE');facing=bpy.data.objects['Facing'];basis=json.loads(r['default_basis_json'])
info=json.loads((root/'frames/player-skeleton-equipment/frames.json').read_text());records={r['name']:r for r in info['frames']};job=config['characters'][0]
# Source-only validation removes inherited compositor file outputs; new renders stay offline.
s.render.use_compositing=False
refs=root/'direct-references';refs.mkdir(exist_ok=True);rows=[]
selected=[]
for state in ['idle','run','attack','hit','death','dodge']:
 for direction in config['directions']:
  group=[r for r in info['frames'] if r['animation']==state+'_'+direction];rec=group[len(group)//2]
  for mask in range(16):
   for weapon in ['sword','blunt']:selected.append((rec['name'],mask,weapon))
for name,mask,weapon in selected:
 rec=records[name];r.animation_data.action=None
 for b in r.pose.bones:b.matrix_basis=Matrix(basis[b.name])
 action=bpy.data.actions[rec['source']];r.animation_data.action=action;r.animation_data.action_slot=action.slots[0]
 direction=rec['animation'].split('_')[-1];facing.rotation_euler.z=math.radians(config['directions'][direction]);frame=rec['source_frame'];s.frame_set(math.floor(frame),subframe=frame%1)
 layers=['base',weapon]+[slot for i,slot in enumerate(['hands','feet','body','head']) if mask&(1<<i)]
 for o in s.objects:
  if o.type=='MESH':o.hide_render=o.get('equipment_layer') not in layers
 bpy.context.view_layer.update();filename=name+'-'+str(mask)+'-'+weapon+'.png';s.render.filepath=str(refs/filename);bpy.ops.render.render(write_still=True)
 rows.append({'name':name,'mask':mask,'weapon':weapon,'layers':layers,'image':filename})
(root/'direct-references.json').write_text(json.dumps(rows,indent=2));print('REAL_ASSEMBLED_REFERENCES',len(rows))
