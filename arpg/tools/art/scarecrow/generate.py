"""Original project-authored straw practice dummy. No third-party mesh or texture.
Reproducible Blender geometry, rigid armature and five authored actions."""
import bpy,json,math,sys,random
from pathlib import Path
from mathutils import Vector,Quaternion
cfg=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
source=Path(cfg['source']);source.mkdir(parents=True,exist_ok=True)
def mat(name,color,emission=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=.8
    p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m

def box(name,at,scale,material,bone,bevel=.05):
    bpy.ops.mesh.primitive_cube_add(size=1,location=at);o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        b=o.modifiers.new('chipped edges','BEVEL');b.width=bevel;b.segments=1
        bpy.ops.object.modifier_apply(modifier=b.name)
    o.data.materials.append(material);weight(o,bone);return o

def crystal(name,at,radius,height,material,bone,sides=5):
    # Bipyramid has a broad faceted shoulder, long crown and tapering tip.
    x,y,z=at;verts=[(x,y,z+height*.58),(x,y,z-height*.42)]
    verts += [(x+radius*math.cos(i*math.tau/sides),y+radius*math.sin(i*math.tau/sides),z+height*.05) for i in range(sides)]
    faces=[f for i in range(sides) for f in [(0,2+i,2+(i+1)%sides),(1,2+(i+1)%sides,2+i)]]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(material);weight(o,bone);return o

def line(name,points,material,bone,width=.024):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=width;c.bevel_resolution=0
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH');weight(o,bone);return o

def weight(o,bone):
    g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');pieces.append(o)

def rig_build(spec):
    data=bpy.data.armatures.new('original articulated rig');rig=bpy.data.objects.new('Rig',data);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for name,head,tail,parent in spec:
        b=data.edit_bones.new(name);b.head=head;b.tail=tail
        if parent:b.parent=data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT');return rig

def rot(rig,bone,axis,angle):
    b=rig.pose.bones[bone];b.rotation_mode='QUATERNION'
    local=b.bone.matrix_local.to_3x3().inverted()@Vector(axis)
    b.rotation_quaternion=Quaternion(local,angle)

def move_world(rig,bone,xyz):
    b=rig.pose.bones[bone];b.location=b.bone.matrix_local.to_3x3().inverted()@Vector(xyz)


bpy.ops.wm.read_factory_settings(use_empty=True);pieces=[]
wood=mat('aged timber',(.22,.115,.048));straw=mat('golden dry straw',(.64,.43,.13));sack=mat('woven ochre burlap',(.50,.34,.16));seam=mat('dark stitched seams',(.11,.065,.026));cloth=mat('faded moss tunic',(.22,.29,.15));patch=mat('rust cloth patch',(.40,.19,.105));hat=mat('weathered brown felt',(.19,.115,.06));cord=mat('hemp bindings',(.70,.55,.31))
spec=[('Root',(0,0,0),(0,0,.25),None),('Body',(0,0,1.10),(0,0,1.6),'Root'),('Head',(0,0,1.85),(0,0,2.2),'Body'),('Arm.L',(-.38,0,1.55),(-1,0,1.5),'Body'),('Arm.R',(.38,0,1.55),(1,0,1.5),'Body')]
rig=rig_build(spec)
def cone(name,at,r1,r2,depth,material,bone,verts=12):
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=depth,location=at);o=bpy.context.object;o.name=name;o.data.materials.append(material);weight(o,bone);return o
def ellipsoid(name,at,scale,material,bone):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=at);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);weight(o,bone);return o
cone('single planted support stake',(0,.045,.64),.052,.065,1.28,wood,'Root',8)
box('rear crossbar',(0,.08,1.51),(1.88,.105,.105),wood,'Body',.012)
ellipsoid('stuffed hanging tunic',(0,0,1.30),(.37,.24,.43),cloth,'Body')
cone('ragged tunic hem',(0,0,1.04),.33,.27,.20,cloth,'Body',10)
ellipsoid('burlap sack head',(0,-.015,1.91),(.24,.195,.285),sack,'Head')
cone('broad battered hat brim',(0,-.005,2.13),.39,.37,.055,hat,'Head',14)
cone('crooked hat crown',(.012,.015,2.28),.235,.095,.28,hat,'Head',10)
cone('hat hemp band',(0,.012,2.17),.237,.22,.055,cord,'Head',12)
for side in (-1,1):
    suffix='L' if side<0 else 'R';bone='Arm.'+suffix
    o=cone('stuffed sleeve '+suffix,(side*.64,0,1.5),.13,.155,.61,cloth,bone,10);o.rotation_euler[1]=math.pi/2
    for k in range(3):
        line('wrist binding '+suffix+str(k),[(side*.91,-.10,1.46+k*.025),(side*.91,.10,1.46+k*.025)],cord,bone,.014)
    for k in range(7):
        line('exposed hand straw '+suffix+str(k),[(side*.88,.035*math.sin(k),1.50+.02*(k-3)),(side*(1.02+.025*(k%3)),.055*math.sin(k),1.47+.035*(k-3))],straw,bone,.009)
    # Stitched X eyes, actual geometry on the front of the sack.
    for diag in (-1,1):line('cross stitch eye '+suffix+str(diag),[(side*.09-.034,-.197,1.98-diag*.033),(side*.09+.034,-.197,1.98+diag*.033)],seam,'Head',.011)
line('crooked sewn mouth',[(-.105,-.198,1.85),(-.04,-.214,1.82),(.04,-.214,1.82),(.11,-.197,1.85)],seam,'Head',.01)
for k in range(5):
    x=-.085+k*.043;line('mouth cross stitch '+str(k),[(x,-.216,1.80),(x+.006,-.216,1.845)],cord,'Head',.005)
box('offset chest patch',(-.13,-.229,1.39),(.19,.023,.20),patch,'Body',.007)
for k in range(4):
    z=1.31+k*.05;line('patch lacing '+str(k),[(-.24,-.249,z),(-.19,-.25,z+.018)],cord,'Body',.005)
for k in range(13):
    a=k*math.tau/13;x=.24*math.cos(a);y=.15*math.sin(a)
    line('exposed hem straw '+str(k),[(x,y,1.03),(x*1.13,y*1.13,.82-.045*(k%3))],straw,'Body',.009)
for k in range(3):
    z=1.04+k*.025;line('waist rope '+str(k),[(-.28,-.14,z),(0,-.257,z),(.28,-.14,z),(.31,.10,z),(0,.24,z),(-.31,.1,z),(-.28,-.14,z)],cord,'Body',.011)
# A rear seam and unequal patches make the octants visually distinct.
line('rear tunic seam',[(0,.236,1.12),(.025,.24,1.40),(0,.18,1.65)],seam,'Body',.009)
box('rear shoulder patch',(.15,.19,1.52),(.15,.025,.12),sack,'Body',.006)
bpy.ops.object.select_all(action='DESELECT')
for o in pieces:o.select_set(True)
bpy.context.view_layer.objects.active=pieces[0];bpy.ops.object.join();body=bpy.context.object;body.name='Scarecrow';bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
arm=body.modifiers.new('rigid authored straw segments','ARMATURE');arm.object=rig;body.parent=rig
rig.animation_data_create();scene=bpy.context.scene;scene.render.fps=24
job=cfg['characters'][0];lengths={'idle':24,'run':24,'attack':24,'hit':9,'death':18}
for state,clip in job['animations'].items():
    action=bpy.data.actions.new(clip);action.use_fake_user=True;rig.animation_data.action=action
    for f in range(lengths[state]+1):
        t=f/lengths[state];s=math.sin(t*math.tau)
        for b in rig.pose.bones:b.location=(0,0,0);b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion();b.scale=(1,1,1)
        sway=.022*s;twist=.025*s
        if state=='run':sway=.04*s;twist=.065*s
        if state=='attack':sway=.10*math.sin(t*math.tau);twist=.20*math.sin(t*math.tau)
        if state=='hit':sway=-.22*math.sin(t*math.pi);twist=.10*math.sin(t*math.pi)
        if state=='death':sway=.9*t;twist=.12*t;move_world(rig,'Body',(0,0,-.29*t))
        rot(rig,'Body',(1,0,0),sway);rot(rig,'Head',(0,0,1),twist)
        for side in (-1,1):
            suf='L' if side<0 else 'R';rot(rig,'Arm.'+suf,(0,1,0),side*(.38+.025*s+(.30*math.sin(t*math.pi) if state=='hit' else .35*t if state=='death' else 0)))
        for b in rig.pose.bones:
            for prop in ('location','rotation_quaternion','scale'):b.keyframe_insert(prop,frame=f)
    tr=rig.animation_data.nla_tracks.new();tr.name=clip;tr.strips.new(clip,0,action);tr.mute=True
rig.animation_data.action=None
for b in rig.pose.bones:b.location=(0,0,0);b.rotation_quaternion=Quaternion();b.scale=(1,1,1)
scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(source/'scarecrow-original.blend'))
bpy.ops.export_scene.gltf(filepath=job['model'],export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_nla_strips=True,export_force_sampling=True)
print('ORIGINAL_SCARECROW',len(body.data.vertices),'vertices',len(rig.pose.bones),'bones',flush=True)
