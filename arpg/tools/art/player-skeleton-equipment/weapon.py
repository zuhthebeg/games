"""Project-authored independently switchable bone-attached equipment on CC0 Warrior.
No base helmet, mask, cape or armor. Each layer is rendered with true camera Z.
"""
steel=material('Equipment steel',(.30,.39,.47));edge=material('Equipment edges',(.57,.65,.70));wood=material('Equipment leather',(.19,.11,.065))
armor=[]
def attach_world(o,bn,layer):
 b=rig.pose.bones[bn];pw=rig.matrix_world@b.matrix@Matrix.Translation((0,b.length,0));desired=o.matrix_world.copy()
 o.parent=rig;o.parent_type='BONE';o.parent_bone=bn;o.matrix_basis=pw.inverted()@desired
 o['equipment_layer']=layer;meshes.append(o);armor.append(o);return o

def ellipsoid(name,center,scale,mat,bn,layer,sub=1):
 bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=center)
 o=bpy.context.object;o.name='SE_'+name;o.scale=scale;o.data.materials.append(mat)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return attach_world(o,bn,layer)

def segment(name,bn,radius,mat,layer):
 b=rig.pose.bones[bn];a=rig.matrix_world@b.head;c=rig.matrix_world@b.tail;center=(a+c)/2
 o=ellipsoid(name,center,(radius,radius,(c-a).length*.56),mat,bn,layer)
 desired=Matrix.Translation(center)@(c-a).to_track_quat('Z','Y').to_matrix().to_4x4()
 pw=rig.matrix_world@b.matrix@Matrix.Translation((0,b.length,0));o.matrix_basis=pw.inverted()@desired
 return o
for o in meshes:o['equipment_layer']='base'
dg=bpy.context.evaluated_depsgraph_get();bo=next(o for o in skinned if o.name.endswith('_Body'));pts=evaluated_vertices(bo,dg)
lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)));hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
chest=next(n for n in ['spine.002','spine.001','chest','spine'] if n in rig.pose.bones)
# Warrior's original body/limb meshes contain leather/metal details. Keep them
# only as hidden rig validation references; author exposed bone geometry instead.
ivory=material('Equipment bare bone',(.79,.75,.63))
for o in skinned:
 if not o.name.endswith(('_Head','_Jaw','_Eyes')):
  o.hide_render=True;o['equipment_layer']='reference'
for suffix in ['l','r']:
 for bn,r in [('upperarm.'+suffix,.045),('lowerarm.'+suffix,.038),('hand.'+suffix,.047),('upperleg.'+suffix,.048),('lowerleg.'+suffix,.038),('foot.'+suffix,.04),('toes.'+suffix,.045)]:
  if bn in rig.pose.bones:segment('bare_'+bn,bn,r,ivory,'base')
 for bn in ['upperarm.'+suffix,'lowerarm.'+suffix,'upperleg.'+suffix,'lowerleg.'+suffix]:
  b=rig.pose.bones[bn];ellipsoid('joint_'+bn,rig.matrix_world@b.head,(.053,.053,.053),ivory,bn,'base')
# Open rib cage, separated ribs and spinal column rather than a solid shirt.
spine=rig.pose.bones[chest];sa=rig.matrix_world@spine.head;sb=rig.matrix_world@spine.tail
center=(sa+sb)/2
for k in range(4):
 z=lo.z+(hi.z-lo.z)*(.35+k*.115)
 radius=.19*(1-abs(k-1.5)*.09)
 for side in [-1,1]:
  points=[(side*radius*math.sin(math.pi*i/12),-.12*math.cos(math.pi*i/12),z+.025*math.sin(math.pi*i/12)) for i in range(13)]
  o=tube('SE_rib_'+str(k)+'_'+str(side),points,.023,ivory);attach_world(o,chest,'base')
o=tube('SE_bare_spine',[(0,0,lo.z+.10),(0,0,lo.z+(hi.z-lo.z)*.76)],.038,ivory);attach_world(o,chest,'base')
hips=rig.pose.bones['hips'];hc0=rig.matrix_world@hips.head
ellipsoid('bare_pelvis',hc0,(.19,.09,.075),ivory,'hips','base')

ellipsoid('breastplate',((lo.x+hi.x)/2,0,lo.z+(hi.z-lo.z)*.65),((hi.x-lo.x)*.59,.33,(hi.z-lo.z)*.37),steel,chest,'body',2)
for suffix in ['l','r']:
 for bn,r,layer in [('hand.'+suffix,.105,'hands'),('lowerarm.'+suffix,.105,'hands'),('foot.'+suffix,.14,'feet'),('toes.'+suffix,.14,'feet'),('lowerleg.'+suffix,.125,'feet'),('upperarm.'+suffix,.16,'body')]:
  if bn in rig.pose.bones:segment(bn,bn,r,steel,layer)
headbone='head' if 'head' in rig.pose.bones else 'Head'
ho=next(o for o in skinned if o.name.endswith('_Head'));hp=evaluated_vertices(ho,dg)
hlo=Vector(tuple(min(p[i] for p in hp) for i in range(3)));hhi=Vector(tuple(max(p[i] for p in hp) for i in range(3)));hc=(hlo+hhi)/2
# Open-face helmet: cap only, never a skull mask, and only in the actual head layer.
ellipsoid('open_helmet_cap',hc+Vector((0,.025,(hhi.z-hlo.z)*.29)),((hhi.x-hlo.x)*.57,(hhi.y-hlo.y)*.57,(hhi.z-hlo.z)*.38),steel,headbone,'head',2)
for side in [-1,1]:ellipsoid('helmet_side'+str(side),hc+Vector((side*(hhi.x-hlo.x)*.44,.045,-.04)),(.06,(hhi.y-hlo.y)*.40,.15),steel,headbone,'head')
# Authored sword and maul have different real geometry, not merely recolours.
def weapon_part(o,layer):
 attach_at_hand(o,rig,'handslot.r');o['equipment_layer']=layer;meshes.append(o);return o
blade=weapon_part(tube('SE_sword_blade',[(0,0,.12),(0,0,.82)],.055,edge),'sword')
weapon_meshes=[blade]
for name,pts,r,mat in [('sword_grip',[(0,0,-.18),(0,0,.12)],.04,wood),('sword_guard',[(-.16,0,.12),(.16,0,.12)],.035,steel)]:weapon_meshes.append(weapon_part(tube('SE_'+name,pts,r,mat),'sword'))
weapon_meshes.append(weapon_part(tube('SE_maul_shaft',[(0,0,-.18),(0,0,.68)],.045,wood),'blunt'))
bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_cube_add(size=1)
o=bpy.context.object;o.name='SE_maul_head'
for v in o.data.vertices:v.co=Vector((v.co.x*.39,v.co.y*.24,v.co.z*.25+.70))
o.data.materials.append(steel);weapon_meshes.append(weapon_part(o,'blunt'))
def update_accessories(clip_name,frame):bpy.context.view_layer.update()
weapon_authored={'base':'KayKit Skeleton_Warrior CC0 body/rig/clips; no imported accessories','own_parts':'project bare ribs/spine/pelvis/limbs plus procedural steel open helmet / breastplate / gauntlets / greaves / sword / blunt maul','layers':['base','hands','feet','body','head','sword','blunt'],'occlusion':'per-pixel linear camera distance, independent layers; never static icons'}
(source_dir/'authorship.json').write_text(json.dumps(weapon_authored,indent=2))
