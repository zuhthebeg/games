from vfxkit.primitives import *

def recipe():
 C=(145, 216, 238, 255); A=(240, 252, 255, 255)
 return effect('FX2_pierce_shot_windup','pierce_shot windup','element','none',0.3,[
  shock_ring('Gather ring',C,1.0,life=18,thickness=.14),
  motes('Gather motes',6,A,life=(12,18),distance=(.2,.7),radius=(.2,.6),turbulence=0)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 pierce_shot windup: pierce palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
