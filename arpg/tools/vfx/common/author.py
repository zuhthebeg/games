#!/usr/bin/env python3
"""Generate FX2 local recipe sources from the existing skill identities (no install)."""
import json, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
TEMP=Path('/mnt/c/Users/user/AppData/Local/Temp/arpg-fx2/bake')
PALETTES={'lunge':('blade',(168,220,228,255),(227,245,239,255)), 'volley':('arrow',(210,196,151,255),(241,235,210,255)), 'pierce_shot':('pierce',(145,216,238,255),(240,252,255,255)), 'frost_lance':('frost',(159,216,255,255),(233,250,255,255)), 'whirl':('whirl',(168,220,228,255),(227,245,239,255)), 'flame_ring':('fire',(240,140,70,255),(255,230,173,255)), 'blast_arrow':('blast',(240,140,70,255),(255,230,173,255)), 'heavy_cleave':('cleave',(168,220,228,255),(227,245,239,255)), 'healing_light':('heal',(121,220,160,255),(197,215,153,255))}
for skill,(style,c,a) in PALETTES.items():
 folder=ROOT/'tools/vfx'/skill;folder.mkdir(exist_ok=True)
 clips=[]
 projectile=style in ('arrow','pierce','frost','blast')
 for label in ['windup', 'projectile' if projectile else 'active', 'impact']:
  id=f'VFX_FX2_{skill}_{label}'
  ticks=18 if label=='windup' else 36 if label in ('active','projectile') or style=='heal' else 24
  shape='circle'
  if label=='active' and style=='cleave':shape='cone'
  if label=='active' and style=='blade':shape='dash'
  if label=='projectile' and style in ('arrow','pierce','blast'):shape='arrow'
  if label=='windup':
   layers=[f"shock_ring('Gather ring',C,1.0,life=18,thickness=.14)",f"motes('Gather motes',6,A,life=(12,18),distance=(.2,.7),radius=(.2,.6),turbulence=0)"]
  elif label=='projectile':
   if style=='frost':
    layers=["sprite('Ice spear','T_IceShard01',C,life=36,scale_start=[2.4,.5,1],fade_in=0,fade_out=4)","slice_line('Ice glint',A,2.0,width=.04,life=36)","motes('Ice dust',8,C,life=(20,36),distance=(.2,.8),size=(.03,.09),turbulence=0)"]
   else:
    layers=[f"sprite('Arrow shaft','T_Streak01',A,life=36,scale_start=[3.0,.6,1],fade_in=0,fade_out=4)",f"sprite('Arrow head','T_Shard01',C,life=36,scale_start=[.5,.3,1],position=[1.0,0,0],fade_in=0,fade_out=4)",f"slice_line('Piercing glint',A,{3.0 if style=='pierce' else 1.9},width=.05,life=36)"]
    if style=='blast':layers += ["motes('Fuse embers',6,C,life=(18,36),distance=(.1,.7),size=(.04,.1),turbulence=0)"]
  elif label=='active' and style in ('blade','cleave','whirl'):
   if style=='whirl':layers=["slash_arc('Spin blade A',A,radius=3.3,width=.45,sweep=(-20,200),life=24)","slash_arc('Spin blade B',C,radius=2.5,width=.3,sweep=(160,380),life=28,delay=3)","shock_ring('Spin boundary',C,3.3,life=30,thickness=.08)"]
   elif style=='cleave':layers=["slash_arc('Cleave blade',A,radius=3.3,width=.65,sweep=(55,125),life=20)","slice_line('Cleave fissure',C,3.0,width=.12,position=[1.4,0,0],life=30)","radial_sparks('Cleave sparks',12,A,color_end=C,life=(12,26),distance=(.4,1.8),width=.04,position=[1.4,0,0])"]
   else:layers=["sprite('Dash cut','T_Streak01',A,life=24,scale_start=[3.0,1.4,1],position=[-1.2,0,0],fade_in=0,fade_out=18)","slice_line('Blade trail',C,2.6,width=.08,position=[-1.2,0,0],life=30)"]
  elif label=='active' and style=='fire':layers=["shock_ring('Fire ring',C,3.2,life=30,thickness=.22)","wisps('Flame arcs',A,2.6,count=4,width=.25,sweep=(0,120),life=(18,30),tilt=(0,0,(0,360)),size=1,emissive=1.3)","motes('Ember rim',16,C,life=(18,34),radius=(1.8,2.7),distance=(.1,.4),turbulence=0)"]
  elif style=='heal':layers=["shock_ring('Healing halo',C,3.2,life=32,thickness=.12)","sprite('Healing cross','T_Cross01',A,size=1.4,life=30,fade_in=0,fade_out=20)","motes('Restoration glints',16,C,life=(20,34),radius=(.6,2.6),distance=(.1,.6),size=(.05,.12),turbulence=0)"]
  elif style=='blast' and label=='impact':layers=["flash('Contact flash',(255,250,225,255),2.8,life=5)","glow('Hot core',A,1.0,life=12,fade_in=0)","shock_ring('Blast wave',C,3.2,life=24,thickness=.2)","billow('Fire bloom',[(0,A),(35,C),(100,(120,40,10,0))],size=[1.0,2.2],life=[18,24],count=3)","radial_sparks('Blast embers',12,A,color_end=C,life=(12,24),distance=(.4,2.4),width=.05)"]
  else:
   layers=["flash('Contact star',A,1.4,life=5)","radial_sparks('Hit shards',10,A,color_end=C,life=(10,22),distance=(.3,2.0),width=.05)"]
   if style=='frost':layers += ["sprite('Frost shard','T_IceShard01',C,size=[.2,.5],count=6,life=[12,22],rotation=[0,0,[-180,180]],spawn=dict(shape='Sphere',radius=[.1,.5]),fade_in=0,fade_out=8)"]
  text='from vfxkit.primitives import *\n\ndef recipe():\n C='+repr(c)+'; A='+repr(a)+'\n return effect('+repr(id[4:])+','+repr(skill+' '+label)+",'element',"+repr('fire' if style in ('fire','blast') else 'frost' if style=='frost' else 'none')+','+str(ticks/60)+',[\n  '+',\n  '.join(layers)+"\n ],peak=.05,delivery=dict(kind='self'),design="+repr(f'FX2 {skill} {label}: {style} palette and {shape} gameplay-support. Native transparent bake; gameplay boundary remains authoritative.')+')\n'
  (folder/(id+'.py')).write_text(text)
  shutil.copyfile(folder/(id+'.py'),TEMP/'vfx/src'/(id+'.py'))
  clips.append({'id':id,'label':label,'ticks':ticks,'shape':shape})
 config={'skill':skill,'output':f'C:\\Users\\user\\AppData\\Local\\Temp\\arpg-fx2\\{skill}-frames','clips':clips}
 (folder/'bake.json').write_text(json.dumps(config,indent=2)+'\n')
 shutil.copyfile(folder/'bake.json',TEMP.parent/(skill+'.json'))
