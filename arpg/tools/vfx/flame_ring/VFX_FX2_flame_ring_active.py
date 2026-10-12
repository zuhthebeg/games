from vfxkit.primitives import *

def recipe():
 C=(240, 140, 70, 255); A=(255, 230, 173, 255)
 return effect('FX2_flame_ring_active','flame_ring active','element','fire',0.6,[
  shock_ring('Fire ring',C,3.2,life=30,thickness=.22),
  wisps('Flame arcs',A,2.6,count=4,width=.25,sweep=(0,120),life=(18,30),tilt=(0,0,(0,360)),size=1,emissive=1.3),
  motes('Ember rim',16,C,life=(18,34),radius=(1.8,2.7),distance=(.1,.4),turbulence=0)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 flame_ring active: fire palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
