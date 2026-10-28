"""Original copper derivative. Reuses immutable original source in memory only."""
from pathlib import Path
here=Path(__file__).resolve().parent
original=here.parents[1]/'original-dragon'/'generate.py'
code=original.read_text()
code=code.replace("out=Path(cfg['output'])/'dragon'","out=Path(cfg['output'])/'venom-dragon'")
code=code.replace('m=bpy.data.materials.new(name);',"c=cfg['variant']['palette'].get(name,c); m=bpy.data.materials.new(name);")
code=code.replace('scene=bpy.context.scene;',"v=cfg['variant']\nfrill=mat('Pale green frill',(.43,.78,.22)); accent=mat('Purple frill tips',(.30,.045,.40))\ndef fan(name,verts,faces,parent):\n me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update(); o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); o.parent=parent; o.data.materials.append(frill); meshes.append(o)\nfor s in [-1,1]:\n hub=(s*.18,-1.15,1.95)\n rim=[(s*.38,-1.12,2.54),(s*.70,-.94,2.40),(s*.81,-.76,2.13),(s*.70,-.66,1.86),(s*.40,-.66,1.64)]\n fan('Venom broad neck frill',[hub]+rim,[(0,j,j+1) for j in range(1,5)],neck)\n for tip in rim: cone('Venom purple neck frill rib',hub,tip,.034,.012,accent,neck)\nfor s in [-1,1]:\n hub=(1.06,3.08,.43); rim=[(1.06+s*.49,2.92,.49),(1.06+s*.57,3.29,.57),(1.06+s*.35,3.64,.64),(1.04,3.73,.61)]\n fan('Venom fan tail membrane',[hub]+rim,[(0,j,j+1) for j in range(1,4)],tail)\n for tip in rim: cone('Venom purple fan tail rib',hub,tip,.028,.008,accent,tail)\n\nfor ornament in [o for o in meshes if o.name.startswith('Venom ')]:\n ornament.scale *= cfg['variant']['ornament_scale']\nscene=bpy.context.scene;")
code=code.replace('original-copper-dragon.blend','venom-dragon.blend')
code=code.replace("'name':'dragon'","'name':'venom-dragon'")
code=code.replace("'mesh_objects':len(meshes)","'mesh_objects':len(meshes),'venom_ornaments':22")
exec(compile(code,str(original),'exec'))
