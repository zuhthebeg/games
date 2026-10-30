"""Bake the original temple diorama into separate ground and occluder plates."""
import bpy
import math
import random
import sys
import time
import json
import os
from pathlib import Path
from mathutils import Vector

OUT = Path(sys.argv[sys.argv.index("--") + 1])
OUT.mkdir(parents=True, exist_ok=True)
started = time.monotonic()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.cycles.denoiser = "OPENIMAGEDENOISE"
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.render.resolution_x = 1400
scene.render.resolution_y = 860
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = -.15
scene.view_settings.gamma = 1
scene.world = bpy.data.worlds.new("subdued dusk sky")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.035, .05, .075, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .6

def mat(name, color, rough=.75, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    tex = nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 3.5
    tex.inputs["Detail"].default_value = 4
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = tuple(v * .60 for v in color) + (1,)
    ramp.color_ramp.elements[1].color = tuple(min(v * 1.35, .82) for v in color) + (1,)
    links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = .08
    bump.inputs["Distance"].default_value = .018
    links.new(tex.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m

stone = mat("weathered warm-grey granite", (.28, .255, .22), .88)
limestone = mat("warm cut limestone", (.34, .30, .24), .82)
step_stone = mat("cut grey granite treads", (.29, .27, .23), .9)
path_stone = mat("darker worn courtyard granite", (.225, .205, .18), .92)
moss = mat("subtle courtyard moss", (.19, .205, .16), .94)
red = mat("bright red lacquer", (.56, .035, .022), .30)
darkwood = mat("aged cypress", (.15, .078, .038))
wood = mat("warm carved wood", (.32, .17, .07))
gold = mat("aged brass leaf", (.52, .29, .075), .28, .72)
tile = mat("glazed vermilion barrel tile", (.48, .085, .025), .34)
brick = mat("warm red kiln brick", (.35, .075, .035), .86)
bronze = mat("incense bronze", (.25, .18, .095), .3, .68)
black = mat("deep interior shadow", (.025, .024, .026))
glow = mat("amber lantern silk", (.76, .25, .045), .4)
compound_stone = mat("warm charcoal compound stone", (.085, .071, .052), .92)
wall_sandstone = mat("warm sandstone wall joints", (.17, .105, .064), .90)
kiln_mortar = mat("deep warm kiln mortar", (.13, .035, .018), .95)
garden_soil = mat("deep garden bed soil", (.045, .058, .048), .96)
foliage = mat("night garden foliage", (.025, .045, .035), .94)

TEXTURES = Path("/home/ubuntu/art-src/temple/textures")
def texture_material(name, color, asset, diffuse=True, normal=True, rough=True, mix=.32):
    material = mat(name, color, .78)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if diffuse:
        image = bpy.data.images.load(str(TEXTURES / f"{asset}_diff_2k.jpg"), check_existing=True)
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.extension = "REPEAT"
        blend = nodes.new("ShaderNodeMixRGB")
        blend.blend_type = "MIX"
        blend.inputs[0].default_value = mix
        blend.inputs[1].default_value = (*color, 1)
        links.new(tex.outputs["Color"], blend.inputs[2])
        links.new(blend.outputs["Color"], bsdf.inputs["Base Color"])
    if rough and (TEXTURES / f"{asset}_rough_2k.jpg").exists():
        image = bpy.data.images.load(str(TEXTURES / f"{asset}_rough_2k.jpg"), check_existing=True)
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        links.new(tex.outputs["Color"], bsdf.inputs["Roughness"])
    if normal and (TEXTURES / f"{asset}_nor_gl_2k.png").exists():
        image = bpy.data.images.load(str(TEXTURES / f"{asset}_nor_gl_2k.png"), check_existing=True)
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.image.colorspace_settings.name = "Non-Color"
        mapping = nodes.new("ShaderNodeNormalMap")
        mapping.inputs["Strength"].default_value = .25
        links.new(tex.outputs["Color"], mapping.inputs["Color"])
        links.new(mapping.outputs["Normal"], bsdf.inputs["Normal"])
    return material

stone = texture_material("weathered granite with cobble detail", (.28, .255, .22),
                         "cobblestone_floor_02", normal=True, mix=.11)
tile = mat("glazed vermilion terracotta roof", (.58, .12, .027), .30, .08)
tile_shadow = mat("red-brown concave tile runs", (.40, .065, .018), .40)
ridge_tile = mat("glazed orange-red ridge caps", (.68, .19, .035), .30, .10)

def glaze_emission(material, color, strength):
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Emission Color"].default_value = (*color, 1)
    shader.inputs["Emission Strength"].default_value = strength

glaze_emission(red, (.22, .008, .003), .32)
glaze_emission(limestone, (.18, .12, .07), .55)
glaze_emission(tile, (.30, .035, .004), .34)
glaze_emission(tile_shadow, (.18, .018, .003), .20)
glaze_emission(ridge_tile, (.38, .085, .012), .55)

def emission_material(name, color, strength):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*color, 1)
    emission.inputs["Strength"].default_value = strength
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material

ember = emission_material("subtle kiln embers", (1.0, .12, .018), .65)
lantern_glow = emission_material("restrained lantern glow", (1.0, .31, .08), .48)
candle_glow = emission_material("candle flame", (1.0, .43, .12), .72)
warm_bay_glow = emission_material("soft amber open altar bay", (.58, .12, .035), .42)
column_stone = emission_material("warm pale column stone", (.24, .17, .09), .65)
occluders = []

sky_material = bpy.data.materials.new("dark dusk sky gradient")
sky_material.use_nodes = True
sky_nodes, sky_links = sky_material.node_tree.nodes, sky_material.node_tree.links
sky_nodes.clear()
sky_coords = sky_nodes.new("ShaderNodeTexCoord")
sky_xyz = sky_nodes.new("ShaderNodeSeparateXYZ")
sky_links.new(sky_coords.outputs["Generated"], sky_xyz.inputs["Vector"])
sky_ramp = sky_nodes.new("ShaderNodeValToRGB")
sky_ramp.color_ramp.elements[0].color = (.018, .014, .018, 1)
sky_ramp.color_ramp.elements[1].color = (.030, .044, .070, 1)
sky_emission = sky_nodes.new("ShaderNodeEmission")
sky_links.new(sky_xyz.outputs["Y"], sky_ramp.inputs["Fac"])
sky_links.new(sky_ramp.outputs["Color"], sky_emission.inputs["Color"])
sky_output = sky_nodes.new("ShaderNodeOutputMaterial")
sky_links.new(sky_emission.outputs["Emission"], sky_output.inputs["Surface"])

bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 28, 15),
                                 rotation=(math.pi / 2, 0, 0))
sky = bpy.context.object
sky.name = "dark dusk sky backdrop"
sky.scale = (40, 25, 1)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
sky.data.materials.append(sky_material)

def cube(name, loc, size, material, front=False, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    if bevel:
        mod = o.modifiers.new("soft worn edges", "BEVEL")
        mod.width, mod.segments = bevel, 2
        o.modifiers.new("weighted corner normals", "WEIGHTED_NORMAL")
    if front:
        occluders.append(o)
    return o

def cylinder(name, loc, radius, depth, material, verts=32, front=False, axis="Z"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    o.name = name
    if axis == "Y":
        o.rotation_euler[0] = math.pi / 2
    o.data.materials.append(material)
    mod = o.modifiers.new("rounded edges", "BEVEL")
    mod.width, mod.segments = .035, 2
    o.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    if front:
        occluders.append(o)
    return o

def beam(name, a, b, width, material, front=False):
    mid = (Vector(a) + Vector(b)) / 2
    o = cube(name, mid, (width, width, (Vector(b) - Vector(a)).length), material, front)
    o.rotation_euler = (Vector(b) - Vector(a)).to_track_quat("Z", "Y").to_euler()
    return o

def curve_object(name, points, radius, material, front=False):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 16
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    if front:
        occluders.append(obj)
    return obj

def lathe(name, loc, profile, material, segments=48):
    verts, faces = [], []
    for radius, z in profile:
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            verts.append((radius * math.cos(angle), radius * math.sin(angle), z))
    for ring in range(len(profile) - 1):
        for i in range(segments):
            a = ring * segments + i
            b = ring * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.location = loc
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj

def barrel_roof_tiles():
    verts, faces, face_materials = [], [], []
    ridge_y = 5.4
    channel_count = 26
    cross_samples, slope_samples = 8, 5
    roof_width = 18.4
    for front in (True, False):
        eave_y = 3.45 if front else 8.15
        distance = abs(ridge_y - eave_y)
        slope = 1.33 if front else .98
        derivative = slope if front else -slope
        norm = math.sqrt(1 + slope * slope)
        normal_y, normal_z = -derivative / norm, 1 / norm
        courses = 6
        for course in range(courses):
            t0 = course / courses
            t1 = min(1, (course + 1) / courses + .055)
            for channel in range(channel_count):
                center_x = -roof_width / 2 + (channel + .5) * roof_width / channel_count
                channel_width = roof_width / channel_count
                convex = channel % 2 == 0
                amplitude = .21 if convex else -.075
                first = len(verts)
                for longitudinal in range(slope_samples + 1):
                    t = t0 + (t1 - t0) * longitudinal / slope_samples
                    y = eave_y + (ridge_y - eave_y) * t
                    for across in range(cross_samples + 1):
                        x_offset = (across / cross_samples - .5) * channel_width
                        arch = math.sqrt(max(0, 1 - (2 * x_offset / channel_width) ** 2))
                        ripple = amplitude * arch
                        x = center_x + x_offset
                        verts.append((x,
                                      y + (ripple + .055 + course * .012) * normal_y,
                                      roof_height(y) + roof_end_lift(x)
                                      + (ripple + .055 + course * .012) * normal_z))
                for longitudinal in range(slope_samples):
                    for across in range(cross_samples):
                        a = first + longitudinal * (cross_samples + 1) + across
                        faces.append((a, a + 1, a + cross_samples + 2, a + cross_samples + 1))
                        face_materials.append(0 if convex else 1)

    mesh = bpy.data.meshes.new("overlapping alternating barrel tile channels")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(tile)
    mesh.materials.append(tile_shadow)
    obj = bpy.data.objects.new("rows of glazed half-cylinder tiles", mesh)
    scene.collection.objects.link(obj)
    for poly, material_index in zip(mesh.polygons, face_materials):
        poly.use_smooth = True
        poly.material_index = material_index
    occluders.append(obj)
    return obj

def roof_height(y):
    slope = 1.33 if y < 5.4 else .98
    return 6.95 - abs(y - 5.4) * slope

def roof_end_lift(x):
    return max(0, (abs(x) - 6.5) / 2.7) ** 2 * .78

# Courtyard paving ends before the hall backdrop.
cube("arena backing", (0, -5.55, -.20), (27.2, 16.1, .18), stone, bevel=0)

# Irregular offset warm-grey slabs, with a worn approach path and dark joints.
random.seed(1307)
course_y = -13.4
for row in range(12):
    depth = random.uniform(1.02, 1.52)
    y = course_y + depth / 2
    x = -13.1 + (random.uniform(-.3, .3) if row % 2 else 0)
    while x < 13.1:
        width = random.uniform(1.25, 1.95)
        center_x = x + width / 2
        path_progress = max(0, min(1, (1.6 - y) / 3.7))
        path_x = -3.4 * path_progress + .16 * math.sin(y * .8)
        worn_path = abs(center_x - path_x) < 1.15
        material = path_stone if worn_path and random.random() < .62 else stone
        slab_height = random.uniform(.075, .115)
        cube("worn path granite slab" if worn_path else "irregular granite paving",
             (center_x, y + random.uniform(-.025, .025), -.12),
             (width, depth - .010, slab_height), material,
             bevel=random.uniform(.003, .007))
        if random.random() < .025:
            bpy.ops.mesh.primitive_uv_sphere_add(
                segments=16, ring_count=8,
                location=(center_x + random.uniform(-width * .32, width * .32),
                          y + random.uniform(-depth * .32, depth * .32),
                          -.12 + slab_height / 2 + .006))
            stain = bpy.context.object
            stain.name = "faint moss and grime stain"
            stain.scale = (random.uniform(.06, .12), random.uniform(.035, .08), .006)
            stain.data.materials.append(moss)
        x += width + random.uniform(.005, .012)
    course_y += depth + random.uniform(.005, .012)

# Raised hall foundation and broad approach steps.
hall_objects_before = set(scene.objects)
cube("raised hall plinth", (0, 4.7, .35), (17, 6.8, .7), limestone)
for i in range(6):
    cube("broad cut-stone stair tread", (0, .8 + i * .48, .08 + i * .12),
         (9.2, .52, .16), step_stone, bevel=.035)
for x in (-5.0, 5.0):
    for y in (1.05, 1.85, 2.65, 3.45):
        cube("stair balustrade post", (x, y, .55 + (y - 1.05) * .19), (.34, .34, .78), limestone)
    beam("low stair balustrade", (x, 1.05, .91), (x, 3.45, 1.37), .22, limestone)
for x in (-6.35, -5.45, 5.45, 6.35):
    cube("platform carved edge panel", (x, 1.12, .78), (.72, .13, .38), step_stone, bevel=.04)
    cube("platform border gold pin", (x, 1.025, .80), (.08, .05, .12), gold, bevel=.02)
cube("rear dark hall wall", (0, 7.7, 2.7), (16.5, .42, 5.0), darkwood)
cube("open central bay shadow", (0, 7.15, 2.0), (5.8, .06, 3.0), darkwood, bevel=0)
cube("warm open central altar bay", (0, 7.10, 2.35), (3.8, .025, 1.55), warm_bay_glow, bevel=0)

# Lattice wings and carved panels.
for side in (-1, 1):
    x0 = side * 5.35
    cube("red lacquer side-bay door", (x0, 7.37, 2.65), (4.2, .12, 4.1), red)
    cube("side-bay door lower inset", (x0, 7.285, 2.65), (3.92, .035, 3.86), darkwood)
    for x in [x0 - 1.82 + i * .36 for i in range(11)]:
        cube("red carved lattice stile", (x, 7.24, 2.65), (.11, .12, 3.9), red, bevel=.015)
    for z in [.78 + i * .38 for i in range(9)]:
        cube("gold carved lattice rail", (x0, 7.22, z), (3.95, .13, .075), gold, bevel=.015)
    for x in (x0 - 2.08, x0 + 2.08):
        cube("side-bay door stile trim", (x, 7.20, 2.65), (.12, .16, 4.2), gold, bevel=.02)

# Four lacquer columns, bases and gilded collars. Column bodies are the front occlusion plate.
for x in (-6.6, -2.2, 2.2, 6.6):
    cylinder("carved stone column base", (x, 5.15, .58), .58, .40, column_stone, front=True)
    cylinder("column base upper moulding", (x, 5.15, .83), .50, .12, gold, front=True)
    cylinder("column gold foot ring", (x, 5.15, .94), .56, .10, gold, front=True)
    cylinder("red lacquered round column", (x, 5.15, 2.55), .46, 3.0, red, front=True)
    cylinder("carved column capital", (x, 5.15, 4.08), .52, .20, red, front=True)
    cylinder("capital gold collar", (x, 5.15, 4.20), .54, .08, gold, front=True)

# Altar, offerings and abstract shrine silhouette.
cube("altar table apron", (0, 4.7, 1.25), (4.4, 1.05, .72), darkwood)
cube("altar top", (0, 4.7, 1.67), (4.8, 1.3, .18), gold)
for x in (-1.5, 0, 1.5):
    cylinder("brass candle stand", (x, 4.16, 2.04), .13, .54, gold)
    cylinder("candle", (x, 4.16, 2.43), .075, .34, limestone, 16)
    cylinder("candle flame", (x, 4.16, 2.66), .045, .12, candle_glow, 12)
for x in (-1.38, 1.38):
    cube("shrine niche gold side trim", (x, 4.2, 2.55), (.16, .22, 2.2), gold, bevel=.025)
for z in (1.45, 3.65):
    cube("shrine niche gold cross trim", (0, 4.2, z), (2.9, .22, .16), gold, bevel=.025)
cube("shrine inner shadow", (0, 4.35, 2.55), (2.62, .06, 2.02), darkwood, bevel=.015)
cylinder("abstract shrine silhouette", (0, 4.08, 2.37), .40, .20, darkwood, 20, axis="Y")
cylinder("abstract shrine silhouette crown", (0, 4.08, 2.89), .19, .20, darkwood, 20, axis="Y")
for x in (-.85, .85):
    cylinder("offerings", (x, 4.05, 1.95), .28, .28, bronze)
for x in (-.55, .55):
    cylinder("altar incense pot", (x, 4.02, 1.92), .21, .22, bronze)
    cylinder("incense stick", (x, 4.02, 2.35), .018, .66, wood, 12)

# Painted beam band, layered eaves and steep gabled barrel-tile field.
cube("front eave support beam", (0, 5.85, 4.45), (17.6, .72, .36), darkwood, front=True)
cube("red painted beam band", (0, 5.45, 4.29), (16.6, .12, .30), red, front=True)
cube("gold beam pinstripe", (0, 5.37, 4.42), (16.8, .06, .07), gold, front=True)
cube("deep projecting soffit", (0, 5.65, 4.48), (18.2, 1.10, .16), darkwood)
cube("front carved eave edge", (0, 3.82, 4.36), (18.2, .34, .22), ridge_tile, front=True)
cube("rear carved eave edge", (0, 7.83, 4.36), (18.2, .34, .22), ridge_tile)
for x in (-8.1, -5.4, -2.7, 0, 2.7, 5.4, 8.1):
    cube("dougong lower bracket", (x, 5.55, 4.02), (.68, .55, .20), red, front=True)
    cube("dougong stepped bracket", (x, 5.55, 4.18), (.48, .47, .15), gold, front=True)
    cube("dougong cap block", (x, 5.55, 4.30), (.72, .44, .10), darkwood, front=True)

roof_x = (-9.4, -7.0, 0, 7.0, 9.4)
roof_y = (3.45, 5.4, 8.15)
roof_vertices = [(x, y, roof_height(y) + roof_end_lift(x) - .24)
                 for y in roof_y for x in roof_x]
roof_faces = []
for column in range(len(roof_x) - 1):
    front_left = column
    ridge_left = len(roof_x) + column
    ridge_right = ridge_left + 1
    front_right = column + 1
    rear_left = 2 * len(roof_x) + column
    rear_right = rear_left + 1
    roof_faces.append((front_left, front_right, ridge_right, ridge_left))
    roof_faces.append((ridge_left, ridge_right, rear_right, rear_left))
roof_mesh = bpy.data.meshes.new("steep overhanging gable roof planes")
roof_mesh.from_pydata(roof_vertices, [], roof_faces)
roof_mesh.materials.append(tile)
roof_obj = bpy.data.objects.new("steep gable roof underlay", roof_mesh)
scene.collection.objects.link(roof_obj)
occluders.append(roof_obj)
barrel_roof_tiles()
curve_object("main swallowtail ridge", [
    (-11.2, 5.4, 7.42), (-10.4, 5.4, 7.44), (-9.7, 5.4, 7.16),
    (-9.15, 5.4, 6.98), (-8.2, 5.4, 6.90), (-5.0, 5.4, 7.02),
    (0, 5.4, 7.08), (5.0, 5.4, 7.02), (8.2, 5.4, 6.90),
    (9.15, 5.4, 6.98), (9.7, 5.4, 7.16), (10.4, 5.4, 7.44),
    (11.2, 5.4, 7.42)], .34, ridge_tile, True)
for side in (-1, 1):
    curve_object("swallowtail upper fork", [
        (side * 8.9, 5.38, 6.93), (side * 9.65, 5.33, 7.12),
        (side * 10.35, 5.28, 7.42), (side * 11.05, 5.23, 7.82),
        (side * 11.55, 5.18, 8.02), (side * 11.75, 5.14, 7.82)],
        .23, ridge_tile, True)
    curve_object("swallowtail lower fork", [
        (side * 9.0, 5.48, 6.96), (side * 9.8, 5.55, 7.12),
        (side * 10.45, 5.62, 7.40), (side * 11.15, 5.68, 7.48),
        (side * 11.60, 5.70, 7.32)], .15, gold, True)

for course in range(1, 6):
    t = course / 6
    for front, eave_y in ((True, 3.45), (False, 8.15)):
        y = eave_y + (5.4 - eave_y) * t
        z = roof_height(y) + .62 + course * .012
        curve_object("continuous red roof-course joint", [
            (-9.25, y, z + roof_end_lift(-9.25)), (-7.0, y, z),
            (0, y, z), (7.0, y, z), (9.25, y, z + roof_end_lift(9.25))],
            .065, tile_shadow, True)

for x in [(-9.15 + i * .70) for i in range(27)]:
    cylinder("round glazed eave tile-end disc",
             (x, 3.28, roof_height(3.45) + roof_end_lift(x)),
             .14, .20, ridge_tile, 20, front=True, axis="Y")
curve_object("front drip-tile eave edge", [
    (-9.3, 3.30, 4.30), (-7, 3.30, 4.32), (0, 3.30, 4.34),
    (7, 3.30, 4.32), (9.3, 3.30, 4.30)], .13, ridge_tile, True)
curve_object("front upturned eave corners", [
    (-9.7, 3.45, 5.55), (-9.2, 3.45, 5.20), (-8.55, 3.45, 4.62),
    (-7.8, 3.45, 4.42), (-4.0, 3.45, 4.36), (0, 3.45, 4.35),
    (4.0, 3.45, 4.36), (7.8, 3.45, 4.42), (8.55, 3.45, 4.62),
    (9.2, 3.45, 5.20), (9.7, 3.45, 5.55)], .26, ridge_tile, True)
curve_object("rear upturned eave corners", [
    (-9.7, 8.15, 5.40), (-9.2, 8.15, 5.12), (-8.55, 8.15, 4.45),
    (-7.8, 8.15, 4.20), (-4.0, 8.15, 4.12), (0, 8.15, 4.10),
    (4.0, 8.15, 4.12), (7.8, 8.15, 4.20), (8.55, 8.15, 4.45),
    (9.2, 8.15, 5.12), (9.7, 8.15, 5.40)], .26, ridge_tile)
for x in (-7.2, 0, 7.2):
    cylinder("abstract clay ridge ornament", (x, 5.4, 7.13), .20, .24, gold)
    cylinder("ridge ornament foot", (x, 5.4, 6.99), .29, .08, darkwood)

# Hanging red silk lanterns with warm, controlled emission.
for x in (-7.2, -4.3, 4.3, 7.2):
    beam("lantern hanging rod", (x, 3.25, 4.18), (x, 3.25, 3.86), .045, gold)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(x, 3.20, 3.48))
    lantern = bpy.context.object
    lantern.name = "rounded red lantern body"
    lantern.scale = (.34, .34, .56)
    lantern.data.materials.append(red)
    cylinder("lantern warm glass", (x, 2.84, 3.48), .20, .04, lantern_glow, axis="Y")
    cylinder("lantern upper cap", (x, 3.20, 4.06), .39, .12, gold)
    cylinder("lantern lower cap", (x, 3.20, 2.90), .30, .10, gold)
    cylinder("lantern tassel", (x, 3.20, 2.74), .035, .22, red, 12)

# Bring the hall forward while preserving the platform and open stair lane.
for obj in set(scene.objects) - hall_objects_before:
    obj.location.y -= 1.95
    if not obj.name.startswith(("raised hall plinth", "broad cut-stone stair tread",
                                "stair balustrade", "low stair balustrade",
                                "platform carved edge", "platform border")):
        obj.location.y -= .55

# Close the paved courtyard with a dark compound wall and planted side beds.
cube("rear compound wall", (0, 8.75, 1.45), (27.2, .62, 2.9), compound_stone, bevel=.06)
cube("rear compound tile coping", (0, 8.75, 2.98), (27.8, .94, .16), tile, bevel=.055)
for x in [i * 2.0 for i in range(-6, 7)]:
    cube("compound wall stone joint", (x, 8.42, 1.48), (.045, .035, 2.65), wall_sandstone, bevel=.005)
for z in (.52, 1.10, 1.68, 2.26):
    cube("compound wall horizontal mortar course", (0, 8.41, z), (27.0, .035, .035),
         kiln_mortar, bevel=.006)

for side, label in ((-1, "left"), (1, "right")):
    cube(f"{label} dark planting bed", (side * 10.35, 3.45, .10),
         (2.0, 7.2, .22), garden_soil, bevel=.035)
    cube(f"{label} low garden curb", (side * 9.28, 3.45, .34),
         (.30, 7.2, .56), compound_stone, bevel=.045)
    for y, scale in ((1.0, .45), (3.0, .62), (5.2, .52)):
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1, radius=1,
            location=(side * (10.25 + (y % 2) * .18), y, .42))
        shrub = bpy.context.object
        shrub.name = f"{label} low garden foliage silhouette"
        shrub.scale = (scale, scale * .75, scale * .52)
        shrub.data.materials.append(foliage)

for x in (-12.2, -10.0, 10.0, 12.2):
    for dx, z, scale in ((0, 3.25, 1.05), (-.52, 2.95, .82), (.48, 3.48, .92)):
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1, radius=1, location=(x + dx, 9.32, z))
        canopy = bpy.context.object
        canopy.name = "compound foliage silhouette"
        canopy.scale = (scale, scale * .60, scale * 1.15)
        canopy.data.materials.append(foliage)

# Tripod bronze ding censer on a carved stone plinth.
censer_x, censer_y = -3.4, -2.1
cube("censer carved stone plinth", (censer_x, censer_y, .18), (1.75, 1.45, .34), limestone)
cube("censer plinth dark inset", (censer_x, censer_y - .74, .20), (1.30, .04, .15), darkwood, bevel=.02)
for x in (-.48, 0, .48):
    cube("censer plinth carving", (censer_x + x, censer_y - .775, .20), (.11, .035, .11), gold, bevel=.02)
lathe("bronze ding censer body", (censer_x, censer_y, .30), [
    (.38, 0), (.49, .15), (.68, .38), (.82, .68), (.84, .92),
    (.74, 1.12), (.78, 1.20), (.68, 1.24)], bronze)
cylinder("censer open inner shadow", (censer_x, censer_y, 1.49), .65, .025, black, 48)
cylinder("censer cast lip", (censer_x, censer_y, 1.53), .82, .12, gold, 48)
lathe("censer domed bronze lid", (censer_x, censer_y, 1.59), [
    (0, 0), (.32, .03), (.58, .10), (.72, .20), (.64, .30), (.42, .42), (.20, .50), (.08, .55)], bronze)
cylinder("censer lid finial", (censer_x, censer_y, 2.20), .12, .20, gold)
for angle in (90, 210, 330):
    radians = math.radians(angle)
    foot_x, foot_y = censer_x + math.cos(radians) * .60, censer_y + math.sin(radians) * .60
    beam("tripod censer leg", (censer_x + math.cos(radians) * .43, censer_y + math.sin(radians) * .43, .78),
         (foot_x, foot_y, .32), .16, bronze)
    cylinder("censer tripod foot", (foot_x, foot_y, .28), .14, .12, bronze, 20)
for side in (-1, 1):
    x = censer_x + side * .82
    curve_object("ding censer ear handle", [
        (x, censer_y, 1.28), (x + side * .24, censer_y, 1.45),
        (x + side * .42, censer_y, 1.36), (x + side * .42, censer_y, 1.12),
        (x + side * .20, censer_y, 1.02)], .065, bronze)

# Brick paper furnace with a recessed arched mouth and two compact tiled tiers.
furnace_x, furnace_y = 9.1, -1.9
furnace_front = furnace_y - .90
cube("paper furnace brick tower", (furnace_x, furnace_y, 1.28), (2.05, 1.80, 2.56), brick)
for row, z in enumerate((.25, .57, .89, 1.21, 1.53, 1.85, 2.17, 2.49)):
    offset = .24 if row % 2 else 0
    for col in range(5):
        bx = furnace_x - .98 + col * .41 + offset
        if bx > furnace_x + .96:
            continue
        cube("furnace laid brick course", (bx, furnace_front - .075, z),
             (.38, .14, .27), brick, bevel=.018)
for z in (.40, .72, 1.04, 1.36, 1.68, 2.00, 2.32, 2.64):
    cube("furnace visible mortar bed joint", (furnace_x, furnace_front - .08, z),
         (2.0, .025, .035), kiln_mortar, bevel=.004)

arch_center_z, arch_radius = 1.18, .47
arch_profile = [(furnace_x - arch_radius, .48), (furnace_x - arch_radius, arch_center_z)]
for segment in range(13):
    angle = math.pi - math.pi * segment / 12
    arch_profile.append((furnace_x + arch_radius * math.cos(angle),
                         arch_center_z + arch_radius * math.sin(angle)))
arch_profile.append((furnace_x + arch_radius, .48))
arch_mesh = bpy.data.meshes.new("arched kiln opening")
arch_mesh.from_pydata([(x, furnace_front - .16, z) for x, z in arch_profile], [], [tuple(range(len(arch_profile)))])
arch_mesh.materials.append(black)
arch = bpy.data.objects.new("dark arched furnace mouth", arch_mesh)
scene.collection.objects.link(arch)

for side in (-1, 1):
    cube("furnace opening brick jamb", (furnace_x + side * .59, furnace_front - .17, .92),
         (.20, .20, .94), brick, bevel=.025)
for segment in range(7):
    angle = math.pi * segment / 6
    x = furnace_x + .58 * math.cos(angle)
    z = arch_center_z + .58 * math.sin(angle)
    voussoir = cube("furnace arched brick voussoir", (x, furnace_front - .17, z),
                    (.31, .20, .21), brick, bevel=.025)
    voussoir.rotation_euler[1] = -(angle + math.pi / 2)
cube("furnace warm opening glow", (furnace_x, furnace_front - .17, 1.13),
     (.68, .025, .55), ember, bevel=.16)
cube("furnace ember bed", (furnace_x, furnace_front - .20, .67), (.62, .025, .16), ember, bevel=.035)

cube("kiln lower roof tier", (furnace_x, furnace_y, 2.72), (2.40, 2.18, .16), tile_shadow, bevel=.08)
roof_y_rows = [-2.96 + row * .24 for row in range(10)]
roof_verts, roof_faces = [], []
for y in roof_y_rows:
    base_z = 2.90 - abs(y - furnace_y) * .34
    for col in range(8):
        x0 = furnace_x - 1.19 + col * .30
        x1 = x0 + .29
        center_x = (x0 + x1) / 2
        upturn = max(0, (abs(center_x - furnace_x) - .78) / .58) * .20
        first = len(roof_verts)
        for end_x in (x0, x1):
            for segment in range(9):
                angle = math.pi * segment / 8
                roof_verts.append((end_x, y + .15 * math.cos(angle),
                                   base_z + upturn + .15 * math.sin(angle)))
        for segment in range(8):
            a = first + segment
            roof_faces.append((a, a + 1, a + 10, a + 9))
roof_mesh = bpy.data.meshes.new("kiln barrel tile mesh")
roof_mesh.from_pydata(roof_verts, [], roof_faces)
roof_mesh.materials.append(tile)
kiln_tiles = bpy.data.objects.new("small glazed kiln barrel tiles", roof_mesh)
scene.collection.objects.link(kiln_tiles)
for poly in roof_mesh.polygons:
    poly.use_smooth = True

cube("kiln upper roof tier", (furnace_x, furnace_y, 3.13), (1.70, 1.30, .12), tile_shadow, bevel=.045)
upper_verts, upper_faces = [], []
for y in (furnace_y - .55, furnace_y - .18, furnace_y + .18, furnace_y + .55):
    base_z = 3.24 - abs(y - furnace_y) * .20
    for col in range(6):
        x0 = furnace_x - .83 + col * .28
        x1 = x0 + .27
        first = len(upper_verts)
        for end_x in (x0, x1):
            for segment in range(7):
                angle = math.pi * segment / 6
                upper_verts.append((end_x, y + .12 * math.cos(angle),
                                    base_z + .12 * math.sin(angle)))
        for segment in range(6):
            a = first + segment
            upper_faces.append((a, a + 1, a + 8, a + 7))
upper_mesh = bpy.data.meshes.new("kiln upper tier barrel tiles")
upper_mesh.from_pydata(upper_verts, [], upper_faces)
upper_mesh.materials.append(tile)
upper_tiles = bpy.data.objects.new("small upper glazed kiln tiles", upper_mesh)
scene.collection.objects.link(upper_tiles)
for poly in upper_mesh.polygons:
    poly.use_smooth = True

for x, side in ((furnace_x - 1.38, -1), (furnace_x + 1.38, 1)):
    curve_object("upturned kiln roof corner", [
        (x, -2.99, 2.82), (x + side * .12, -2.91, 2.95), (x + side * .22, -2.76, 3.16)],
        .12, ridge_tile)
    curve_object("rear upturned kiln roof corner", [
        (x, -.81, 2.82), (x + side * .12, -.89, 2.95), (x + side * .22, -1.04, 3.16)],
        .12, ridge_tile)

for x in [furnace_x - 1.15 + i * .29 for i in range(9)]:
    cylinder("kiln round eave tile end", (x, furnace_y - 1.10, 2.68), .09, .13,
             ridge_tile, 16, axis="Y")
curve_object("kiln roof ridge cap", [
    (furnace_x - .95, furnace_y, 3.17), (furnace_x, furnace_y, 3.22),
    (furnace_x + .95, furnace_y, 3.17)], .12, ridge_tile)

cube("short kiln chimney", (furnace_x + .58, furnace_y + .18, 3.48), (.32, .38, .50), brick, bevel=.035)
cube("kiln chimney cap", (furnace_x + .58, furnace_y + .18, 3.77), (.50, .56, .12), ridge_tile, bevel=.035)
cube("kiln chimney opening", (furnace_x + .58, furnace_y + .18, 3.836), (.24, .28, .015), black, bevel=.01)

# Camera spans the 1400x860 arena at character-matched framing (26.8 Blender units wide).
bpy.ops.object.camera_add(location=(0, -29.4, 25.1))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 26.8
camera.rotation_euler = (Vector((0, -1.4, 1.6)) - camera.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = camera

def area(name, loc, color, power, size, target):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size, data.color = power, "DISK", size, color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

area("low warm courtyard key", (-8, -8, 8), (1, .76, .53), 1500, 8, (0, 2, 0))
area("cool sky fill", (0, 1, 16), (.60, .70, .82), 520, 12, (0, 3, 0))
area("warm altar glow", (0, 3.4, 5.2), (1, .46, .19), 250, 3, (0, 4.9, 1.8))
area("warm lower compound wall wash", (0, 4.0, 5.5), (.82, .28, .15), 180, 5, (0, 8.4, .7))
area("soft roof rim", (7, 9, 11), (.72, .66, .56), 480, 9, (0, 4, 2))
for x in (-7.2, -4.3, 4.3, 7.2):
    area("small lantern spill", (x, 1.0, 3.5), (1, .34, .12), 22, .7, (x, 2.3, 1.3))
scene.render.filepath = str(OUT / "ground.png")
scene.render.film_transparent = False
if os.environ.get("SKIP_GROUND_RENDER") == "1":
    elapsed_ground = 0
else:
    bpy.ops.render.render(write_still=True)
    elapsed_ground = time.monotonic() - started
scene.render.film_transparent = True

# Render a white roof-only mask through the final camera to verify its pixel bounds.
view_layer = bpy.context.view_layer
old_engine = scene.render.engine
old_override = view_layer.material_override
old_hidden = {obj: obj.hide_render for obj in bpy.data.objects}
roof_prefixes = ("steep gable roof underlay", "rows of glazed half-cylinder tiles",
                 "front eave", "front carved eave edge", "rear carved eave",
                 "deep projecting soffit",
                 "red painted beam band", "gold beam pinstripe", "dougong",
                 "main swallowtail ridge", "swallowtail upper fork",
                 "swallowtail lower fork", "front drip-tile eave edge",
                 "round glazed eave tile-end disc", "continuous red roof-course joint",
                 "front upturned eave corners",
                 "rear upturned eave corners", "barrel tile course ridge",
                 "abstract clay ridge ornament", "ridge ornament foot",
                 "barrel-tile ridge cap")
for obj in bpy.data.objects:
    obj.hide_render = not obj.name.startswith(roof_prefixes)
view_layer.material_override = emission_material("roof pixel mask", (1, 1, 1), 1)
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.filepath = str(OUT / "roof-mask.png")
bpy.ops.render.render(write_still=True)
view_layer.material_override = old_override
for obj, hidden in old_hidden.items():
    obj.hide_render = hidden
scene.render.engine = old_engine
print(f"roof_mask={OUT / 'roof-mask.png'}")

# Export blocking footprints from evaluated scene object bounds, in arena pixels.
px_per_unit = 128 / 2.45
blocked = []
def world_xy(obj):
    return (700 + obj.location.x * px_per_unit, 430 + obj.location.y * px_per_unit)

def add_blocked_rect(source, x, y, w, h):
    blocked.append({"shape": "rect", "source": source,
                    "x": round(x, 2), "y": round(860 - y - h, 2),
                    "w": round(w, 2), "h": round(h, 2)})

def add_circle(obj):
    x, y = world_xy(obj)
    blocked.append({"shape": "circle", "source": obj.name, "x": round(x, 2), "y": round(860 - y, 2),
                    "r": round(max(obj.dimensions.x, obj.dimensions.y) * px_per_unit / 2, 2)})

def add_rect(obj):
    x, y = world_xy(obj)
    w, h = obj.dimensions.x * px_per_unit, obj.dimensions.y * px_per_unit
    add_blocked_rect(obj.name, x - w / 2, y - h / 2, w, h)

for obj in scene.objects:
    if obj.name.startswith("red lacquered round column"):
        add_circle(obj)
    elif obj.name == "censer carved stone plinth":
        add_circle(obj)
    elif obj.name in ("paper furnace brick tower", "altar table apron", "rear dark hall wall",
                      "rear compound wall", "left dark planting bed", "right dark planting bed",
                      "left low garden curb", "right low garden curb"):
        add_rect(obj)

platform = bpy.data.objects.get("raised hall plinth")
if platform:
    w, h = platform.dimensions.x, platform.dimensions.y
    edge = .36
    cx, cy = platform.location.x, platform.location.y
    for x in (cx - w / 2 + edge / 2, cx + w / 2 - edge / 2):
        add_blocked_rect("platform side edge", (x - edge / 2 + 13.4) * px_per_unit,
                         (cy - h / 2 + 8.23) * px_per_unit,
                         edge * px_per_unit, h * px_per_unit)
    add_blocked_rect("platform rear edge", (cx - w / 2 + 13.4) * px_per_unit,
                     (cy + h / 2 - edge / 2 + 8.23) * px_per_unit,
                     w * px_per_unit, edge * px_per_unit)
    stairs = [obj for obj in scene.objects if obj.name.startswith("broad cut-stone stair tread")]
    stair_half_width = max(obj.dimensions.x for obj in stairs) / 2 if stairs else 0
    segment_width = (w - stair_half_width * 2) / 2
    for x in (cx - w / 2 + segment_width / 2, cx + w / 2 - segment_width / 2):
        add_blocked_rect("platform front edge excluding stairs",
                         (x - segment_width / 2 + 13.4) * px_per_unit,
                         (cy - h / 2 + 8.23) * px_per_unit,
                         segment_width * px_per_unit, edge * px_per_unit)
(OUT / "walkable.json").write_text(__import__("json").dumps({
    "arena": {"width": 1400, "height": 860}, "pxPerBlenderUnit": px_per_unit,
    "blocked": blocked,
}, indent=2) + "\n")

for obj in bpy.data.objects:
    if obj not in occluders:
        obj.hide_render = True
scene.render.filepath = str(OUT / "occluder.png")
bpy.ops.render.render(write_still=True)
elapsed_total = time.monotonic() - started
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "temple.blend"))
print(f"ground_seconds={elapsed_ground:.2f} occluder_seconds={elapsed_total-elapsed_ground:.2f} px_per_unit={128/2.45:.6f}")
