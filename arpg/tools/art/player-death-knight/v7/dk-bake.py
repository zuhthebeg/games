import bpy, bmesh, math, sys, json, time
import numpy as np
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

P = Path(r"\\wsl.localhost\Debian\home\cocy\.openclaw\workspace\tmp\dk-remodel-1108")
argv = sys.argv[sys.argv.index('--') + 1:]
OUT = Path(argv[0]); OUT.mkdir(parents=True, exist_ok=True)
opt = {a.split('=')[0]: a.split('=')[1] for a in argv[1:] if '=' in a}
ONLY = opt['only'].split(',') if 'only' in opt else None
DIRS_ALL = {'E': 90, 'SE': 45, 'S': 0, 'SW': -45, 'W': -90, 'NW': -135, 'N': 180, 'NE': 135}
DIRS = {k: v for k, v in DIRS_ALL.items() if 'dirs' not in opt or k in opt['dirs'].split(',')}
FRAME = 256; PITCH = 40; THICK = 0.008; MARGIN = 1.13
STATES = ['idle', 'run', 'attack', 'hit', 'death', 'dodge', 'magic']

bpy.ops.wm.open_mainfile(filepath=str(P / 'death-knight-v7-rig.blend'))
s = bpy.context.scene
arm = bpy.data.objects['DK Rig']
cam = bpy.data.objects['cam']; cd = cam.data
s.render.engine = 'BLENDER_EEVEE'
s.eevee.taa_render_samples = int(opt.get('samples', 16))
s.render.resolution_x = s.render.resolution_y = FRAME
s.render.resolution_percentage = 100
s.render.film_transparent = True
s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_mode = 'RGBA'; s.render.image_settings.color_depth = '8'
cd.type = 'ORTHO'; s.camera = cam

arm.animation_data.action = bpy.data.actions['idle']; s.frame_set(1)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()

def emissive(mat):
    if not mat or not mat.use_nodes: return False
    for n in mat.node_tree.nodes:
        if n.type == 'EMISSION': return True
        if n.type == 'BSDF_PRINCIPLED':
            es = n.inputs['Emission Strength'].default_value
            ec = n.inputs['Emission Color'].default_value
            if es > 0 and (ec[0] + ec[1] + ec[2]) > 0.05: return True
    return False

ink = bpy.data.materials.new('outline ink'); ink.use_nodes = True; ink.use_backface_culling = True
nt = ink.node_tree; nt.nodes.clear()
em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (.012, .016, .024, 1)
outn = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], outn.inputs['Surface'])

meshes = [o for o in s.objects if o.type == 'MESH' and not o.hide_render]
nh = 0
for o in list(meshes):
    if any(emissive(m) for m in o.data.materials) or 'flame' in o.name.lower():
        continue
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    if len(me.polygons) == 0:
        bpy.data.meshes.remove(me); continue
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.reverse_faces(bm, faces=list(bm.faces)); bm.to_mesh(me); bm.free()
    me.materials.clear(); me.materials.append(ink)
    for p in me.polygons: p.material_index = 0
    h = bpy.data.objects.new(o.name + '_outline', me)
    s.collection.objects.link(h)
    h.parent = o.parent; h.parent_type = o.parent_type; h.parent_bone = o.parent_bone
    h.matrix_parent_inverse = o.matrix_parent_inverse.copy(); h.matrix_basis = o.matrix_basis.copy()
    mod = h.modifiers.new('outline expansion', 'DISPLACE')
    sc = sum(abs(v) for v in o.matrix_world.to_scale()) / 3
    mod.strength = -THICK / max(sc, 1e-6); mod.mid_level = 0; mod.direction = 'NORMAL'
    nh += 1
print('HULLS', nh, flush=True)

facing = bpy.data.objects.new('Facing', None); s.collection.objects.link(facing)
anchor = bpy.data.objects.new('Anchor', None); s.collection.objects.link(anchor)
anchor.parent = facing
old = arm.matrix_world.copy()
arm.parent = anchor; arm.matrix_world = old
bpy.context.view_layer.update()

pitch = math.radians(PITCH)
def aim_cam(target):
    cam.location = target + Vector((0, -6 * math.cos(pitch), 6 * math.sin(pitch)))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
aim_cam(Vector((0, 0, 1.0)))
bpy.context.view_layer.update()
R = cam.rotation_euler.to_matrix()
right = np.array(R @ Vector((1, 0, 0))); up = np.array(R @ Vector((0, 1, 0)))

def frames_of(state):
    act = bpy.data.actions[state]
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    if state in ('idle', 'run'): f1 -= 1
    return act, list(range(f0, f1 + 1))

def settle(state, f, ang=0.0):
    facing.rotation_euler.z = 0; anchor.location = (0, 0, 0)
    arm.animation_data.action = bpy.data.actions[state]
    s.frame_set(f); bpy.context.view_layer.update()
    h = arm.matrix_world @ arm.pose.bones['root'].head
    anchor.location = (-h.x, -h.y, 0)
    facing.rotation_euler.z = math.radians(ang)
    bpy.context.view_layer.update()
    return h

real = [o for o in meshes]
def world_points():
    d = bpy.context.evaluated_depsgraph_get(); out = []
    for o in real:
        e = o.evaluated_get(d); me = e.to_mesh(); n = len(me.vertices)
        if n:
            co = np.empty(n * 3, dtype=np.float32); me.vertices.foreach_get('co', co)
            M = np.array(e.matrix_world)
            out.append(co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3])
        e.to_mesh_clear()
    return np.concatenate(out)

t0 = time.time()
xs = []; ys = []
for st in STATES:
    if ONLY and st not in ONLY: continue
    act, fr = frames_of(st)
    for f in fr:
        settle(st, f, 0.0)
        pts = world_points()
        for ang in DIRS.values():
            a = math.radians(ang); c, sn = math.cos(a), math.sin(a)
            q = pts.copy(); q[:, 0] = c * pts[:, 0] - sn * pts[:, 1]; q[:, 1] = sn * pts[:, 0] + c * pts[:, 1]
            xs += [float((q @ right).min()), float((q @ right).max())]
            ys += [float((q @ up).min()), float((q @ up).max())]
xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
tgt = np.zeros(3)
target = Vector((0, 0, 0)) + Vector(right) * ((xmin + xmax) / 2) + Vector(up) * ((ymin + ymax) / 2)
ortho = max(xmax - xmin, ymax - ymin) * MARGIN
aim_cam(target); cd.ortho_scale = ortho
bpy.context.view_layer.update()
print('FRAMING', ortho, list(target), 'envelope', round(time.time() - t0, 1), flush=True)

og = world_to_camera_view(s, cam, Vector((0, 0, 0)))
anch = {'x': og.x, 'y': 1 - og.y}
records = []
SOCK = ['hand.R', 'hand.L', 'foot.R', 'foot.L']
def px(v):
    p = world_to_camera_view(s, cam, v); return [round(p.x * FRAME, 2), round((1 - p.y) * FRAME, 2)]
for st in STATES:
    if ONLY and st not in ONLY: continue
    act, fr = frames_of(st)
    for dname, ang in DIRS.items():
        for i, f in enumerate(fr):
            settle(st, f, ang)
            name = f'{st}_{dname}_{i:03d}'
            s.render.filepath = str(OUT / (name + '.png'))
            bpy.ops.render.render(write_still=True)
            sock = {b: px(arm.matrix_world @ arm.pose.bones[b].tail) for b in SOCK}
            records.append({'name': name, 'animation': f'{st}_{dname}', 'frame': i, 'source': st, 'source_frame': f, 'sockets': sock})
    print('BAKED', st, len(fr), round(time.time() - t0, 1), flush=True)
(OUT / 'frames.json').write_text(json.dumps({'name': 'player-death-knight-v7', 'fps': 12, 'anchor': anch,
    'framing': {'ortho_scale': ortho, 'target': list(target), 'margin_factor': MARGIN, 'includes_outline_hulls': False, 'in_place_root_xy': True},
    'frames': records}, indent=1))
print('BAKE_DONE', len(records), round(time.time() - t0, 1), flush=True)
