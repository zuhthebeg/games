"""Decoded delivered-pixel 1:1, phase and bat-comparison previews; no screenshots."""
import json,sys
from pathlib import Path
from PIL import Image,ImageDraw
repo=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
base=repo/'arpg/assets/sprites';manifest=json.loads((base/'manifest.json').read_text());dirs=['E','SE','S','SW','W','NW','N','NE'];states=['idle','run','attack','hit','death']
cache={}
def load(id):
 e=next(v for v in manifest if v['id']==id);frames={};groups={}
 for file in e['sheets']:
  data=json.loads((base/id/file).read_text());sheet=Image.open(base/id/data['meta']['image']).convert('RGBA');groups.update(data['animations'])
  for n,r in data['frames'].items():
   q=r['frame'];frames[n]=sheet.crop((q['x'],q['y'],q['x']+q['w'],q['y']+q['h']))
 cache[id]=(e,frames,groups);return cache[id]
for id in ['demon','goleling','slime']:
 e,f,g=load(id);canvas=Image.new('RGB',(1024,5*3*152),(20,23,30));d=ImageDraw.Draw(canvas)
 for si,state in enumerate(states):
  for pi,t in enumerate([0,.5,.999]):
   row=si*3+pi
   for col,dr in enumerate(dirs):
    names=g[state+'_'+dr];im=f[names[min(len(names)-1,int(t*len(names)))]];x,y=col*128,row*152;canvas.paste(im,(x,y+24),im);d.text((x+3,y+4),f'{state} {dr} {t:g}',fill=(220,220,220))
 canvas.save(out/(id+'-phases.png'))
 # Runtime atlasScale for these ordinary archetypes is exactly 1. Native
 # pixels are unscaled; every pose is positioned by its actual ground anchor.
 game=Image.new('RGB',(1024,5*160),(27,31,38));d=ImageDraw.Draw(game)
 for si,state in enumerate(states):
  for col,dr in enumerate(dirs):
   names=g[state+'_'+dr];im=f[names[len(names)//2]];x=col*128;y=si*160+28;game.paste(im,(x,y),im);ax=x+128*e['anchor']['x'];ay=y+128*e['anchor']['y'];d.line((ax-4,ay,ax+4,ay),fill=(110,170,120));d.line((ax,ay-4,ax,ay+4),fill=(110,170,120));d.text((x+3,si*160+5),state+' '+dr,fill='white')
 game.save(out/(id+'-game-size.png'))
 # All octants, true native source sample sequence, existing presentation FPS.
 for state in states:
  panels=[];count=max(len(g[state+'_'+dr]) for dr in dirs)
  for i in range(count):
   panel=Image.new('RGB',(1024,152),(20,23,30));draw=ImageDraw.Draw(panel)
   for col,dr in enumerate(dirs):
    names=g[state+'_'+dr];im=f[names[min(i,len(names)-1)]];panel.paste(im,(col*128,24),im);draw.text((col*128+3,4),state+' '+dr,fill='white')
   panels.append(panel)
  panels[0].save(out/(id+'-'+state+'.gif'),save_all=True,append_images=panels[1:],duration=round(1000/e['fps']),loop=0)
contact=Image.new('RGB',(1024,6*152),(20,23,30));d=ImageDraw.Draw(contact)
for ci,id in enumerate(['demon','goleling','slime']):
 e,f,g=cache[id]
 for si,state in enumerate(['idle','attack']):
  row=ci*2+si
  for col,dr in enumerate(dirs):
   names=g[state+'_'+dr];im=f[names[0 if state=='idle' else len(names)//2]];contact.paste(im,(col*128,row*152+24),im);d.text((col*128+3,row*152+4),id+' '+state+' '+dr,fill='white')
contact.save(out/'contact-sheet.png')
compare=Image.new('RGB',(1024,304),(20,23,30));d=ImageDraw.Draw(compare)
for row,id in enumerate(['bat','goleling']):
 e,f,g=cache.get(id) or load(id)
 for col,dr in enumerate(dirs):
  im=f[g['idle_'+dr][0]];compare.paste(im,(col*128,row*152+24),im);d.text((col*128+4,row*152+4),id+' '+dr,fill='white')
compare.save(out/'bat-goleling-comparison.png')
(out/'preview-manifest.json').write_text(json.dumps({'parent_visual_approved':False,'screenshots':0,'decoded_delivered_pixels':True,'runtime_scale':1,'ground_marker':'green cross at exact manifest anchor','files':[p.name for p in sorted(out.glob('*')) if p.is_file()]},indent=2)+'\n')
