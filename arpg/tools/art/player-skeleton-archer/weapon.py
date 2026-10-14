# Invoked after bind reference captured; original authored weapon geometry only.
wood=material('Archer walnut',(.40,.22,.09));ivory=material('Archer bone trim',(.93,.83,.58));steel=material('Archer arrowhead',(.61,.69,.73));cord=material('Archer string',(.86,.82,.65));teal=material('Archer fletching',(.14,.35,.33))
# Actual curved recurve limbs, not a substitute body. Grip is at the left hand slot.
points=[]
for i in range(25):
 z=-.55+1.10*i/24; y=-.14*math.sin(math.pi*i/24)+.07*abs(z/.55)**4
 points.append((0,y,z))
bow=tube('Archer_recurve_bow_original',points,.035,wood)
grip=tube('Archer_wrapped_grip',[(0,-.14,-.09),(0,-.14,.09)],.049,ivory)
# Shift the curved grip to the origin, so the hand actually holds its grip.
for o in [bow,grip]:
 for v in o.data.vertices:v.co.y+=.14
# Parent fixed world-Z upright bow to the animated left hand in authored attack.
action('Archer_Draw_Contact_Release');scene.frame_set(0);bpy.context.view_layer.update()
left=rig.matrix_world@rig.pose.bones['handslot.l'].tail
for o in [bow,grip]:
 attach_at_hand(o,rig,'handslot.l')
weapon_meshes=[bow,grip]
string=tube('Archer_deformable_string',[(0,.21,-.55),(0,.13,0),(0,.21,.55)],.008,cord)
string.parent=bow;string.matrix_basis=Matrix.Identity(4)
string.shape_key_add(name='Basis');draw_key=string.shape_key_add(name='DrawContact')
# Arrow lies along local -Y. Nock origin is attached to right slot before release.
arrow=tube('Archer_arrow_shaft_original',[(0,0,0),(0,-.66,0)],.013,wood)
arrow.parent=rig;arrow.matrix_basis=Matrix.Identity(4)
# Original triangular arrowhead and paired feather fletching; parent to shaft.
def wedge(name,vs,faces,mat,parent):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],faces);mesh.materials.append(mat)
 ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob);ob.parent=parent;return ob
head=wedge('Archer_original_broadhead',[(-.045,-.64,0),(.045,-.64,0),(0,-.74,0),(0,-.65,.024),(0,-.65,-.024)],[(0,2,3),(1,3,2),(0,4,2),(1,2,4),(0,3,1,4)],steel,arrow)
feathers=wedge('Archer_original_fletching',[(-.05,-.05,0),(-.01,-.14,0),(0,-.15,0),(.05,-.05,0),(.01,-.14,0),(0,-.15,0),(0,-.05,.05),(0,-.14,.01),(0,-.15,0)],[(0,1,2),(3,4,5),(6,7,8)],teal,arrow)
meshes.extend([bow,grip,string,arrow,head,feathers]);weapon_meshes.extend([string,arrow,head,feathers])
# Deformable string shape per attack source sample, world contact mapped into bow space.
string_basis=[v.co.copy() for v in string.data.vertices]
release_origin=None; accessory_samples=[]
for f in range(25):
 scene.frame_set(f);bpy.context.view_layer.update()
 l=rig.matrix_world@rig.pose.bones['handslot.l'].tail;r=rig.matrix_world@rig.pose.bones['handslot.r'].tail
 local=bow.matrix_world.inverted()@r
 if f<=14:
  mid=local; release_origin=r.copy()
 else:mid=Vector((0,.21,0))
 for index,(v,basis) in enumerate(zip(draw_key.data,string_basis)):
  weight=max(0,1-abs(basis.z)/.55)
  v.co=basis+weight*(mid-Vector((0,.13,0)))
 # Shape keys cannot keyframe individual coordinates: create discrete full-shape keys.
 key=string.shape_key_add(name='contact_%02d'%f)
 for v,s in zip(key.data,draw_key.data):v.co=s.co
 for k in [f-1,f,f+1]: key.value=1 if k==f else 0;key.keyframe_insert('value',frame=k)
 if f<=14:position=r
 else:position=release_origin+Vector((0,-.30*(f-14),0))
 arrow.location=rig.matrix_world.inverted()@position
 arrow.keyframe_insert('location',frame=f)
 for o in [arrow,head,feathers]:
  o.hide_render=f>=17;o.keyframe_insert('hide_render',frame=f)
 accessory_samples.append({'frame':f,'left_slot':list(l),'right_slot':list(r),'string_center_bow_local':list(mid),'arrow_nock':list(position),'released':f>14,'arrow_visible':f<17})
# Remove the temporary DrawContact key; full named shapes are retained in .blend.
string.shape_key_remove(draw_key)
accessory_actions={o.name:o.animation_data.action for o in [arrow,head,feathers] if o.animation_data}
string_action=string.data.shape_keys.animation_data.action
string_action.use_fake_user=True
for a in accessory_actions.values():a.use_fake_user=True
# Arrow visibility keeps outline synchronized by update_accessories after outline generation.
def update_accessories(clip_name,frame):
 attacking=clip_name=='Archer_Draw_Contact_Release'
 string.data.shape_keys.animation_data.action=string_action if attacking else None
 for k in string.data.shape_keys.key_blocks[1:]:k.value=0
 for o in [arrow,head,feathers]:
  o.animation_data.action=accessory_actions[o.name] if attacking else None
  o.hide_render=not attacking or frame>=17
 for o in bpy.context.scene.objects:
  if o.name.startswith(('Archer_arrow','Archer_original_broadhead','Archer_original_fletching')) and o.name.endswith('_outline'):o.hide_render=not attacking or frame>=17
 scene.frame_set(math.floor(frame),subframe=frame%1);bpy.context.view_layer.update()
 for o in bpy.context.scene.objects:
  if o.name.startswith(('Archer_arrow','Archer_original_broadhead','Archer_original_fletching')) and o.name.endswith('_outline'):
   if o.animation_data:o.animation_data.action=None
   o.hide_render=not attacking or frame>=17
   if o.name.startswith('Archer_arrow'):o.matrix_basis=arrow.matrix_basis.copy()
  if o.name=='Archer_deformable_string_outline':
   o.data.shape_keys.animation_data.action=string_action if attacking else None
   if not attacking:
    for k in o.data.shape_keys.key_blocks[1:]:k.value=0
 bpy.context.view_layer.update()
 # Outside attack string uses rest shape; bow still held by true left slot.
 if not attacking:arrow.location=(0,0,-10)
weapon_authored={'bow':'original 25-point faceted recurve, wrapped grip','arrow':'original shaft, triangular broadhead, paired fletching','attack':'Archer_Draw_Contact_Release','release_source_frame':15,'contact_last_frame':14,'samples':accessory_samples,'accessory_actions':{n:a.name for n,a in accessory_actions.items()},'string_action':string_action.name,'rig_joints':len(rig.data.bones),'source_body':'Skeleton_Rogue CC0, original skin preserved; only imported nonbody Icosphere removed'}
(source_dir/'weapon-authorship.json').write_text(json.dumps(weapon_authored,indent=2),encoding='utf-8')
