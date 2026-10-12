from vfxkit.primitives import *

def recipe():
 C=(240, 140, 70, 255); A=(255, 230, 173, 255)
 return effect('FX2_blast_arrow_projectile','blast_arrow projectile','element','fire',0.6,[
  sprite('Arrow shaft','T_Streak01',A,life=36,scale_start=[3.0,6.0,1],fade_in=0,fade_out=4),
  sprite('Arrow head','T_Shard01',C,life=36,scale_start=[.5,.3,1],position=[1.0,0,0],fade_in=0,fade_out=4),
  slice_line('Piercing glint',A,1.9,width=.05,life=36),
  motes('Fuse embers',6,C,life=(18,36),distance=(.1,.7),size=(.04,.1),turbulence=0)
  ,sprite('Projectile core','T_Glow01',A,life=36,scale_start=[2.5,.7,1],fade_in=0,fade_out=4,emissive=2.0)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 blast_arrow projectile: blast palette and arrow gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
