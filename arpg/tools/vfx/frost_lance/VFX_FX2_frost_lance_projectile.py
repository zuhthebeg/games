from vfxkit.primitives import *

def recipe():
 C=(159, 216, 255, 255); A=(233, 250, 255, 255)
 return effect('FX2_frost_lance_projectile','frost_lance projectile','element','frost',0.6,[
  sprite('Ice spear','T_IceShard01',C,life=36,scale_start=[2.4,.5,1],fade_in=0,fade_out=4),
  slice_line('Ice glint',A,2.0,width=.04,life=36),
  motes('Ice dust',8,C,life=(20,36),distance=(.2,.8),size=(.03,.09),turbulence=0)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 frost_lance projectile: frost palette and circle gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
