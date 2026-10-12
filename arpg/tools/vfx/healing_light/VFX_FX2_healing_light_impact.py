from vfxkit.primitives import *

def recipe():
 C=(121, 220, 160, 255); A=(197, 215, 153, 255)
 return effect('FX2_healing_light_impact','healing_light impact','element','none',0.6,[
  shock_ring('Healing halo',C,3.2,life=32,thickness=.12),
  sprite('Healing cross','T_Cross01',A,size=1.4,life=30,fade_in=0,fade_out=20),
  motes('Restoration glints',16,C,life=(20,34),radius=(.6,2.6),distance=(.1,.6),size=(.05,.12),turbulence=0)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 healing_light impact: heal palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
