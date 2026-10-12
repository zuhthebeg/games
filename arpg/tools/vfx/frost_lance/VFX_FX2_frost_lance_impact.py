from vfxkit.primitives import *

def recipe():
 C=(159, 216, 255, 255); A=(233, 250, 255, 255)
 return effect('FX2_frost_lance_impact','frost_lance impact','element','frost',0.4,[
  flash('Contact star',A,1.4,life=5),
  radial_sparks('Hit shards',10,A,color_end=C,life=(10,22),distance=(.3,2.0),width=.05),
  sprite('Frost shard','T_IceShard01',C,size=[.2,.5],count=6,life=[12,22],rotation=[0,0,[-180,180]],spawn=dict(shape='Sphere',radius=[.1,.5]),fade_in=0,fade_out=8)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 frost_lance impact: frost palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
