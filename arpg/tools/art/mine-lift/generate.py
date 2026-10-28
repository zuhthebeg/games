"""Original CC0 timber mine hoist; reproducible model and rigid animation bake.
Lighting, transparent EEVEE, Standard color and 40deg camera follow ../bake.py."""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def material(n,c):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.85;return m
wood=material('aged oak',(.27,.16,.078));plank=material('cut plank',(.40,.265,.13));iron=material('blackened iron',(.12,.15,.16));rope=material('hemp rope',(.52,.41,.25));ore=material('slate ore',(.22,.27,.29))
def box(n,at,size,mat,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=at);o=bpy.context.object;o.name=n;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);b=o.modifiers.new('worn corners','BEVEL');b.width=.025;b.segments=1;bpy.ops.object.modifier_apply(modifier=b.name);o.parent=parent;return o
def cylinder(n,at,r,depth,mat,axis='Z',parent=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=depth,location=at);o=bpy.context.object;o.name=n;o.data.materials.append(mat);o.parent=parent
 if axis=='Y':o.rotation_euler[0]=math.pi/2
 if axis=='X':o.rotation_euler[1]=math.pi/2
 return o
def beam(n,a,b,width,mat):
 o=box(n,(Vector(a)+Vector(b))/2,(width,width,(Vector(b)-Vector(a)).length),mat);o.rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler();return o
for x in [-.88,.88]:
 for y in [-.46,.46]:
  box('foundation shoe',(x,y,.09),(.36,.40,.18),iron);box('timber upright',(x,y,1.63),(.18,.20,3.1),wood)
  beam('knee brace',(x,y,2.48),(x*.45,y,3.12),.12,plank)
 box('crown crosshead',(x,0,3.18),(.25,1.25,.22),wood)
box('overhead axle beam',(0,0,3.30),(2.2,.22,.22),plank)
cylinder('iron winding drum',(0,0,3.13),.21,1.12,iron,'X')
for x in [-.60,.60]:cylinder('drum flange',(x,0,3.13),.27,.065,iron,'X')
for x in [-.37,.37]:
 box('vertical carriage guide',(x,.48,1.55),(.065,.07,2.9),iron)
for i in range(7):box('ground track sleeper',(0,-1+i*.31,.08),(1.5,.14,.12),wood)
for x in [-.40,.40]:box('ground rail',(x,-.05,.17),(.07,2.4,.09),iron)
carriage=bpy.data.objects.new('Lift carriage',None);bpy.context.collection.objects.link(carriage)
for i in range(6):box('lift platform plank',(-.65+i*.26,0,.27),(.24,1.15,.12),plank,carriage)
for x in [-.48,.48]:
 for y in [-.30,.30]:cylinder('cart iron wheel',(x,y,.43),.15,.09,iron,'X',carriage)
box('cart floor',(0,0,.57),(1.10,.76,.09),wood,carriage)
for z in [.70,.88,1.06]:
 for y in [-.41,.41]:box('cart side plank',(0,y,z),(1.22,.09,.16),plank,carriage)
 for x in [-.60,.60]:box('cart end plank',(x,0,z),(.09,.78,.16),wood,carriage)
for x in [-.48,.48]:
 for y in [-.47,.47]:box('cart metal strap',(x,y,.88),(.065,.03,.64),iron,carriage)
for i in range(7):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.22,location=((i%3-1)*.29,(i//3-1)*.20,1.08));o=bpy.context.object;o.name='faceted ore';o.data.materials.append(ore);o.parent=carriage
ropes=[]
for x in [-.65,.65]:ropes.append(cylinder('taut hoisting rope',(x,0,2),.022,2,rope))
# Eight-second round trip, eased reversal; all samples derived, never runtime random.
for f in range(33):
 z=.70*(1-math.cos(math.tau*f/32));carriage.location.z=z;carriage.keyframe_insert('location',frame=f+1)
 for o in ropes:
  bottom=.34+z;o.location.z=(3.12+bottom)/2;o.scale.z=(3.12-bottom)/2;o.keyframe_insert('location',frame=f+1);o.keyframe_insert('scale',frame=f+1)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=8;scene.render.resolution_x=192;scene.render.resolution_y=192;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.render.fps=4
scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.36,.45,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4,-7,6.8));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=4.6;aim(cam,(0,0,1.64));scene.camera=cam
for name,at,power,size,color in [('key',(-3,-4,7),420,4,(1,.88,.73)),('rim',(3,2,4),260,3,(.65,.78,1))]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;d.use_shadow=False;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=at;aim(o,(0,0,1.6))
scene.frame_end=33;scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'mine-lift-original.blend'))
for i in range(32):scene.frame_set(i+1);scene.render.filepath=str(out/('frame-%02d.png'%i));bpy.ops.render.render(write_still=True)
(out/'source.json').write_text(json.dumps({'original':True,'frames':32,'fps':4,'size':192,'periodMs':8000,'anchor':[.5,.92],'source':'mine-lift-original.blend','objects':len(bpy.data.objects)},indent=2))
