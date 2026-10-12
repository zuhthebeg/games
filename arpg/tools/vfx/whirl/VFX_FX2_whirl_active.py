from vfxkit.primitives import *

def recipe():
 C=(168, 220, 228, 255); A=(227, 245, 239, 255)
 return effect('FX2_whirl_active','whirl active','element','none',0.6,[
  slash_arc('Spin blade A',A,radius=3.3,width=.45,sweep=(-20,200),life=24),
  slash_arc('Spin blade B',C,radius=2.5,width=.3,sweep=(160,380),life=28,delay=3),
  shock_ring('Spin boundary',C,3.3,life=30,thickness=.08)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 whirl active: whirl palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
