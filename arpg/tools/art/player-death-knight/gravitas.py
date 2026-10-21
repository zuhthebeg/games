"""DK-only original proportion and action authoring; executed before armor fitting.
CC0 input actions are sampled into new keyed actions. No shared source mutation.
"""
from mathutils import Quaternion
# Preserve mesh bind data, change skeletal proportion via local pose scale carried
# in every DK action. Smaller skull + longer torso/legs, not whole-sprite scaling.
proportions={'head':(.72,.76,.74),'spine':(1.08,1.22,1.06),'chest':(1.12,1.08,1.08),
 'upperleg.l':(1,1.25,1),'upperleg.r':(1,1.25,1),
 'lowerleg.l':(1,1.25,1),'lowerleg.r':(1,1.25,1)}
original={n:a for n,a in actions.items()}
def read_pose(name,frame):
 action(name);scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
 return {b.name:(b.location.copy(),b.rotation_quaternion.copy(),b.scale.copy()) for b in rig.pose.bones}
idle=read_pose(job['animations']['idle'],0)
profiles={'idle':('Idle',25.6),'run':('Running_A',19.2),'attack':('1H_Melee_Attack_Slice_Horizontal',25.6),'magic':('Spellcast_Shoot',25.6),'hit':('Hit_A',16),'death':('Death_A',19.2),'dodge':('Dodge_Forward',9.6)}
authored=[]
for state,(source,end) in profiles.items():
 poses=[]
 for i in range(49):
  t=i/48
  # Anticipation holds, swift transfer through the existing middle contact,
  # and deliberate settle: endpoints and contact center remain unchanged.
  u=t
  if state=='attack':
   knots=[(0,0),(.25,.13),(.42,.32),(.5,.5),(.62,.76),(.82,.92),(1,1)]
   for (a,b),(c,d) in zip(knots,knots[1:]):
    if a<=t<=c:u=b+(d-b)*(t-a)/(c-a);break
  sf=u*float(original[source].frame_range[1])
  pose=read_pose(source,sf)
  for bn,(loc,q,scale) in pose.items():
   il,iq,isc=idle[bn]
   if state in ('idle','magic') and (bn in ['root','hips','spine','chest','head'] or any(k in bn for k in ['leg.','foot.','toes.','IK','roll.'])):
    # Cast legs remain planted; idle breathing remains barely perceptible.
    amount=.12 if state=='idle' else (.16 if bn in ('spine','chest') else 0)
    loc=il.lerp(loc,amount);q=iq.slerp(q,amount)
   if state in ('attack','run') and bn in ('head','chest'):
    q=iq.slerp(q,.45 if bn=='head' else .76)
   if state=='run' and bn=='hips':loc=il.lerp(loc,.42)
   if state=='magic' and bn.endswith('.r') and any(k in bn for k in ['arm','wrist','hand']):loc=il.copy();q=iq.copy()
   scale=Vector(tuple(scale[j]*proportions.get(bn,(1,1,1))[j] for j in range(3)))
   pose[bn]=(loc,q,scale)
  poses.append((t*end,pose))
 clip=bpy.data.actions.new('DK_Gravitas_'+state);clip.use_fake_user=True
 rig.animation_data.action=clip
 for f,pose in poses:
  for bn,(loc,q,scale) in pose.items():
   b=rig.pose.bones[bn];b.rotation_mode='QUATERNION';b.location=loc;b.rotation_quaternion=q;b.scale=scale
   for prop in ('location','rotation_quaternion','scale'):b.keyframe_insert(prop,frame=f,group=bn)
 actions[clip.name]=clip;job['animations'][state]=clip.name;authored.append({'state':state,'action':clip.name,'source':source,'duration_frames':end})
# Set proportions in reset basis too so fitting sees identical body transforms.
for bn,s in proportions.items():
 b=rig.pose.bones[bn];b.matrix_basis=default_basis[bn].copy();b.scale=Vector(s);default_basis[bn]=b.matrix_basis.copy()
(source_dir/'gravitas-actions.json').write_text(json.dumps({'actions':authored,'proportions':proportions,'shared_sources_untouched':True},indent=2))
