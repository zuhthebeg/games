from vfxkit.primitives import *

def recipe():
 C=(121, 220, 160, 255); A=(197, 215, 153, 255)
 return effect('FX2_healing_light_windup','healing_light windup','element','none',0.3,[
  shock_ring('Gather ring',C,1.0,life=18,thickness=.14),
  motes('Gather motes',6,A,life=(12,18),distance=(.2,.7),radius=(.2,.6),turbulence=0)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 healing_light windup: heal palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
