"""Independent read-only reopened-blend anchor proof; no rendering or source writes.
Run Blender --python this_file -- config.json; emits GROUND_ANCHOR_JSON.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

config = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())
reports = []
for job in config['characters']:
    info = json.loads((Path(config['output']) / job['name'] / 'frames.json').read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=job['model'])
    original_rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    defaults = {b.name: b.matrix_basis.copy() for b in original_rig.pose.bones}
    bpy.ops.wm.open_mainfile(filepath=str(Path(config['source']) / (job['name'] + '-baked.blend')))
    scene = bpy.context.scene
    camera = scene.camera
    rig = next(o for o in scene.objects if o.type == 'ARMATURE')
    facing = bpy.data.objects['Facing']
    bpy.context.view_layer.update()
    assert camera.data.type == 'ORTHO'
    assert abs(camera.data.ortho_scale - info['framing']['ortho_scale']) < 1e-6
    target = Vector(info['framing']['target'])
    pitch = math.radians(config['pitch'])
    expected_location = target + Vector((0, -6 * math.cos(pitch), 6 * math.sin(pitch)))
    assert (camera.location - expected_location).length < 1e-6
    assert camera.rotation_euler.to_quaternion().rotation_difference(
        (target - camera.location).to_track_quat('-Z', 'Y')).angle < 1e-6
    assert scene.render.resolution_x == scene.render.resolution_y == 128
    # Separate analytical orthographic projection of world ground origin, not a
    # metadata-to-metadata comparison and not the bake's anchor helper.
    local_origin = camera.matrix_world.inverted() @ Vector((0, 0, 0))
    analytical = {'x': .5 + local_origin.x / camera.data.ortho_scale,
                  'y': .5 - local_origin.y / camera.data.ortho_scale}
    assert max(abs(analytical[k] - info['anchor'][k]) for k in ('x', 'y')) < 1e-6
    lights = [o for o in scene.objects if o.type == 'LIGHT']
    assert lights and all(not o.data.use_shadow for o in lights)
    visible_meshes = [o.name for o in scene.objects if o.type == 'MESH' and not o.hide_render]
    assert all(not any(word in name.lower() for word in ('ground', 'shadow', 'plane')) for name in visible_meshes)
    max_error = 0
    for record in info['frames']:
        state, direction = record['animation'].rsplit('_', 1)
        rig.animation_data.action = None
        for bone in rig.pose.bones:
            bone.matrix_basis = defaults[bone.name].copy()
        action = bpy.data.actions[job['animations'][state]]
        rig.animation_data.action = action
        rig.animation_data.action_slot = action.slots[0]
        facing.rotation_euler.z = math.radians(config['directions'][direction])
        frame = record['source_frame']
        scene.frame_set(math.floor(frame), subframe=frame % 1)
        rig.location.x = rig.location.y = 0
        bpy.context.view_layer.update()
        projected = world_to_camera_view(scene, camera, Vector((0, 0, 0)))
        measured = {'x': projected.x, 'y': 1 - projected.y}
        error = max(abs(measured[k] - analytical[k]) for k in ('x', 'y'))
        assert error < 1e-6, (job['name'], record['name'], error)
        max_error = max(max_error, error)
    states_directions = sorted({r['animation'] for r in info['frames']})
    assert len(states_directions) == 40
    reports.append({'id': job['name'], 'ok': True, 'frames_checked': len(info['frames']),
        'saved_camera_anchor': analytical, 'metadata_anchor': info['anchor'],
        'max_error_px': max_error * 128, 'states_directions': states_directions,
        'visible_meshes': visible_meshes, 'baked_ground_shadow': False,
        'light_shadows': False, 'screenshots': 0})
print('GROUND_ANCHOR_JSON ' + json.dumps({'ok': True, 'results': reports}))
