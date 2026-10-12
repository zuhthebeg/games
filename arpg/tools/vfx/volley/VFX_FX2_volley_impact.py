from vfxkit.primitives import *

def recipe():
 C=(210, 196, 151, 255); A=(241, 235, 210, 255)
 return effect('FX2_volley_impact','volley impact','element','none',0.4,[
  flash('Contact star',A,1.4,life=5),
  radial_sparks('Hit shards',10,A,color_end=C,life=(10,22),distance=(.3,2.0),width=.05)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 volley impact: arrow palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
