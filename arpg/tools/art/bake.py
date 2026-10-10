"""Blender 5.2 headless glTF -> fixed-camera RGBA frames and pose evidence.
Run blender -b --factory-startup --python bake.py -- config.json [--preview].
Keep all 3D originals and modified .blend scenes under source/; deliver WebP only.
"""
import json
import math
import sys
import time
from pathlib import Path

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
config = json.loads(Path(args[0]).read_text())
preview = '--preview' in args
out = Path(config['output'])
out.mkdir(parents=True, exist_ok=True)
source_dir = Path(config['source'])
source_dir.mkdir(parents=True, exist_ok=True)


def material(name, color, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .85
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return mat


def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    curve.resolution_u = 1
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    # glTF import selects the entire rig. Converting that selection used to apply
    # every armature modifier at T-Pose, permanently freezing the hero-bow body.
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def orb(name, center, radius, mat):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    # Mesh coordinates are local, not a translated origin: attach at grip origin.
    for vertex in obj.data.vertices:
        vertex.co += Vector(center)
    obj.location = (0, 0, 0)
    obj.select_set(False)
    return obj


def attach(obj, reference, rig, bone=None):
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = bone or reference.parent_bone
    obj.matrix_basis = reference.matrix_basis.copy()


def attach_at_hand(obj, rig, bone_name):
    bone = rig.pose.bones[bone_name]
    parent_world = rig.matrix_world @ bone.matrix @ Matrix.Translation((0, bone.length, 0))
    desired = Matrix.Translation(rig.matrix_world @ bone.tail)
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name
    obj.matrix_basis = parent_world.inverted() @ desired


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def evaluated_vertices(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


results = []
for job in config['characters']:
    if '--only' in args and job['name'] != args[args.index('--only') + 1]:
        continue
    start = time.perf_counter()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24
    bpy.ops.import_scene.gltf(filepath=job['model'])
    rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
    # glTF's static joint transforms are the baseline for channels a clip omits.
    # In Quaternius Idle only arm translation is keyed; identity rotation would
    # replace the authored relaxed stance with a T-pose.
    default_basis = {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    rig.animation_data.use_nla = False
    meshes = []
    for obj in list(scene.objects):
        if obj.type == 'MESH':
            if obj.name not in job['keep']:
                bpy.data.objects.remove(obj, do_unlink=True)
            else:
                meshes.append(obj)
    skinned = [obj for obj in meshes if any(mod.type == 'ARMATURE' for mod in obj.modifiers)]
    actions = {action.name: action for action in bpy.data.actions}

    def action(name):
        # Sparse clips must never inherit unkeyed transforms from the last clip.
        rig.animation_data.action = None
        for bone in rig.pose.bones:
            bone.matrix_basis = default_basis[bone.name].copy()
        clip = actions[name]
        rig.animation_data.action = clip
        rig.animation_data.action_slot = clip.slots[0]
        return clip

    if 'T-Pose' in actions:
        action('T-Pose')
    else:
        rig.animation_data.action = None
        for bone in rig.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
    scene.frame_set(0)
    bpy.context.view_layer.update()
    arm_names = job.get('arm_bones', ['upperarm.l', 'upperarm.r'])
    assert all(name in rig.pose.bones for name in arm_names), job['name']
    bind_arm = {name: rig.pose.bones[name].matrix_basis.to_quaternion().copy() for name in arm_names}
    # Store actual evaluated rest geometry. This detects the old destructive
    # conversion even when the animated pose bones themselves continue moving.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bind_vertices = {obj.name: evaluated_vertices(obj, depsgraph) for obj in skinned}
    bind_points = [point for points in bind_vertices.values() for point in points]
    bind_height = max(point.z for point in bind_points) - min(point.z for point in bind_points)
    # Establish the grip in idle with weapons upright in world Z. Attach the
    # local inverse transform once; attacks still inherit the animated hand.
    action(job['animations']['idle'])
    scene.frame_set(0)
    bpy.context.view_layer.update()
    weapon_meshes = []
    reference = bpy.data.objects.get('1H_Sword')
    weapon = job.get('weapon')
    if reference and weapon == 'sword':
        reference.scale *= 1.1
        weapon_meshes.append(reference)
    elif weapon in ('bow', 'focus', 'goblin-sword'):
        if reference:
            reference.hide_render = True
        wood = material('weapon walnut', (.57, .31, .10))
        bright = material('weapon ivory', (.95, .91, .71))
        if weapon == 'bow':
            points = [(.38 * math.sin(math.pi * i / 16), 0, -.72 + 1.44 * i / 16) for i in range(17)]
            weapon_meshes = [tube('longbow', points, .060, wood),
                             tube('bowstring', [(0, 0, -.72), (0, 0, .72)], .012, bright)]
        elif weapon == 'focus':
            gold = material('staff gold', (.78, .58, .19))
            light = material('staff luminous crystal', (.24, .92, 1.0), emission=2.5)
            weapon_meshes = [tube('staff shaft', [(0, 0, -.28), (0, 0, 1.12)], .060, wood),
                             tube('staff crown', [(-.14, 0, .92), (0, 0, 1.17), (.14, 0, .92)], .045, gold),
                             orb('staff crystal', (0, 0, 1.16), .15, light)]
        else:
            steel = material('goblin blade', (.78, .82, .85))
            weapon_meshes = [tube('goblin sword', [(0, 0, -.15), (0, 0, .65)], .055, steel),
                             tube('goblin guard', [(-.16, 0, 0), (.16, 0, 0)], .035, wood)]
        for obj in weapon_meshes:
            if reference:
                attach_at_hand(obj, rig, 'handslot.l' if weapon == 'bow' else 'handslot.r')
            else:
                attach_at_hand(obj, rig, job['weapon_bone'])
            meshes.append(obj)
    if job.get('crown'):
        crown = material('chief crown gold', (.95, .70, .18))
        # A raised, closed eight-point crown reads from every octant, not a
        # flat ornament buried in the forehead. Original procedural CC0 geometry.
        points = []
        for index in range(17):
            theta = index * math.pi / 8
            points.append((.30 * math.cos(theta), .30 * math.sin(theta), .38 if index % 2 else .06))
        obj = tube('chief crown', points, .065, crown)
        head = rig.pose.bones['Head']
        parent_world = rig.matrix_world @ head.matrix @ Matrix.Translation((0, head.length, 0))
        obj.parent = rig
        obj.parent_type = 'BONE'
        obj.parent_bone = 'Head'
        obj.matrix_basis = parent_world.inverted() @ Matrix.Translation((0, 0, bind_height * 1.01))
        meshes.append(obj)
    for obj in skinned:
        assert any(mod.type == 'ARMATURE' and mod.object == rig for mod in obj.modifiers), f'Frozen skin: {obj.name}'
    if job.get('neutral'):
        for mat in {mat for obj in meshes for mat in obj.data.materials}:
            if not mat.use_nodes:
                continue
            shader = mat.node_tree.nodes.get('Principled BSDF')
            if not shader:
                continue
            color = shader.inputs['Base Color']
            if color.is_linked:
                link = color.links[0]
                original = link.from_socket
                mat.node_tree.links.remove(link)
                mix = mat.node_tree.nodes.new('ShaderNodeMixRGB')
                mix.inputs[0].default_value = .3
                mix.inputs[2].default_value = (.86, .86, .83, 1)
                mat.node_tree.links.new(original, mix.inputs[1])
                mat.node_tree.links.new(mix.outputs[0], color)
            elif mat.name not in ('chief crown gold', 'weapon walnut', 'goblin blade', 'weapon ivory'):
                # Neutral albedo makes Sprite.tint genuine color variation, not
                # a green texture multiplied by another hue.
                old = color.default_value
                luminance = sum(old[:3]) / 3
                color.default_value = (luminance, luminance, luminance, 1)
    bpy.context.view_layer.update()
    if config['outline']['enabled']:
        ink = material('outline ink', (.016, .02, .03))
        ink.use_backface_culling = True
        nodes = ink.node_tree.nodes
        nodes.clear()
        emission = nodes.new('ShaderNodeEmission')
        emission.inputs['Color'].default_value = (.012, .016, .024, 1)
        output = nodes.new('ShaderNodeOutputMaterial')
        ink.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
        for obj in meshes:
            if obj.hide_render:
                continue
            hull = obj.copy()
            hull.data = obj.data.copy()
            hull.name = obj.name + '_outline'
            bpy.context.collection.objects.link(hull)
            bm = bmesh.new()
            bm.from_mesh(hull.data)
            bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
            bm.to_mesh(hull.data)
            bm.free()
            hull.data.materials.clear()
            hull.data.materials.append(ink)
            for polygon in hull.data.polygons:
                polygon.material_index = 0
            modifier = hull.modifiers.new('outline expansion', 'DISPLACE')
            world_scale = sum(abs(value) for value in obj.matrix_world.to_scale()) / 3
            modifier.strength = -config['outline']['thickness'] / world_scale
            modifier.mid_level = 0
            modifier.direction = 'NORMAL'
    root = bpy.data.objects.new('Facing', None)
    bpy.context.collection.objects.link(root)
    # Preserve the imported transform (Quaternius uses a rotated 100x rig).
    old_world = rig.matrix_world.copy()
    rig.parent = root
    rig.matrix_world = old_world

    # A viewport-only bone.location edit is NOT stable: render evaluation
    # reapplies action F-curves and restores death/root travel. Constant drivers
    # suppress horizontal root channels in both viewport and render depsgraphs.
    # Imported root/hips local axes are orthogonal to world Z for these rigs.
    root_drivers = []
    for bone_name in job.get('root_bones', ['root', 'hips']):
        bone = rig.pose.bones.get(bone_name)
        if not bone:
            continue
        basis = rig.matrix_world.to_3x3() @ bone.bone.matrix_local.to_3x3()
        for index in range(3):
            axis = basis @ Vector(tuple(float(i == index) for i in range(3)))
            if abs(axis.normalized().z) < .001:
                bone.driver_add('location', index).driver.expression = '0.0'
                root_drivers.append({'bone': bone_name, 'channel': index})
            else:
                assert abs(axis.normalized().z) > .999, (bone_name, 'non-axis-aligned root')

    def in_place():
        rig.location.x = rig.location.y = 0
        bpy.context.view_layer.update()

    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = config.get('samples', 16)
    scene.render.resolution_x = scene.render.resolution_y = config['frame_size']
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.world = bpy.data.worlds.new('World')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.32, .36, .45, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .35
    pitch = math.radians(config['pitch'])
    target = Vector((0, 0, bind_height / 2))
    camera_data = bpy.data.cameras.new('Camera')
    camera = bpy.data.objects.new('Camera', camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = target + Vector((0, -6 * math.cos(pitch), 6 * math.sin(pitch)))
    aim(camera, target)
    camera_data.type = 'ORTHO'
    scene.camera = camera
    up = camera.rotation_euler.to_matrix() @ Vector((0, 1, 0))
    right = camera.rotation_euler.to_matrix() @ Vector((1, 0, 0))
    def sample(clip_name, angle, frame):
        # Restore sparse-channel defaults for *every* sample. The envelope and
        # delivered render must not inherit different unkeyed bone transforms.
        action(clip_name)
        root.rotation_euler.z = math.radians(angle + job.get('facing_offset', 0))
        scene.frame_set(math.floor(frame), subframe=frame % 1)
        in_place()

    visible_meshes = [obj for obj in scene.objects if obj.type == 'MESH' and not obj.hide_render]
    # Envelope ALL delivered samples, including outline hulls; fixed ground
    # anchor and no per-frame fit. Share exactly the render's sample function.
    projected_x, projected_y = [], []
    for clip_name in job['animations'].values():
        clip = action(clip_name)
        begin, end = clip.frame_range
        count = max(2, math.ceil((end - begin) / scene.render.fps * config['fps'] - 1e-5))
        for angle in config['directions'].values():
            root.rotation_euler.z = math.radians(angle + job.get('facing_offset', 0))
            for index in range(count):
                frame = begin + index / config['fps'] * scene.render.fps
                sample(clip_name, angle, frame)
                depsgraph = bpy.context.evaluated_depsgraph_get()
                for obj in visible_meshes:
                    if not obj.hide_render:
                        for point in evaluated_vertices(obj, depsgraph):
                            projected_x.append(point.dot(right))
                            projected_y.append(point.dot(up))
    target += right * ((min(projected_x) + max(projected_x)) / 2 - target.dot(right))
    target += up * ((min(projected_y) + max(projected_y)) / 2 - target.dot(up))
    camera.location = target + Vector((0, -6 * math.cos(pitch), 6 * math.sin(pitch)))
    aim(camera, target)
    framing_margin = job.get('framing_margin', 1.13)
    camera_data.ortho_scale = max(max(projected_x) - min(projected_x), max(projected_y) - min(projected_y)) * framing_margin
    print('FRAMING', job['name'], 'ortho', camera_data.ortho_scale, flush=True)
    for name, location, power, size, color in [('key', (-3, -4, 7), 420, 4, (1, .88, .73)),
                                               ('rim', (3, 2, 4), 260, 3, (.65, .78, 1))]:
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy = power
        light_data.shape = 'DISK'
        light_data.size = size
        light_data.color = color
        light_data.use_shadow = False
        light = bpy.data.objects.new(name, light_data)
        bpy.context.collection.objects.link(light)
        light.location = location
        aim(light, (0, 0, bind_height / 2))
    origin = world_to_camera_view(scene, camera, Vector((0, 0, 0)))
    anchor = {'x': origin.x, 'y': 1 - origin.y}
    records = []
    for animation, clip_name in job['animations'].items():
        clip = action(clip_name)
        begin, end = clip.frame_range
        count = max(2, math.ceil((end - begin) / scene.render.fps * config['fps'] - 1e-5))
        if preview:
            count = 1
        for direction, angle in config['directions'].items():
            root.rotation_euler.z = math.radians(angle + job.get('facing_offset', 0))
            for index in range(count):
                frame = begin + index / config['fps'] * scene.render.fps
                sample(clip_name, angle, frame)
                name = f'{animation}_{direction}_{index:03d}'
                folder = out / job['name']
                folder.mkdir(parents=True, exist_ok=True)
                # Local arm quaternion distance detects T-pose independent of
                # facing. Geometry evidence also catches frozen arm modifiers.
                arm_degrees = [math.degrees(rig.pose.bones[bone].matrix_basis.to_quaternion().rotation_difference(bind_arm[bone]).angle) for bone in arm_names]
                inverse_facing = root.matrix_world.inverted()
                depsgraph = bpy.context.evaluated_depsgraph_get()
                square_distances = []
                for obj in skinned:
                    assert any(mod.type == 'ARMATURE' and mod.object == rig for mod in obj.modifiers), obj.name
                    current = evaluated_vertices(obj, depsgraph)
                    rest = bind_vertices[obj.name]
                    assert len(current) == len(rest)
                    square_distances.extend((inverse_facing @ point - original).length_squared for point, original in zip(current, rest))
                rms = math.sqrt(sum(square_distances) / len(square_distances)) / bind_height
                assert max(arm_degrees) > 10, (job['name'], name, 'T-pose arms', arm_degrees)
                assert rms > .015, (job['name'], name, 'bind/frozen skin', rms)
                # Fail before rasterisation if framing and delivered geometry
                # disagree. Leave a 2px buffer for antialiasing and WebP alpha.
                projected = [world_to_camera_view(scene, camera, point)
                             for obj in visible_meshes
                             for point in evaluated_vertices(obj, depsgraph)]
                bounds = [min(p.x for p in projected), min(p.y for p in projected),
                          max(p.x for p in projected), max(p.y for p in projected)]
                assert min(bounds[:2]) > 2 / config['frame_size'] and max(bounds[2:]) < 1 - 2 / config['frame_size'], (job['name'], name, bounds)
                scene.render.filepath = str(folder / (name + '.png'))
                bpy.ops.render.render(write_still=True)
                weapon_points = [point for obj in weapon_meshes for point in evaluated_vertices(obj, depsgraph)]
                weapon_projection = [world_to_camera_view(scene, camera, point) for point in weapon_points]
                weapon_bbox = None
                if weapon_projection:
                    weapon_bbox = [round(min(point.x for point in weapon_projection) * config['frame_size'], 2),
                                   round((1 - max(point.y for point in weapon_projection)) * config['frame_size'], 2),
                                   round(max(point.x for point in weapon_projection) * config['frame_size'], 2),
                                   round((1 - min(point.y for point in weapon_projection)) * config['frame_size'], 2)]
                records.append({'name': name, 'animation': animation + '_' + direction, 'frame': index,
                                'source': clip_name, 'source_frame': round(frame, 4),
                                'pose': {'arm_degrees_from_bind': [round(value, 4) for value in arm_degrees],
                                         'skin_rms_from_bind_height': round(rms, 6),
                                         'armature_modifiers': len(skinned)}, 'weapon_bbox': weapon_bbox})
        print('BAKED_ANIMATION', job['name'], animation, count, flush=True)
    elapsed = time.perf_counter() - start
    data = {'name': job['name'], 'frames': records, 'seconds': elapsed, 'engine': scene.render.engine,
            'fps': config['fps'], 'source': job['model'], 'preview': preview, 'anchor': anchor,
            'framing': {'ortho_scale': camera_data.ortho_scale, 'target': list(target),
                        'margin_factor': framing_margin, 'includes_outline_hulls': True, 'root_motion_drivers': root_drivers},
            'pose_check': {'bind_reference': 'evaluated T-Pose/rest mesh + local arm quaternion',
                           'skinned_objects': [obj.name for obj in skinned], 'arm_bones': arm_names}}
    (out / job['name'] / 'frames.json').write_text(json.dumps(data, indent=2))
    root.rotation_euler.z = 0
    action(job['animations']['idle'])
    scene.frame_set(0)
    in_place()
    bpy.ops.wm.save_as_mainfile(filepath=str(source_dir / (job['name'] + '-baked.blend')))
    results.append(data)
    print('BAKED_SHEET', job['name'], elapsed, flush=True)
(out / 'bake-summary.json').write_text(json.dumps([{'name': result['name'], 'seconds': result['seconds'],
                                                 'count': len(result['frames'])} for result in results], indent=2))
