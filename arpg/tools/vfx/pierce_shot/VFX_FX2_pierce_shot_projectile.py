from vfxkit.primitives import *

def recipe():
 C=(145, 216, 238, 255); A=(240, 252, 255, 255)
 return effect('FX2_pierce_shot_projectile','pierce_shot projectile','element','none',0.6,[
  sprite('Arrow shaft','T_Streak01',A,life=36,scale_start=[3.0,6.0,1],fade_in=0,fade_out=4),
  sprite('Arrow head','T_Shard01',C,life=36,scale_start=[.5,.3,1],position=[1.0,0,0],fade_in=0,fade_out=4),
  slice_line('Piercing glint',A,3.0,width=.05,life=36)
  ,sprite('Projectile core','T_Glow01',A,life=36,scale_start=[2.5,.7,1],fade_in=0,fade_out=4,emissive=2.0)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 pierce_shot projectile: pierce palette and arrow gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
