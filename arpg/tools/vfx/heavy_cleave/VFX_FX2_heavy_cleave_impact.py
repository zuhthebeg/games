from vfxkit.primitives import *

def recipe():
 C=(168, 220, 228, 255); A=(227, 245, 239, 255)
 return effect('FX2_heavy_cleave_impact','heavy_cleave impact','element','none',0.4,[
  flash('Contact star',A,1.4,life=5),
  radial_sparks('Hit shards',10,A,color_end=C,life=(10,22),distance=(.3,2.0),width=.05)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 heavy_cleave impact: cleave palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
