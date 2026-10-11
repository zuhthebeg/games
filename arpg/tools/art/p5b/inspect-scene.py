import bpy,json
from pathlib import Path
bpy.ops.wm.open_mainfile(filepath='C:/Users/user/ai-tools/arpg-art/source/hero-sword-baked.blend')
Path('C:/Users/user/ai-tools/arpg-art/p5b/scene.json').write_text(json.dumps([{'name':o.name,'hide':o.hide_render,'parent':o.parent.name if o.parent else None,'bone':o.parent_bone,'bounds':[list(v) for v in o.bound_box] if o.type=='MESH' else None} for o in bpy.context.scene.objects],indent=2))
