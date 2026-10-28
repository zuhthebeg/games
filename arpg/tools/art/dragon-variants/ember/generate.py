"""Original copper derivative. Reuses immutable original source in memory only."""
from pathlib import Path
here=Path(__file__).resolve().parent
original=here.parents[1]/'original-dragon'/'generate.py'
code=original.read_text()
code=code.replace("out=Path(cfg['output'])/'dragon'","out=Path(cfg['output'])/'ember-dragon'")
code=code.replace('m=bpy.data.materials.new(name);',"c=cfg['variant']['palette'].get(name,c); m=bpy.data.materials.new(name);")
code=code.replace('scene=bpy.context.scene;',"v=cfg['variant']\nobsidian=mat('Obsidian crest',(.026,.022,.030))\nfor j in range(5):\n o=ell('Ember obsidian crest plate',(0,-1.68+j*.14,2.56),(.16,.16,.11+j*.014),obsidian,neck); o.rotation_euler.x=-.28\nfor j in range(5):\n o=ell('Ember dorsal obsidian plate',(0,-.35+j*.28,1.66),(.19,.23,.13),obsidian,body); o.rotation_euler.x=.2\nfor s in [-1,1]:\n pts=[(s*.23,-1.57,2.49),(s*.44,-1.39,2.62),(s*.52,-1.12,2.66),(s*.44,-.92,2.60)]\n for j in range(3): cone('Ember curved crown horn',pts[j],pts[j+1],.09*(1-j/3),.09*(1-(j+1)/3),obsidian,neck)\n\nfor ornament in [o for o in meshes if o.name.startswith('Ember ')]:\n ornament.scale *= cfg['variant']['ornament_scale']\nscene=bpy.context.scene;")
code=code.replace('original-copper-dragon.blend','ember-dragon.blend')
code=code.replace("'name':'dragon'","'name':'ember-dragon'")
code=code.replace("'mesh_objects':len(meshes)","'mesh_objects':len(meshes),'ember_ornaments':16")
exec(compile(code,str(original),'exec'))
