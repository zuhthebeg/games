from vfxkit.primitives import *

def recipe():
 C=(240, 140, 70, 255); A=(255, 230, 173, 255)
 return effect('FX2_blast_arrow_windup','blast_arrow windup','element','fire',0.3,[
  shock_ring('Gather ring',C,1.0,life=18,thickness=.14),
  motes('Gather motes',6,A,life=(12,18),distance=(.2,.7),radius=(.2,.6),turbulence=0)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 blast_arrow windup: blast palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
