"""Original project armor / skull-mask / blade geometry on CC0 Warrior animation.
Executed only by this namespace's baker at Idle frame zero. No IP meshes/textures.
"""
steel=material('DK obsidian steel',(.055,.073,.105));edge=material('DK blue steel edges',(.22,.28,.36));dark=material('DK recess',(.018,.022,.032));bonewhite=material('DK aged skull silver',(.43,.47,.51));red=material('DK red eye',(.95,.008,.003),3);orange=material('DK flame orange',(1,.085,.003),2);yellow=material('DK flame core',(1,.55,.015),3)
armor=[]
def world_attach(o,bone_name):
 b=rig.pose.bones[bone_name];parent_world=rig.matrix_world@b.matrix.copy();parent_world.translation=rig.matrix_world@b.tail;desired=o.matrix_world.copy()
 o.parent=rig;o.parent_type='BONE';o.parent_bone=bone_name;o.matrix_basis=parent_world.inverted()@desired
 meshes.append(o);armor.append(o);return o

def ellipsoid(name,center,scale,mat,bone_name,sub=1):
 bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=center)
 o=bpy.context.object;o.name='DK_'+name;o.scale=scale;o.data.materials.append(mat)
 # Bake local scale without touching selected imported skin.
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return world_attach(o,bone_name)

def part(name,vertices,faces,mat,bone_name):
 data=bpy.data.meshes.new('DK_'+name);data.from_pydata(vertices,[],faces);data.update();data.materials.append(mat)
 o=bpy.data.objects.new('DK_'+name,data);bpy.context.collection.objects.link(o);return world_attach(o,bone_name)

def segment(name,bn,radius,mat):
 b=rig.pose.bones[bn];a=rig.matrix_world@b.head;c=rig.matrix_world@b.tail
 center=(a+c)/2;length=(c-a).length
 o=ellipsoid(name,center,(radius,radius,length*.56),mat,bn)
 # Mesh long axis follows actual bone rather than world vertical.
 q=(c-a).to_track_quat('Z','Y');local=o.matrix_world.copy();local.translation=center
 desired=Matrix.Translation(center)@q.to_matrix().to_4x4()
 b=rig.pose.bones[bn];pw=rig.matrix_world@b.matrix.copy();pw.translation=rig.matrix_world@b.tail;o.matrix_basis=pw.inverted()@desired
 return o
# Body dimensions from actual animated CC0 geometry; fitted at source Idle0.
dg=bpy.context.evaluated_depsgraph_get();bodyobj=next(o for o in skinned if o.name.endswith('_Body'))
points=evaluated_vertices(bodyobj,dg);xmin=min(p.x for p in points);xmax=max(p.x for p in points);zmin=min(p.z for p in points);zmax=max(p.z for p in points)
chestbone=next(n for n in ['spine.002','spine.001','chest','spine'] if n in rig.pose.bones)
center=Vector(((xmin+xmax)/2,0,zmin+(zmax-zmin)*.65));width=(xmax-xmin)*.60
ellipsoid('cuirass_faceted',center,(width,.38,(zmax-zmin)*.40),steel,chestbone,2)
# Chevron ridges and separate abdomen lames; visible black armor with cool edges.
for k in range(3):
 z=zmax-.08-k*.12
 part('breast_chevron_'+str(k),[(-width*.82,-.37,z),(0,-.43,z-.085),(width*.82,-.37,z),(-width*.65,-.36,z-.045),(0,-.41,z-.13),(width*.65,-.36,z-.045)],[(0,1,4,3),(1,2,5,4)],edge,chestbone)
for side,suffix in [(-1,'l'),(1,'r')]:
 for bn,label,r in [('upperarm.'+suffix,'pauldron',.19),('lowerarm.'+suffix,'vambrace',.115),('hand.'+suffix,'gauntlet',.115),('upperleg.'+suffix,'thigh',.125),('lowerleg.'+suffix,'greave',.14),('foot.'+suffix,'sabatons',.14),('toes.'+suffix,'armored_toes',.14)]:
  if bn in rig.pose.bones:segment(label+'_'+suffix,bn,r,steel)
 bn='upperarm.'+suffix;b=rig.pose.bones[bn];c=rig.matrix_world@b.head
 ellipsoid('shoulder_crown_'+suffix,c,(.24,.22,.17),edge,bn)
 # Independent three-lobed shoulder silhouette, not a traced IP helmet.
 for k in range(2):
  p=c+Vector((side*(.13+.075*k),.025,.11))
  part('shoulder_fin_'+suffix+str(k),[tuple(p+Vector((-.06,-.10,0))),tuple(p+Vector((.06,-.1,0))),tuple(p+Vector((side*.045,.01,.18))),tuple(p+Vector((0,.08,-.03)))],[(0,1,2),(1,3,2),(3,0,2),(0,3,1)],steel,bn)
headbone='head' if 'head' in rig.pose.bones else 'Head'
headobj=next(o for o in meshes if o.name=='Skeleton_Warrior_Head');hp=evaluated_vertices(headobj,dg);hc=sum(hp,Vector())/len(hp)
lo=Vector(tuple(min(p[i] for p in hp) for i in range(3)));hi=Vector(tuple(max(p[i] for p in hp) for i in range(3)))
hc=(lo+hi)/2;hw=(hi.x-lo.x)*.57;hz=hi.z-lo.z;front=lo.y-.018
ellipsoid('helmet_domed_shell',hc+Vector((0,.025,hz*.12)),(hw,(hi.y-lo.y)*.58,hz*.61),steel,headbone,2)
# Original split skull faceplate with open dark sockets, cheek wings, tooth grille.
for s in [-1,1]:
 x=s*hw*.48
 ellipsoid('socket_recess_'+str(s),(x,front-.025,hc.z+.035),(hw*.43,.052,hz*.16),dark,headbone)
 ellipsoid('red_eye_'+str(s),(x,front-.074,hc.z+.033),(hw*.26,.025,hz*.045),red,headbone)
 part('brow_'+str(s),[(s*.015,front-.08,hc.z+.085),(s*hw*.95,front-.035,hc.z+.145),(s*hw,front-.025,hc.z+.07),(s*.035,front-.09,hc.z+.045)],[(0,1,2,3)],bonewhite,headbone)
 part('cheek_'+str(s),[(s*hw*.9,front-.03,hc.z+.02),(s*hw*.98,front+.02,hc.z-.13),(s*.045,front-.075,hc.z-.18),(s*.07,front-.085,hc.z-.07)],[(0,1,2,3)],edge,headbone)
part('nasal_keystone',[(0,front-.11,hc.z+.08),(-.04,front-.09,hc.z-.065),(0,front-.12,hc.z-.10),(.04,front-.09,hc.z-.065)],[(0,1,2,3)],bonewhite,headbone)
for k in range(5):
 x=(k-2)*.047
 ellipsoid('mask_tooth_'+str(k),(x,front-.07,hc.z-.17),(.018,.035,.052),bonewhite,headbone)
# Raised central sagittal crest, rear neck plates all rotate with actual head.
part('crest',[(-.045,hc.y-.16,hi.z-.025),(.045,hc.y-.16,hi.z-.025),(-.025,hc.y+.11,hi.z+.24),(.025,hc.y+.11,hi.z+.24),(-.05,hc.y+.22,hi.z-.04),(.05,hc.y+.22,hi.z-.04)],[(0,1,3,2),(2,3,5,4),(0,2,4),(1,5,3),(0,4,5,1)],edge,headbone)
# Original angular brow-to-crown ridge and swept temple guards, visible in rear octants.
part('forehead_ridge',[(-.065,front-.035,hc.z+.11),(.065,front-.035,hc.z+.11),(0,front-.075,hi.z+.10),(-.03,hc.y,hi.z+.13),(.03,hc.y,hi.z+.13)],[(0,1,2),(0,2,3),(1,4,2),(2,4,3)],edge,headbone)
for side in [-1,1]:
 part('temple_guard_'+str(side),[(side*hw*.85,hc.y-.20,hc.z+.14),(side*hw*1.18,hc.y+.12,hc.z+.28),(side*hw*.98,hc.y+.25,hc.z-.12),(side*hw*.70,hc.y-.12,hc.z-.21)],[(0,1,2,3)],steel,headbone)
 # Separate hanging hip plate, moves with hips, leaving knees/legs articulated.
 part('tasset_'+str(side),[(side*.04,-.22,.64),(side*.28,-.19,.64),(side*.31,-.20,.40),(side*.08,-.27,.35)],[(0,1,2,3)],steel,'hips')
# DK-only gravitas: remodel authored shells in world space around their own
# anatomical centers. Proportion control is geometry, not runtime sprite scale.
if job.get('gravitas'):
 for o in list(armor):
  if o.type!='MESH':continue
  is_head=o.parent_bone==headbone
  is_chest=o.parent_bone==chestbone
  if not (is_head or is_chest):continue
  pivot=hc if is_head else center
  factors=Vector((.70,.68,.80) if is_head else (1.24,1.02,1.14))
  mw=o.matrix_world.copy();inv=mw.inverted()
  for v in o.data.vertices:
   p=mw@v.co;delta=p-pivot
   v.co=inv@(pivot+Vector(tuple(delta[i]*factors[i] for i in range(3))))
 # Broader, low-set shoulder plates read as adult forged armor, not round mitts.
 for suffix in ('l','r'):
  b=rig.pose.bones['upperarm.'+suffix];p=rig.matrix_world@b.head
  ellipsoid('gravitas_pauldron_'+suffix,p+Vector((0,0,.015)),(.285,.245,.105),steel,'upperarm.'+suffix,1)
# Preserve credited source anatomy but do not let its old skull silhouette
# protrude through the newly narrower helmet; original vertices remain intact.
if job.get('gravitas'):
 for o in skinned:
  if o.name.endswith(('_Head','_Jaw','_Eyes')):o.hide_render=True
 bpy.context.view_layer.update()
# Base skull remains credited/preserved; new shell/visor owns the visible helmet silhouette.
for o in skinned:
 if o.name.endswith(('_Head','_Jaw')):
  o.data.materials.clear();o.data.materials.append(dark)
# New sword at right hand: central broad blade, pointed tip, hooked guard.
blade=part('blade_original',[(-.075,0,.12),(.075,0,.12),(-.11,0,.79),(0,0,1.06),(.11,0,.79),(0,-.035,.5),(0,.035,.5)],[(0,1,5),(1,4,3,5),(0,5,3,2),(0,6,1),(1,6,3,4),(0,2,3,6)],edge,'handslot.r')
# Reattach all sword-local geometry at grip origin in source idle; follows real hand action.
weapon_meshes=[blade]
for o in [blade]:attach_at_hand(o,rig,'handslot.r')
for name,pts,r,mat in [('wrapped_grip',[(0,0,-.19),(0,0,.10)],.043,dark),('crossguard',[(-.22,0,.18),(-.14,0,.10),(0,0,.12),(.14,0,.10),(.22,0,.18)],.042,steel),('ember_channel',[(0,-.038,.18),(0,-.038,.77),(0,0,1.02)],.018,orange)]:
 o=tube('DK_'+name,pts,r,mat);attach_at_hand(o,rig,'handslot.r');meshes.append(o);weapon_meshes.append(o)
flames=[]
for k in range(7):
 z=.21+k*.105;s=-1 if k%2 else 1
 vs=[(-.065,0,z),(.065,0,z),(s*.10,-.02,z+.12),(s*.05,.015,z+.27),(0,.045,z+.07)]
 o=part('Flame_tongue_'+str(k),vs,[(0,1,2),(0,2,3),(0,3,4),(1,4,3,2)],yellow if k%3==0 else orange,'handslot.r');attach_at_hand(o,rig,'handslot.r');weapon_meshes.append(o);flames.append(o)
 # Real editable shape animation, stored in .blend and reevaluated on reopen.
 o.shape_key_add(name='Basis');key=o.shape_key_add(name='Flicker')
 for i,v in enumerate(key.data):v.co.x+=s*.055*(i/4);v.co.z+=.09*(i/4);v.co.y+=.025*math.sin(k+i)
 for f in range(0,33,2):key.value=.5+.5*math.sin(f*1.27+k*1.83);key.keyframe_insert('value',frame=f)
 for fc in o.data.shape_keys.animation_data.action.layers[0].strips[0].channelbags[0].fcurves:
  fc.modifiers.new('CYCLES')
 o.data.shape_keys.animation_data.action.use_fake_user=True
# Existing CC0 eyes receive dark material; only newly authored eye apertures glow red.
for o in skinned:
 if o.name.endswith('_Eyes'):o.data.materials.clear();o.data.materials.append(dark)
def update_accessories(clip_name,frame):
 bpy.context.view_layer.update()
weapon_authored={'author':'project-authored procedural geometry','design':'obsidian lamellar knight, split skull visor, sagittal crest, chevron cuirass, ember blade','base':'KayKit Skeleton_Warrior CC0 rig/body/95 source clips; not wholly original rig or animation','armor_objects':[o.name for o in armor],'blade':'DK_blade_original','flame_shape_actions':[o.data.shape_keys.animation_data.action.name for o in flames],'no_external_IP_assets':True}
(source_dir/'weapon-authorship.json').write_text(json.dumps(weapon_authored,indent=2))
