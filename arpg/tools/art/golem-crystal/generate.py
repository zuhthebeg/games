"""Original CC0 segmented stone guardian and limbless shard spirit.
Windows Blender 5.2: --background --factory-startup --python generate.py -- config.json
Only authored geometry/rig/action recipe ships; all .blend/.glb live offline.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Quaternion
cfg=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
source=Path(cfg['source']); source.mkdir(parents=True,exist_ok=True)

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

for job in cfg['characters']:
    bpy.ops.wm.read_factory_settings(use_empty=True);pieces=[];guardian=job['name']=='rune-guardian'
    stone=mat('weathered granite',(.47,.51,.54));light=mat('chipped pale facets',(.66,.7,.72));dark=mat('deep carved seams',(.065,.085,.11))
    glow=mat('cyan carved runes',(.28,.92,1),1.8);silver=mat('crystal silver',(.72,.8,.96));violet=mat('violet facets',(.34,.39,.72),.12)
    spiritglow=mat('crystal luminous heart',(.62,.84,1),1.35);wisp=mat('faint wisp',(.07,.10,.17),.03)
    if guardian:
        spec=[('Root',(0,0,0),(0,0,.3),None),('Body',(0,0,1.15),(0,0,1.65),'Root'),('Head',(0,0,1.94),(0,0,2.3),'Body')]
        for side in (-1,1):
            suffix='L' if side<0 else 'R'
            spec += [(f'Arm.{suffix}',(side*.62,0,1.64),(side*1.18,0,1.64),'Body'),(f'Forearm.{suffix}',(side*1.18,0,1.64),(side*1.64,0,1.64),f'Arm.{suffix}'),(f'Leg.{suffix}',(side*.32,0,.85),(side*.32,0,.4),'Root')]
        rig=rig_build(spec)
        box('waist',(0,0,1.02),(.66,.48,.32),dark,'Body')
        box('massive chest',(0,0,1.46),(1.05,.66,.66),stone,'Body',.11)
        # Raised four-sided carved cavity, actual 3D inset cyan strokes on front (-Y).
        box('rune cavity',(0,-.344,1.48),(.41,.04,.48),dark,'Body',.07)
        line('rune diamond',[(0,-.38,1.72),(.15,-.38,1.48),(0,-.38,1.24),(-.15,-.38,1.48),(0,-.38,1.72)],glow,'Body',.025)
        line('rune slash',[(-.23,-.378,1.51),(0,-.39,1.44),(.22,-.378,1.51)],glow,'Body',.019)
        box('stone head',(0,-.01,2.02),(.57,.56,.49),light,'Head',.085)
        box('brow',(0,-.31,2.09),(.62,.13,.1),stone,'Head',.025)
        for side in (-1,1):
            suffix='L' if side<0 else 'R'
            box('eye '+suffix,(side*.13,-.302,2.01),(.12,.028,.055),glow,'Head',.008)
            box('shoulder '+suffix,(side*.73,0,1.67),(.48,.68,.53),light,f'Arm.{suffix}',.09)
            box('upper boulder '+suffix,(side*1.03,0,1.64),(.39,.46,.4),stone,f'Arm.{suffix}',.065)
            box('joint '+suffix,(side*1.23,0,1.64),(.15,.3,.29),dark,f'Forearm.{suffix}',.04)
            box('hammer fist '+suffix,(side*1.51,-.01,1.64),(.49,.58,.57),stone,f'Forearm.{suffix}',.085)
            box('knuckle ridge '+suffix,(side*1.56,-.31,1.64),(.35,.09,.4),light,f'Forearm.{suffix}',.025)
            line('fist rune '+suffix,[(side*1.48,-.367,1.78),(side*1.6,-.367,1.64),(side*1.48,-.367,1.52)],glow,f'Forearm.{suffix}',.018)
            box('thigh '+suffix,(side*.32,.01,.66),(.41,.44,.44),stone,f'Leg.{suffix}',.065)
            box('shin '+suffix,(side*.32,-.025,.29),(.37,.39,.29),light,f'Leg.{suffix}',.04)
            box('heavy foot '+suffix,(side*.32,-.13,.105),(.47,.65,.21),stone,f'Leg.{suffix}',.04)
            line('back shoulder score '+suffix,[(side*.63,.347,1.77),(side*.82,.347,1.67)],dark,f'Arm.{suffix}',.018)
    else:
        spec=[('Root',(0,0,0),(0,0,.25),None),('Core',(0,0,1.05),(0,0,1.5),'Root'),('Nose',(0,-.45,1.1),(0,-.65,1.1),'Core'),('Tail',(0,.13,.78),(0,.55,.45),'Core')]
        for i in range(4):
            a=i*math.tau/4+.4;x=.61*math.cos(a);y=.49*math.sin(a)
            spec.append((f'Shard{i}',(x,y,1.12),(x,y,1.38),'Core'))
        rig=rig_build(spec)
        crystal('faceted diamond core',(0,0,1.12),.36,1.06,silver,'Core',5)
        crystal('inner front light',(0,-.32,1.12),.13,.4,spiritglow,'Nose',4)
        crystal('crown',(0,.03,1.78),.105,.29,violet,'Core',4)
        for i in range(4):
            a=i*math.tau/4+.4;x=.61*math.cos(a);y=.49*math.sin(a)
            crystal('orbiting shard '+str(i),(x,y,1.16+(i%2)*.14),.13+i*.011,.49+i*.045,violet if i%2 else silver,f'Shard{i}',4)
            crystal('shard light '+str(i),(x,y-.09,1.18+(i%2)*.14),.048,.16,spiritglow,f'Shard{i}',3)
        # Tapered low-contrast volumetric tail, never a screen-space diamond silhouette.
        verts=[];faces=[]
        for i,(y,z,r) in enumerate([(.12,.8,.17),(.3,.68,.14),(.49,.54,.095),(.67,.43,.048),(.79,.4,.004)]):
            for k in range(5):
                a=k*math.tau/5;verts.append((.05*math.sin(i*.9)+r*math.cos(a),y+r*.3*math.sin(a),z+r*math.sin(a)))
        for i in range(4):
            for k in range(5):faces.append((i*5+k,i*5+(k+1)%5,(i+1)*5+(k+1)%5,(i+1)*5+k))
        faces += [tuple(reversed(range(5))),tuple(range(20,25))]
        data=bpy.data.meshes.new('continuous tapering wisp');data.from_pydata(verts,[],faces);data.update()
        tail=bpy.data.objects.new('continuous tapering wisp',data);bpy.context.collection.objects.link(tail);data.materials.append(wisp);weight(tail,'Tail')
    # One weighted mesh, separate materials retained. Rigid chunks really deform with bones.
    bpy.ops.object.select_all(action='DESELECT')
    for o in pieces:o.select_set(True)
    bpy.context.view_layer.objects.active=pieces[0];bpy.ops.object.join();body=bpy.context.object;body.name=job['keep'][0]
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    arm=body.modifiers.new('authored rigid segment skin','ARMATURE');arm.object=rig;body.parent=rig
    rig.animation_data_create();scene=bpy.context.scene;scene.render.fps=24
    lengths={'idle':24,'run':24,'attack':24,'hit':9,'death':18}
    for state,clipname in job['animations'].items():
        action=bpy.data.actions.new(clipname);action.use_fake_user=True;rig.animation_data.action=action
        for f in range(lengths[state]+1):
            t=f/lengths[state];s=math.sin(t*math.tau)
            for b in rig.pose.bones:b.location=(0,0,0);b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion();b.scale=(1,1,1)
            if guardian:
                # Rest arms are lateral; every deliverable frame is a relaxed/raised articulated pose.
                for side in (-1,1):
                    suf='L' if side<0 else 'R';a=1.02+.025*s
                    if state=='run':a+=side*.22*s;move_world(rig,f'Leg.{suf}',(0,side*.095*s,max(0,side*s)*.09))
                    if state=='attack':
                        # 0..55% windup, 55..65% slam, held impact and recovery.
                        if t<.55:a=1.02-2.5*math.sin(t/.55*math.pi/2)
                        elif t<.65:a=-1.48+3.05*(t-.55)/.1
                        else:a=1.57-.55*(t-.65)/.35
                        rot(rig,'Body',(1,0,0),-.13*math.sin(t*math.pi) if t<.55 else .18*math.sin((t-.55)/.45*math.pi))
                    if state=='hit':a+=.28*math.sin(t*math.pi);rot(rig,'Body',(1,0,0),-.18*math.sin(t*math.pi))
                    if state=='death':a=1.02+.36*t;move_world(rig,f'Leg.{suf}',(side*.13*t,0,0));rot(rig,'Body',(1,0,0),.7*t)
                    rot(rig,f'Arm.{suf}',(0,side,0),a)
                    shoulder=rig.pose.bones[f'Arm.{suf}']
                    forward_axis=shoulder.bone.matrix_local.to_3x3().inverted()@Vector((0,0,1))
                    shoulder.rotation_quaternion=Quaternion(forward_axis,-side*.3)@shoulder.rotation_quaternion
                    rot(rig,f'Forearm.{suf}',(0,side,0),.15+.07*s)
                z=.012*s if state=='idle' else .025*abs(s) if state=='run' else -.24*t if state=='death' else -.08*max(0,math.sin((t-.55)/.45*math.pi)) if state=='attack' and t>.55 else 0
                move_world(rig,'Body',(0,0,z))
                rot(rig,'Head',(0,0,1),.025*s)
            else:
                bob=.02*s;spread=0;orbit=.07*s
                if state=='run':bob=.04*s;orbit=.9*t;rot(rig,'Core',(1,0,0),.15+.07*s)
                if state=='attack':spread=.24*math.sin(t*math.pi);bob=.09*math.sin(t*math.pi);orbit=.25*math.sin(t*math.pi);rot(rig,'Core',(1,0,0),-.22*math.sin(t*math.pi*2));move_world(rig,'Nose',(0,-.16*max(0,math.sin((t-.4)*math.pi)),0))
                if state=='hit':rot(rig,'Core',(0,1,0),.27*math.sin(t*math.pi));bob=-.035*math.sin(t*math.pi)
                if state=='death':bob=-.32*t;rot(rig,'Core',(0,1,0),.7*t);spread=.13*t
                move_world(rig,'Core',(0,0,bob));rot(rig,'Tail',(0,0,1),(.12 if state=='idle' else .22)*s)
                for i in range(4):
                    a=i*math.tau/4+.4;radius=.61+spread
                    move_world(rig,f'Shard{i}',(radius*math.cos(a+orbit)-.61*math.cos(a),(.49+spread)*math.sin(a+orbit)-.49*math.sin(a),(.015 if state=='idle' else .025)*math.sin(t*math.tau+i)))
                    rot(rig,f'Shard{i}',(0,1,0),.12*math.sin(t*math.tau+i)+(.5*t if state=='death' else 0))
            for b in rig.pose.bones:
                for prop in ('location','rotation_quaternion','scale'):b.keyframe_insert(prop,frame=f)
        # NLA track makes every action exportable with its exact name, no scene action merging.
        tr=rig.animation_data.nla_tracks.new();tr.name=clipname;tr.strips.new(clipname,0,action);tr.mute=True
    rig.animation_data.action=None
    for b in rig.pose.bones:b.location=(0,0,0);b.rotation_quaternion=Quaternion();b.scale=(1,1,1)
    scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=str(source/(job['name']+'-original.blend')))
    bpy.ops.export_scene.gltf(filepath=job['model'],export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_nla_strips=True,export_force_sampling=True)
    print('ORIGINAL_MODEL',job['name'],len(body.data.vertices),'vertices',len(rig.pose.bones),'bones',flush=True)
