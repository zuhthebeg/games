from vfxkit.primitives import *

def recipe():
 C=(240, 140, 70, 255); A=(255, 230, 173, 255)
 return effect('FX2_blast_arrow_impact','blast_arrow impact','element','fire',0.4,[
  flash('Contact flash',(255,250,225,255),2.8,life=5),
  glow('Hot core',A,1.0,life=12,fade_in=0),
  shock_ring('Blast wave',C,3.2,life=24,thickness=.2),
  billow('Fire bloom',[(0,A),(35,C),(100,(120,40,10,0))],size=[1.0,2.2],life=[18,24],count=3),
  radial_sparks('Blast embers',12,A,color_end=C,life=(12,24),distance=(.4,2.4),width=.05)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 blast_arrow impact: blast palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
