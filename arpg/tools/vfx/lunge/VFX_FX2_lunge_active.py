from vfxkit.primitives import *

def recipe():
 C=(168, 220, 228, 255); A=(227, 245, 239, 255)
 return effect('FX2_lunge_active','lunge active','element','none',0.6,[
  sprite('Dash cut','T_Streak01',A,life=24,scale_start=[3.0,1.4,1],position=[-1.2,0,0],fade_in=0,fade_out=18),
  slice_line('Blade trail',C,2.6,width=.08,position=[-1.2,0,0],life=30)
 ],peak=.05,delivery=dict(kind='self'),design='FX2 lunge active: blade palette and dash gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')
