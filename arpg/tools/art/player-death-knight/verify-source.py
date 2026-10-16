"""Reopen saved source independently; evaluate clips, skin, attachments, flames, envelope.
blender -b --factory-startup --python verify-source.py -- OFFLINE_ROOT
No generator execution; fixture renders are model renders, not browser screenshots.
"""
import bpy,json,math,sys,hashlib,struct
from pathlib import Path
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view
root=Path(sys.argv[sys.argv.index('--')+1]);config=json.loads((root/'config.json').read_text());job=config['characters'][0]
p=root/'source/player-death-knight-source.blend';bpy.ops.wm.open_mainfile(filepath=str(p))
s=bpy.context.scene;r=next(o for o in s.objects if o.type=='ARMATURE');facing=bpy.data.objects['Facing'];blade=bpy.data.objects['DK_blade_original']
default={n:Matrix(v) for n,v in json.loads(r['default_basis_json']).items()};primary=json.loads(r['primary_inventory_json']);body=[bpy.data.objects[n] for n,v in primary.items() if v['armature']]
assert len(r.data.bones)==41 and len(body)==8
for n,v in primary.items():
 o=bpy.data.objects[n];assert hashlib.sha256(b''.join(struct.pack('<3f',*x.co) for x in o.data.vertices)).hexdigest()==v['coordinate_sha256']
 assert any(m.type=='ARMATURE' and m.object==r for m in o.modifiers)
assert not bpy.data.objects.get('Skeleton_Warrior_Helmet')
flames=[o for o in s.objects if o.name.startswith('DK_Flame') and not o.name.endswith('_outline')];assert len(flames)==7
armor=[o for o in s.objects if o.name.startswith('DK_') and not o.name.endswith('_outline')]
assert len(armor)>40
hulls=[o for o in s.objects if o.name.endswith('_outline')]
assert len(hulls)==len(body)+len(armor)-len(flames)
for hull in hulls:
 original=bpy.data.objects[hull.name[:-8]]
 assert hull.parent==original.parent and hull.parent_bone==original.parent_bone
 assert any(m.type=='DISPLACE' and abs(abs(m.strength)-.008)<.00001 for m in hull.modifiers),hull.name
 assert len(hull.data.vertices)==len(original.data.vertices)
for name in ['DK red eye','DK flame orange','DK flame core']:
 shader=bpy.data.materials[name].node_tree.nodes.get('Principled BSDF');c=shader.inputs['Base Color'].default_value
 assert c[0]>.9 and c[0]>c[2]*10 and shader.inputs['Emission Strength'].default_value>=2

for o in armor:assert o.parent==r and o.parent_type=='BONE' and o.parent_bone in r.data.bones,o.name
for o in flames:assert o.data.shape_keys and o.data.shape_keys.animation_data.action

def sample(clip,t,angle):
 r.animation_data.action=None
 for b in r.pose.bones:b.matrix_basis=default[b.name].copy()
 a=bpy.data.actions[clip];r.animation_data.action=a;r.animation_data.action_slot=a.slots[0];facing.rotation_euler.z=math.radians(angle)
 s.frame_set(math.floor(t),subframe=t%1);r.location.x=r.location.y=0;bpy.context.view_layer.update()
def verts(o):
 dg=bpy.context.evaluated_depsgraph_get();e=o.evaluated_get(dg);m=e.to_mesh();v=[e.matrix_world@x.co for x in m.vertices];e.to_mesh_clear();return v
motion={}
for state,clip in job['animations'].items():
 a=bpy.data.actions[clip];lo,hi=a.frame_range;vs=[];fl=[]
 for t in [lo,(lo+hi)/2,hi]:
  sample(clip,t,0);vs.append([p for o in body for p in verts(o)]);fl.append([p for o in flames for p in verts(o)])
 rms=max(math.sqrt(sum((x-y).length_squared for x,y in zip(vs[0],v))/len(v)) for v in vs[1:]);assert rms>.001,(state,'static skin')
 motion[state]={'source':clip,'source_range':list(a.frame_range),'skin_rms_from_first':rms}
# Flame shape changes in weapon-local space, independent of hand motion.
values=[]
for t in [0,2,4]:
 sample('Idle',t,0);values.append([[k.value for k in o.data.shape_keys.key_blocks[1:]] for o in flames])
assert values[0]!=values[1]!=values[2]
info=json.loads((root/'frames/player-death-knight/frames.json').read_text());rows=[];bounds=[]
visible=[o for o in s.objects if o.type=='MESH' and not o.hide_render]
for rec in info['frames']:
 di=rec['animation'].rsplit('_',1)[1];sample(rec['source'],rec['source_frame'],config['directions'][di]);hand=r.matrix_world@r.pose.bones['handslot.r'].tail;err=(blade.matrix_world.translation-hand).length;assert err<.0001
 rootpos=r.matrix_world@r.pose.bones['root'].head;assert abs(rootpos.x)+abs(rootpos.y)<.0001
 ps=[world_to_camera_view(s,s.camera,v) for o in visible for v in verts(o)];b=[min(p.x for p in ps),min(p.y for p in ps),max(p.x for p in ps),max(p.y for p in ps)]
 assert min(b[:2])>2/256 and max(b[2:])<1-2/256,(rec['name'],b)
 old=rec['contact'];assert (hand-Vector(old['hand_world'])).length<.0001
 rows.append({'name':rec['name'],'blade_grip_error':err,'root_world':list(rootpos),'bounds':b})
# Save independently reopened checkpoint proof fixture; compare RGBA in pack stage.
fixture=next(x for x in info['frames'] if x['name']=='attack_E_006')
sample(fixture['source'],fixture['source_frame'],config['directions']['E']);s.render.filepath=str(root/'fixture-attack_E_006.png');bpy.ops.render.render(write_still=True)
report={'status':'PASS','source_blend_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'mode':'independent reopen; no generator execution','joints':41,'preserved_skinned_meshes':len(body),'original_body_coordinates_preserved':True,'authored_objects':len(armor),'flame_objects':7,'outline_hulls':len(hulls),'outline_parent_and_expansion_verified':True,'red_and_flame_emission_preserved':True,'flame_shape_values':values,'motion':motion,'frames_rechecked':len(rows),'rows':rows,'root_motion_driver_channels':len(r.animation_data.drivers),'camera':{'ortho':s.camera.data.ortho_scale,'pitch':config['pitch'],'alpha':s.render.film_transparent,'view':'Standard'},'fixture':'fixture-attack_E_006.png','visual_approval':False}
(root/'source-validation.json').write_text(json.dumps(report,indent=2));print('INDEPENDENT_SOURCE_PASS',len(rows),flush=True)
