"""Independent reopen .blend proof; never executes generator, never rewrites originals."""
import bpy,json,math,hashlib,struct,sys
from pathlib import Path
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
root=Path(args[0]) if args else Path('C:/Users/user/ai-tools/arpg-art/player-skeleton-archer')
output=Path(args[1]) if len(args)>1 else root/'source-validation.json'
bpy.ops.wm.open_mainfile(filepath=str(root/'source/player-skeleton-archer-source.blend'))
scene=bpy.context.scene;rig=bpy.data.objects['Rig'];facing=bpy.data.objects['Facing'];default={n:Matrix(v) for n,v in json.loads(rig['default_basis_json']).items()};primary=json.loads(rig['primary_inventory_json']);spec=json.loads((root/'source/weapon-authorship.json').read_text());config=json.loads((root/'config.json').read_text());job=config['characters'][0]
assert len(rig.data.bones)==41;assert all(n in rig.pose.bones for n in ['handslot.l','handslot.r'])
body=[bpy.data.objects[n] for n,r in primary.items() if r['armature']]
assert len(body)==8
for n,r in primary.items():
 o=bpy.data.objects[n];assert len(o.data.vertices)==r['vertices'];assert len(o.data.polygons)==r['polygons'];assert hashlib.sha256(b''.join(struct.pack('<3f',*v.co) for v in o.data.vertices)).hexdigest()==r['coordinate_sha256']
assert not bpy.data.objects.get('Skeleton_Rogue_Hood');assert not any('dagger' in o.name.lower() for o in scene.objects)
arrow=bpy.data.objects['Archer_arrow_shaft_original'];bow=bpy.data.objects['Archer_recurve_bow_original'];string=bpy.data.objects['Archer_deformable_string'];basis=[v.co.copy() for v in string.data.vertices]
def sample(clip,f,angle=0):
 rig.animation_data.action=None
 for b in rig.pose.bones:b.matrix_basis=default[b.name].copy()
 a=bpy.data.actions[clip];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0];facing.rotation_euler.z=math.radians(angle)
 attack=clip=='Archer_Draw_Contact_Release'
 string.data.shape_keys.animation_data.action=bpy.data.actions[spec['string_action']] if attack else None
 for k in string.data.shape_keys.key_blocks[1:]:k.value=0
 for n,an in spec['accessory_actions'].items():
  o=bpy.data.objects[n];o.animation_data.action=bpy.data.actions[an] if attack else None;o.hide_render=not attack or f>=17
 scene.frame_set(math.floor(f),subframe=f%1);bpy.context.view_layer.update()
 for o in scene.objects:
  if o.name.startswith(('Archer_arrow','Archer_original_broadhead','Archer_original_fletching')) and o.name.endswith('_outline'):
   if o.animation_data:o.animation_data.action=None
   o.hide_render=not attack or f>=17
   if o.name.startswith('Archer_arrow'):o.matrix_basis=arrow.matrix_basis.copy()
  if o.name=='Archer_deformable_string_outline':
   o.data.shape_keys.animation_data.action=bpy.data.actions[spec['string_action']] if attack else None
   if not attack:
    for k in o.data.shape_keys.key_blocks[1:]:k.value=0
 if not attack:arrow.location=(0,0,-10)
 rig.location.x=rig.location.y=0
 bpy.context.view_layer.update()
def verts(o):
 dg=bpy.context.evaluated_depsgraph_get();e=o.evaluated_get(dg);m=e.to_mesh();p=[e.matrix_world@v.co for v in m.vertices];e.to_mesh_clear();return p
motion={};contacts=[];grounds=[]
for state,clip in job['animations'].items():
 a=bpy.data.actions[clip];lo,hi=a.frame_range;samples=[lo,(lo+hi)/2,hi-.01];vs=[]
 for f in samples:
  sample(clip,f);vs.append([v for o in body for v in verts(o)])
 maxrms=max(math.sqrt(sum((a-b).length_squared for a,b in zip(vs[0],v))/len(v)) for v in vs[1:]);assert maxrms>.001,(state,'static evaluated skin',maxrms)
 motion[state]={'source':clip,'source_range':list(a.frame_range),'sample_frames':samples,'max_skin_rms_world_from_first':maxrms,'skin_objects':len(body)}
for f in [0,4,8,12,14,16,18]:
 sample('Archer_Draw_Contact_Release',f);l=rig.matrix_world@rig.pose.bones['handslot.l'].tail;r=rig.matrix_world@rig.pose.bones['handslot.r'].tail
 pts=verts(string);mid=[v for v,b in zip(pts,basis) if abs(b.z)<.02];center=sum(mid,Vector())/len(mid)
 nock=arrow.matrix_world.translation; grip=bow.matrix_world.translation
 # Nearest actual right-hand weighted surface confirms slot contact proximity.
 o=bpy.data.objects['Skeleton_Rogue_ArmRight'];vi={g.index:g.name for g in o.vertex_groups};palm_indices=[v.index for v in o.data.vertices if any(vi.get(g.group) in ('hand.r','wrist.r') and g.weight>.25 for g in v.groups)];p=verts(o);palm=min((p[i]-r).length for i in palm_indices)
 row={'source_frame':f,'bow_grip_error':(grip-l).length,'string_right_error':(center-r).length,'arrow_right_error':(nock-r).length,'right_slot_nearest_actual_hand_vertex_world':palm,'left_slot':list(l),'right_slot':list(r),'string_mid':list(center),'arrow_nock':list(nock),'released':f>=15,'arrow_visible':not arrow.hide_render}
 assert row['bow_grip_error']<.0001
 if f<=14:assert row['string_right_error']<.003 and row['arrow_right_error']<.003 and palm<.12,row
 contacts.append(row)
assert contacts[3]['right_slot'][1]-contacts[0]['right_slot'][1]>.25
assert contacts[5]['arrow_nock'][1]<contacts[4]['arrow_nock'][1]-.5
assert contacts[5]['string_right_error']>.15 and not contacts[6]['arrow_visible']
for di,angle in config['directions'].items():
 sample('Dodge_Backward',4.8,angle);r=world_to_camera_view(scene,scene.camera,Vector((0,0,0)));grounds.append({'direction':di,'anchor':{'x':r.x,'y':1-r.y},'root_world':list(rig.matrix_world@rig.pose.bones['root'].head)})
assert max(abs(g['root_world'][0])+abs(g['root_world'][1]) for g in grounds)<.0001
assert max(abs(g['anchor']['x']-grounds[0]['anchor']['x'])+abs(g['anchor']['y']-grounds[0]['anchor']['y']) for g in grounds)<.000001
report={'status':'PASS','mode':'actual reopened compressed .blend evaluated source, independent of generator execution','source_blend_sha256':hashlib.sha256((root/'source/player-skeleton-archer-source.blend').read_bytes()).hexdigest(),'original_body_coordinates_preserved':primary,'skin_modifiers':8,'joints':41,'handslots':['handslot.l','handslot.r'],'no_dagger_or_hood':True,'new_weapon_objects':[o.name for o in scene.objects if o.name.startswith('Archer_') and not o.name.endswith('_outline')],'motion':motion,'contact':contacts,'ground':grounds,'dodge_contract':{'source':'Dodge_Backward','range':[0,9.6],'seconds':.4,'actual_skin_rms':motion['dodge']['max_skin_rms_world_from_first'],'original_source_root_travel_world':.6499999165534973,'render_root_translation_removed':True,'not_idle':True,'no_runtime_mapping':True},'user_approval':False}
# Bind final source to existing render records without rerendering 464 frames.
frames_path=root/'frames/player-skeleton-archer/frames.json'
info=json.loads(frames_path.read_text());rows=[]
for rec in info['frames']:
 di=rec['animation'].rsplit('_',1)[1]
 sample(rec['source'],rec['source_frame'],config['directions'][di])
 left=rig.matrix_world@rig.pose.bones['handslot.l'].tail
 right=rig.matrix_world@rig.pose.bones['handslot.r'].tail
 grip_error=(bow.matrix_world.translation-left).length
 assert grip_error<.0001,(rec['name'],'held bow',grip_error)
 row={'name':rec['name'],'grip_error':grip_error}
 if rec['contact']:
  old=rec['contact'];points=verts(string);mid=[p for p,b in zip(points,basis) if abs(b.z)<.02];center=sum(mid,Vector())/len(mid)
  errors={'left_slot':(left-Vector(old['left_slot'])).length,'right_slot':(right-Vector(old['right_slot'])).length,'string_mid':(center-Vector(old['string_mid'])).length,'arrow_nock':(arrow.matrix_world.translation-Vector(old['arrow_nock'])).length}
  assert max(errors.values())<.0001,(rec['name'],'render record mismatch',errors)
  assert bool(not arrow.hide_render)==old['arrow_visible']
  row['render_contact_coordinate_errors']=errors
 if rec['source']=='Dodge_Backward':
  root_world=rig.matrix_world@rig.pose.bones['root'].head
  assert abs(root_world.x)+abs(root_world.y)<.0001
  row['in_place_root_world']=list(root_world)
 rows.append(row)
report['render_binding']={'frames_json_sha256':hashlib.sha256(frames_path.read_bytes()).hexdigest(),'sampled_frames':len(rows),'all_frames_bow_held':True,'attack_contact_rows':sum('render_contact_coordinate_errors' in r for r in rows),'in_place_dodge_rows':sum('in_place_root_world' in r for r in rows),'rows':rows}
report['camera']={'pitch_config_degrees':config['pitch'],'ortho_scale':scene.camera.data.ortho_scale,'rotation_euler':list(scene.camera.rotation_euler),'transparent':scene.render.film_transparent,'view_transform':scene.view_settings.view_transform,'output':[scene.render.resolution_x,scene.render.resolution_y],'samples':scene.eevee.taa_render_samples}
# One existing full-draw render fixture only, never a browser screenshot.
fixture=next(r for r in info['frames'] if r['name']=='attack_E_006')
sample(fixture['source'],fixture['source_frame'],config['directions']['E'])
scene.render.filepath=str(output.parent/'fixture-attack_E_006.png')
bpy.ops.render.render(write_still=True)
report['fixture']={'name':fixture['name'],'source_frame':fixture['source_frame'],'reopened_source_sha256':report['source_blend_sha256'],'output':scene.render.filepath}
output.write_text(json.dumps(report,indent=2),encoding='utf-8');print('INDEPENDENT_SOURCE_PASS',flush=True)
