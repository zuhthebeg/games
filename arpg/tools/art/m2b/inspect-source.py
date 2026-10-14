"""Read-only inventory of the original downloaded rigs in Windows Blender."""
import bpy, sys, json
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]); reports=[]
for name in ['demon','goleling','slime']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root/(name+'.glb')))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    report={'id':name,'rig':rig.name,'bones':[{ 'name':b.name,'head':list(rig.matrix_world@b.head_local),'tail':list(rig.matrix_world@b.tail_local)} for b in rig.data.bones], 'meshes':[{'name':o.name,'materials':[m.name for m in o.data.materials],'skin':any(m.type=='ARMATURE' for m in o.modifiers)} for o in bpy.context.scene.objects if o.type=='MESH'],'actions':[{ 'name':a.name,'range':list(a.frame_range)} for a in bpy.data.actions]}
    reports.append(report);print('INVENTORY',json.dumps(report),flush=True)
(root.parent/'inventory.json').write_text(json.dumps(reports,indent=2))
