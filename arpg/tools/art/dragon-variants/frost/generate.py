"""Editable original derivative; modifies original authoring program only in memory.
Blender --python generate.py -- config.json [--preview]. Preserve directory layout.
"""
from pathlib import Path
import json, sys
here=Path(__file__).resolve().parent
original=here.parents[1]/'original-dragon'/'generate.py'
code=original.read_text()
code=code.replace("out=Path(cfg['output'])/'dragon'", "out=Path(cfg['output'])/'frost-dragon'")
code=code.replace("m=bpy.data.materials.new(name);", "c=cfg['variant']['palette'].get(name,c); m=bpy.data.materials.new(name);")
code=code.replace("scene=bpy.context.scene;", """
# Actual faceted ice geometry follows each inherited animated support.
v=cfg['variant']
def crystal(name,a,b,r,parent):
 return cone(name,a,b,r,0,ivory,parent)
for s in [-1,1]:
 for j in range(3):
  x=s*(.10+j*.09); y=-1.62+j*.16
  crystal('Frost crown crystal',(x,y,2.48),(x*1.5,y+.07,2.48+v['crystal_crown_height']*(1-j*.15)),.085,neck)
for j in range(6):
 y=-.40+j*.26
 crystal('Frost glacier dorsal blade',(0,y,1.55),(0,y+.16,1.55+v['crystal_spine_height']*(1-j*.06)),.13,body)
for g,s in zip(wings,[-1,1]):
 for t in [(s*2.66,-.62,2.32),(s*2.70,.30,1.95),(s*2.28,1.18,1.59)]:
  crystal('Frost wing-edge ice',t,(t[0]+s*v['wing_edge_crystal_length'],t[1]+.08,t[2]+.18),.11,g)
scene=bpy.context.scene;""")
code=code.replace("original-copper-dragon.blend", "frost-dragon.blend")
code=code.replace("'name':'dragon'", "'name':'frost-dragon'")
code=code.replace("'mesh_objects':len(meshes)", "'mesh_objects':len(meshes),'frost_crystals':18")
exec(compile(code,str(original),'exec'))
