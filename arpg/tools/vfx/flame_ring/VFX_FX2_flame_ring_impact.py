from vfxkit.primitives import *

def recipe():
 C=(240, 140, 70, 255); A=(255, 230, 173, 255)
 return effect('FX2_flame_ring_impact','flame_ring impact','element','fire',0.4,[
  flash('Contact star',A,1.4,life=5),
  radial_sparks('Hit shards',10,A,color_end=C,life=(10,22),distance=(.3,2.0),width=.05)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 flame_ring impact: fire palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
