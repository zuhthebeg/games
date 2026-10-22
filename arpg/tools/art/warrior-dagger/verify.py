import bpy,json,hashlib,numpy as np
from mathutils import Vector
p='C:/Users/user/AppData/Local/Temp/openclaw/warrior-dagger-monster'
source='C:/Users/user/AppData/Local/Temp/openclaw/accurig-warrior-game-kit/skin-repair/review-best-v4/warrior-partial-weight-repair.blend'
def sha(x):return hashlib.sha256(json.dumps(x,separators=(',',':')).encode()).hexdigest()
def signature():
 meshes={o.name:sha({'v':[list(v.co) for v in o.data.vertices],'f':[list(f.vertices) for f in o.data.polygons],'uv':[[list(v.uv) for v in l.data] for l in o.data.uv_layers],'mat':[m.name for m in o.data.materials],'weights':[[(g.group,g.weight) for g in v.groups] for v in o.data.vertices],'groups':[g.name for g in o.vertex_groups],'matrix':[list(x) for x in o.matrix_world]}) for o in bpy.data.objects if o.type=='MESH' and not o.name.startswith('Dagger_')}
 r=next(o for o in bpy.data.objects if o.type=='ARMATURE');bones=sha([(b.name,b.parent.name if b.parent else None,[list(x) for x in b.matrix_local]) for b in r.data.bones]);poses={}
 for clip,n in [('idle',13),('run',10),('attack',13),('death',10)]:
  r.animation_data.action=bpy.data.actions['Warrior_'+clip]
  for f in range(n):
   bpy.context.scene.frame_set(f+1);bpy.context.view_layer.update();poses[clip+str(f)]=sha([[list(x) for x in b.matrix] for b in r.pose.bones])
 return {'meshes':meshes,'bones':bones,'poses':poses,'boneCount':len(r.data.bones)}
bpy.ops.wm.open_mainfile(filepath=source);a=signature();bpy.ops.wm.open_mainfile(filepath=p+'/warrior-v4-dagger.blend');b=signature();assert a==b,'baseline original geometry, all weights, UV, materials, bones and 46 poses preserved'
r=next(o for o in bpy.data.objects if o.type=='ARMATURE');ob=bpy.data.objects['Dagger_hilt'];rest=r.data.bones['hand_r'].matrix_local.copy();c=Vector(json.load(open(p+'/provenance.json'))['gripRest']);errs=[]
for clip,n in [('idle',13),('run',10),('attack',13),('death',10)]:
 r.animation_data.action=bpy.data.actions['Warrior_'+clip]
 for f in range(n):
  bpy.context.scene.frame_set(f+1);bpy.context.view_layer.update();m=r.matrix_world@r.pose.bones['hand_r'].matrix@rest.inverted()@r.matrix_world.inverted();q=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=q.to_mesh();center=sum((q.matrix_world@v.co for v in me.vertices),Vector())/len(me.vertices);q.to_mesh_clear();errs.append((center-m@c).length)
assert max(errs)<1e-6
json.dump({'pass':True,'immutableBaseline':a,'immutableCandidate':b,'gripMaxError':max(errs),'poses':len(errs),'meshWeightsBodyUVBonesActionsUnchanged':True},open(p+'/independent-verification.json','w'),indent=2)
