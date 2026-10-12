from vfxkit.primitives import *

def recipe():
 C=(159, 216, 255, 255); A=(233, 250, 255, 255)
 return effect('FX2_frost_lance_windup','frost_lance windup','element','frost',0.3,[
  shock_ring('Gather ring',C,1.0,life=18,thickness=.14),
  motes('Gather motes',6,A,life=(12,18),distance=(.2,.7),radius=(.2,.6),turbulence=0)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 frost_lance windup: frost palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
