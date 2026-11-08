import bpy, math, re
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix, Euler, Quaternion

P = Path(r"\\wsl.localhost\Debian\home\cocy\.openclaw\workspace\tmp\dk-remodel-1108")
bpy.ops.wm.open_mainfile(filepath=str(P / 'death-knight-v7.blend'))
s = bpy.context.scene
s.render.fps = 12
vl = bpy.context.view_layer

# ---------- armature ----------
BONES = {  # name: (head, tail, parent)
    'root':  ((0, 0, 0), (0, 0, .25), None),
    'hips':  ((0, 0, .98), (0, 0, 1.12), 'root'),
    'spine': ((0, 0, 1.12), (0, 0, 1.55), 'hips'),
    'neck':  ((0, 0, 1.55), (0, 0, 1.78), 'spine'),
    'head':  ((0, 0, 1.78), (0, 0, 2.15), 'neck'),
    'cape':  ((0, .42, 1.72), (0, .55, .30), 'spine'),
}
for side, sg in (('L', 1), ('R', -1)):
    BONES.update({
        f'upperarm.{side}': ((sg * .46, 0, 1.42), (sg * .55, 0, 1.04), 'spine'),
        f'forearm.{side}':  ((sg * .55, 0, 1.04), (sg * .58, -.04, .76), f'upperarm.{side}'),
        f'hand.{side}':     ((sg * .58, -.04, .76), (sg * .57, -.06, .55), f'forearm.{side}'),
        f'thigh.{side}':    ((sg * .20, 0, .98), (sg * .25, -.04, .55), 'hips'),
        f'shin.{side}':     ((sg * .25, -.04, .55), (sg * .27, -.05, .20), f'thigh.{side}'),
        f'foot.{side}':     ((sg * .27, -.05, .20), (sg * .30, -.38, .04), f'shin.{side}'),
    })

adata = bpy.data.armatures.new('DK Rig')
arm = bpy.data.objects.new('DK Rig', adata)
s.collection.objects.link(arm)
vl.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = {}
for n, (h, t, p) in BONES.items():
    b = adata.edit_bones.new(n)
    b.head = h; b.tail = t
    eb[n] = b
for n, (h, t, p) in BONES.items():
    if p: eb[n].parent = eb[p]
bpy.ops.object.mode_set(mode='OBJECT')
vl.update()

# ---------- bind rigid parts to bones ----------
def bone_for(n):
    n = n[3:] if n.startswith('V6 ') else n
    m = re.search(r'(?<=\s)(-?1)(?=_|$)', n)
    sd = None if not m else ('R' if m.group(1) == '-1' else 'L')
    if 'ember' in n or n.startswith('waist') or n.startswith('pelvis') or n.startswith('tasset') or n.startswith('hip'):
        return 'hips'
    if n.startswith('sword') or n.startswith('flame') or n.startswith('tip flame'):
        return 'hand.R'
    if n.startswith('femur') or n.startswith('thigh'): return f'thigh.{sd}'
    if any(n.startswith(k) for k in ('knee', 'poleyn', 'tibia', 'shin', 'ankle')): return f'shin.{sd}'
    if n.startswith('sabaton'): return f'foot.{sd}'
    if any(n.startswith(k) for k in ('humerus', 'upper arm', 'shoulder joint', 'pauldron')): return f'upperarm.{sd}'
    if any(n.startswith(k) for k in ('elbow', 'radius', 'vambrace')): return f'forearm.{sd}'
    if n.startswith('hand palm') or n.startswith('finger'): return f'hand.{sd}'
    if n.startswith('neck'): return 'neck'
    if n.startswith('ornament eye'): return 'head'
    if n.startswith('cape'): return 'cape'
    return 'spine'

orig_world = {o.name: o.matrix_world.copy() for o in bpy.data.objects}
targets = []
for o in list(bpy.data.objects):
    if o is arm or o.type in ('CAMERA',): continue
    if o.parent is not None: continue
    if o.type == 'EMPTY' and o.name == 'V6 head pitch': bn = 'head'
    elif o.type == 'LIGHT':
        if o.name == 'V6 sword fire light': bn = 'hand.R'
        else: continue
    elif o.type == 'MESH': bn = bone_for(o.name)
    else: continue
    targets.append((o, bn))
unmapped_spine = [o.name for o, b in targets if b == 'spine']
for o, bn in targets:
    basis = o.matrix_basis.copy()
    o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = bn
    o.matrix_parent_inverse = Matrix.Identity(4)
    vl.update()
    parent_mat = o.matrix_world @ basis.inverted()
    o.matrix_parent_inverse = parent_mat.inverted()
vl.update()
maxd = 0
for o in bpy.data.objects:
    if o.name in orig_world:
        d = max(abs(a - b) for ra, rb in zip(o.matrix_world, orig_world[o.name]) for a, b in zip(ra, rb))
        maxd = max(maxd, d)
print('RIG_REST_MAX_MATRIX_DIFF', maxd, 'spine parts', len(unmapped_spine))

# ---------- pose helpers ----------
pb = arm.pose.bones
for b in pb: b.rotation_mode = 'QUATERNION'
rest3 = {n: pb[n].bone.matrix_local.to_3x3() for n in pb.keys()}

def set_rot(n, deg):
    e = Euler([math.radians(a) for a in deg], 'XYZ').to_quaternion()
    R = rest3[n]
    pb[n].rotation_quaternion = (R.inverted() @ e.to_matrix() @ R).to_quaternion()

def set_loc(n, v):
    pb[n].location = rest3[n].inverted() @ Vector(v)

body_meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not (o.name.startswith('V6 sword') or o.name.startswith('V6 flame') or o.name.startswith('V6 tip flame'))]
foot_meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('V6 sabaton') and 'gold' not in o.name]
def verts_z(objs):
    zmin = 1e9
    for o in objs:
        n = len(o.data.vertices)
        co = np.empty(n * 3, dtype=np.float32); o.data.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        M = np.array(o.matrix_world)
        z = co @ M[2, :3] + M[2, 3]
        zmin = min(zmin, float(z.min()))
    return zmin

def clear_pose():
    for b in pb:
        b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0); b.scale = (1, 1, 1)

def smooth(a): return a * a * (3 - 2 * a)

def sample(keys, f):
    fs = sorted(keys)
    if f <= fs[0]: return keys[fs[0]]
    if f >= fs[-1]: return keys[fs[-1]]
    for a, b in zip(fs, fs[1:]):
        if a <= f <= b:
            t = smooth((f - a) / (b - a)); A, B = keys[a], keys[b]
            out = {}
            for k in set(A) | set(B):
                va = A.get(k, (0, 0, 0)); vb = B.get(k, (0, 0, 0))
                out[k] = tuple(x + (y - x) * t for x, y in zip(va, vb))
            return out

def apply_pose(d, pin):
    clear_pose()
    d = dict(d)
    lean = d.get('spine', (0, 0, 0))[0] + d.get('hips', (0, 0, 0))[0]
    d['cape'] = (-0.75 * lean + 0.4 * d.get('cape', (0, 0, 0))[0], 0, 0)
    for k, v in d.items():
        if k == 'root_loc': continue
        set_rot(k, v)
    base = d.get('root_loc', (0, 0, 0))
    set_loc('root', base)
    vl.update()
    z = verts_z(foot_meshes if pin == 'feet' else body_meshes)
    set_loc('root', (base[0], base[1], base[2] - z))
    vl.update()

def make_action(name, nframes, fn, pin='feet', loop=True):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    if arm.animation_data is None: arm.animation_data_create()
    arm.animation_data.action = act
    last = nframes if loop else nframes - 1
    for f in range(0, last + 1):
        d = fn(f)
        apply_pose(d, pin)
        for b in pb:
            b.keyframe_insert('rotation_quaternion', frame=f)
            if b.name == 'root': b.keyframe_insert('location', frame=f)
    act.frame_range = (0, last)

def D(**kw): return {k.replace('_', '.', 1) if False else k: v for k, v in kw.items()}

# ---------- animations ----------
def idle(f):
    ph = 2 * math.pi * f / 13
    c, sn = math.cos(ph), math.sin(ph)
    return {
        'spine': (1.5 * sn, 0, 0), 'head': (-1.2 * math.sin(ph - .6), 0, 0), 'cape': (4 + 3 * math.sin(ph - 1), 0, 0),
        'upperarm.R': (-10 + 2 * sn, 6, 0), 'forearm.R': (-14 + 2 * sn, 0, 0), 'hand.R': (8, 0, 0),
        'upperarm.L': (4 - 1.5 * sn, -5, 0), 'forearm.L': (-8, 0, 0),
        'thigh.L': (-4, 0, 0), 'shin.L': (6, 0, 0), 'thigh.R': (4, 0, 0), 'shin.R': (6, 0, 0),
        'hips': (0, 0, 1.2 * sn),
    }

def run(f):
    ph = 2 * math.pi * f / 10
    sn, c = math.sin(ph), math.cos(ph)
    def knee(p): return 10 + 62 * max(0.0, math.cos(p - .35)) ** 1.3
    return {
        'thigh.L': (-40 * sn, 0, 0), 'thigh.R': (40 * sn, 0, 0),
        'shin.L': (knee(ph), 0, 0), 'shin.R': (knee(ph + math.pi), 0, 0),
        'foot.L': (-10 + 12 * sn, 0, 0), 'foot.R': (-10 - 12 * sn, 0, 0),
        'upperarm.L': (42 * sn, -6, 0), 'forearm.L': (-38 - 8 * c, 0, 0),
        'upperarm.R': (-16 - 28 * sn, 8, 0), 'forearm.R': (-34, 0, 0), 'hand.R': (10, 0, 0),
        'hips': (3, 0, -8 * sn), 'spine': (7 + 1.5 * math.cos(2 * ph), 0, 9 * sn),
        'head': (-6, 0, -4 * sn), 'cape': (20 + 8 * math.sin(2 * ph), 0, 0),
    }

LUNGE_LEGS = {'thigh.L': (-42, 0, 0), 'shin.L': (34, 0, 0), 'thigh.R': (22, 0, 0), 'shin.R': (26, 0, 0), 'foot.L': (10, 0, 0)}
BACK_LEGS = {'thigh.L': (-6, 0, 0), 'shin.L': (14, 0, 0), 'thigh.R': (16, 0, 0), 'shin.R': (22, 0, 0)}
def PZ(base, **kw):
    d = dict(base); d.update(kw); return d
# two-cut combo: diagonal downward cut (high right -> low left), then rising backhand (low left -> high right)
ATTACK = {
    0: idle(0),
    2: PZ(BACK_LEGS, hips=(-2, 0, -20), spine=(-6, 0, -26), head=(0, 0, 16),
         **{'upperarm.R': (-138, 52, 0), 'forearm.R': (-62, 0, 0), 'hand.R': (-28, 0, 12),
            'upperarm.L': (-24, -42, 0), 'forearm.L': (-30, 0, 0)}, root_loc=(0, .06, 0), cape=(-10, 0, 0)),
    4: PZ(LUNGE_LEGS, hips=(5, 0, 8), spine=(14, 0, 16), head=(-6, 0, -10),
         **{'upperarm.R': (-88, 8, 34), 'forearm.R': (-14, 0, 0), 'hand.R': (34, 0, 0),
            'upperarm.L': (22, -30, 0), 'forearm.L': (-24, 0, 0)}, root_loc=(0, -.2, 0), cape=(26, 0, 0)),
    5: PZ(LUNGE_LEGS, hips=(8, 0, 16), spine=(20, 0, 32), head=(-8, 0, -22),
         **{'upperarm.R': (-52, -8, 74), 'forearm.R': (-8, 0, 0), 'hand.R': (46, 0, 0),
            'upperarm.L': (26, -34, 0), 'forearm.L': (-24, 0, 0)}, root_loc=(0, -.26, 0), cape=(34, 0, 0)),
    6: PZ(LUNGE_LEGS, hips=(8, 0, 18), spine=(20, 0, 34), head=(-8, 0, -24),
         **{'upperarm.R': (-50, -10, 80), 'forearm.R': (-10, 0, 0), 'hand.R': (44, 0, 0),
            'upperarm.L': (26, -34, 0), 'forearm.L': (-24, 0, 0)}, root_loc=(0, -.26, 0), cape=(34, 0, 0)),
    8: PZ(LUNGE_LEGS, hips=(4, 0, -6), spine=(10, 0, -8), head=(-4, 0, 4),
         **{'upperarm.R': (-92, 26, 24), 'forearm.R': (-6, 0, 0), 'hand.R': (20, 0, 0),
            'upperarm.L': (18, -28, 0), 'forearm.L': (-24, 0, 0)}, root_loc=(0, -.28, 0), cape=(30, 0, 0)),
    9: PZ(LUNGE_LEGS, hips=(0, 0, -22), spine=(2, 0, -32), head=(0, 0, 18),
         **{'upperarm.R': (-118, 62, -6), 'forearm.R': (-22, 0, 0), 'hand.R': (-8, 0, 6),
            'upperarm.L': (-20, -40, 0), 'forearm.L': (-30, 0, 0)}, root_loc=(0, -.26, 0), cape=(16, 0, 0)),
    11: PZ(BACK_LEGS, hips=(0, 0, -8), spine=(2, 0, -12), head=(0, 0, 6),
          **{'upperarm.R': (-60, 28, 0), 'forearm.R': (-34, 0, 0), 'hand.R': (10, 0, 4),
             'upperarm.L': (-8, -14, 0), 'forearm.L': (-14, 0, 0)}, root_loc=(0, -.1, 0)),
    12: idle(0),
}
def attack(f): return sample(ATTACK, f)

HIT = {
    0: idle(0),
    1: {'root_loc': (0, .12, 0), 'spine': (-16, 0, 4), 'head': (-14, 0, 8), 'hips': (-4, 0, 0),
        'upperarm.R': (4, 14, 0), 'forearm.R': (-8, 0, 0), 'hand.R': (4, 0, 0),
        'upperarm.L': (-22, -26, 0), 'forearm.L': (-26, 0, 0),
        'thigh.L': (-14, 0, 0), 'shin.L': (14, 0, 0), 'thigh.R': (10, 0, 0), 'shin.R': (14, 0, 0), 'cape': (-6, 0, 0)},
    3: {'root_loc': (0, .09, 0), 'spine': (-11, 0, 3), 'head': (-10, 0, 6), 'hips': (-3, 0, 0),
        'upperarm.R': (-4, 10, 0), 'forearm.R': (-10, 0, 0), 'hand.R': (6, 0, 0),
        'upperarm.L': (-16, -20, 0), 'forearm.L': (-22, 0, 0),
        'thigh.L': (-10, 0, 0), 'shin.L': (12, 0, 0), 'thigh.R': (8, 0, 0), 'shin.R': (12, 0, 0), 'cape': (-2, 0, 0)},
    7: idle(0),
}
def hit(f): return sample(HIT, f)

DEATH = {
    0: idle(0),
    2: {'thigh.L': (-42, 0, 0), 'shin.L': (78, 0, 0), 'thigh.R': (-30, 0, 0), 'shin.R': (70, 0, 0),
        'spine': (-6, 0, 3), 'head': (-14, 0, 8), 'hips': (-6, 0, 0),
        'upperarm.R': (-12, 40, 0), 'forearm.R': (-24, 0, 0), 'upperarm.L': (-8, -40, 0), 'forearm.L': (-20, 0, 0)},
    5: {'root_rot': (-40, 0, 0), 'thigh.L': (-30, 0, 0), 'shin.L': (60, 0, 0), 'thigh.R': (-18, 0, 0), 'shin.R': (52, 0, 0),
        'spine': (-18, 0, 4), 'head': (-16, 0, 10),
        'upperarm.R': (-10, 62, 0), 'forearm.R': (-18, 0, 0), 'upperarm.L': (-8, -58, 0), 'forearm.L': (-16, 0, 0), 'cape': (-10, 0, 0)},
    7: {'root_rot': (-78, 0, 0), 'thigh.L': (-6, 0, 0), 'shin.L': (22, 0, 0), 'thigh.R': (-4, 0, 0), 'shin.R': (18, 0, 0),
        'spine': (-6, 0, 2), 'head': (-8, 0, 12),
        'upperarm.R': (-4, 72, 0), 'forearm.R': (-10, 0, 0), 'upperarm.L': (-4, -66, 0), 'forearm.L': (-12, 0, 0), 'cape': (-4, 0, 0)},
    9: {'root_rot': (-90, 0, 0), 'thigh.L': (0, 0, -6), 'shin.L': (8, 0, 0), 'thigh.R': (0, 0, 8), 'shin.R': (6, 0, 0),
        'spine': (0, 0, 0), 'head': (-4, 0, 14),
        'upperarm.R': (0, 76, 0), 'forearm.R': (-6, 0, 0), 'upperarm.L': (0, -70, 0), 'forearm.L': (-8, 0, 0), 'cape': (0, 0, 0)},
}
def death(f):
    d = dict(sample(DEATH, f))
    if 'root_rot' in d:
        d['root'] = d.pop('root_rot')
    return d

DODGE = {
    0: idle(0),
    1: {'spine': (28, 0, 0), 'hips': (18, 0, 0), 'head': (-24, 0, 0),
        'thigh.L': (-52, 0, 0), 'shin.L': (66, 0, 0), 'thigh.R': (-34, 0, 0), 'shin.R': (62, 0, 0),
        'upperarm.R': (46, 12, 0), 'forearm.R': (-12, 0, 0), 'hand.R': (20, 0, 0),
        'upperarm.L': (36, -14, 0), 'forearm.L': (-12, 0, 0), 'cape': (22, 0, 0), 'root_loc': (0, -.06, 0)},
    3: {'spine': (40, 0, 0), 'hips': (26, 0, 0), 'head': (-34, 0, 0),
        'thigh.L': (-62, 0, 0), 'shin.L': (46, 0, 0), 'thigh.R': (28, 0, 0), 'shin.R': (50, 0, 0),
        'foot.R': (20, 0, 0),
        'upperarm.R': (66, 14, 0), 'forearm.R': (-8, 0, 0), 'hand.R': (24, 0, 0),
        'upperarm.L': (-44, -24, 0), 'forearm.L': (-20, 0, 0), 'cape': (34, 0, 0), 'root_loc': (0, -.14, 0)},
    4: {'spine': (24, 0, 0), 'hips': (12, 0, 0), 'head': (-18, 0, 0),
        'thigh.L': (-28, 0, 0), 'shin.L': (34, 0, 0), 'thigh.R': (14, 0, 0), 'shin.R': (28, 0, 0),
        'upperarm.R': (30, 10, 0), 'forearm.R': (-20, 0, 0), 'hand.R': (12, 0, 0),
        'upperarm.L': (-20, -16, 0), 'forearm.L': (-16, 0, 0), 'cape': (24, 0, 0), 'root_loc': (0, -.08, 0)},
    5: idle(0),
}
def dodge(f): return sample(DODGE, f)

I0 = idle(0)
MAGIC = {
    0: I0,
    3: PZ(I0, spine=(-4, 0, 6), head=(-6, 0, 4), hips=(-2, 0, 0),
          **{'upperarm.L': (-38, -34, 0), 'forearm.L': (-104, 0, 0), 'hand.L': (0, 0, 0)}, cape=(-6, 0, 0)),
    6: PZ(I0, spine=(8, 0, -4), head=(4, 0, -2), hips=(2, 0, 0),
          **{'upperarm.L': (-92, -10, 0), 'forearm.L': (-8, 0, 0), 'hand.L': (-12, 0, 0)}, root_loc=(0, -.04, 0), cape=(10, 0, 0)),
    9: PZ(I0, spine=(6, 0, -3), head=(2, 0, -1), hips=(1, 0, 0),
          **{'upperarm.L': (-98, -14, 0), 'forearm.L': (-4, 0, 0), 'hand.L': (-16, 0, 0)}, root_loc=(0, -.03, 0), cape=(6, 0, 0)),
    12: I0,
}
def magic(f): return sample(MAGIC, f)

make_action('idle', 13, idle)
make_action('run', 10, run)
make_action('attack', 13, attack, loop=False)
make_action('hit', 8, hit, loop=False)
make_action('death', 10, death, pin='all', loop=False)
make_action('dodge', 6, dodge, loop=False)
make_action('magic', 13, magic, loop=False)
arm.animation_data.action = bpy.data.actions['idle']
s.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(P / 'death-knight-v7-rig.blend'), compress=True)
print('V7_RIG_DONE', [a.name for a in bpy.data.actions], flush=True)
