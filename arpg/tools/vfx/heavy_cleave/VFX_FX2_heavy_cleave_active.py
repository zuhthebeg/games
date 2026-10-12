from vfxkit.primitives import *

def recipe():
 C=(168, 220, 228, 255); A=(227, 245, 239, 255)
 return effect('FX2_heavy_cleave_active','heavy_cleave active','element','none',0.6,[
  slash_arc('Cleave blade',A,radius=3.3,width=.65,sweep=(235,305),life=20),
  slice_line('Cleave fissure',C,3.0,width=.12,position=[1.4,0,0],life=30),
  radial_sparks('Cleave sparks',12,A,color_end=C,life=(12,26),distance=(.4,1.8),width=.04,position=[1.4,0,0])
 ],peak=.05,delivery=dict(kind='self'),design='FX2 heavy_cleave active: cleave palette and cone gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
