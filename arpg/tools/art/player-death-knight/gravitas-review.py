"""Offline actual-render comparison, native128 phase sheets and motion metrics."""
from pathlib import Path
from PIL import Image,ImageDraw
import json,sys,math
root=Path(sys.argv[1]);old=Path(sys.argv[2]);dest=Path(sys.argv[3]);dest.mkdir(parents=True,exist_ok=True)
f=root/'frames/player-death-knight';before=old/'frames/player-death-knight'
info=json.loads((f/'frames.json').read_text());validation=json.loads((root/'gravitas-source-validation.json').read_text())
# Source-derived contact coordinates use physical128 around the actual ground.
measure={x['name']:x for x in validation['measurements']};anchor=info['anchor'];dirs=['E','SE','S','SW','W','NW','N','NE']
comparison=Image.new('RGB',(8*128,6*150),(23,27,34));d=ImageDraw.Draw(comparison)
for row,(state,which) in enumerate([(s,w)for s in ['idle','attack','magic'] for w in ['before','after']]):
 for col,di in enumerate(dirs):
  name=f'{state if which=="after"or state!="magic"else"attack"}_{di}_{0 if state=="idle"else 6:03d}'
  im=Image.open((f if which=='after'else before)/(name+'.png')).convert('RGBA').resize((128,128),Image.Resampling.LANCZOS)
  x=col*128;y=row*150;comparison.paste(im,(x,y+22),im);d.text((x+2,y+3),which+' '+state+' '+di,fill='white')
comparison.save(dest/'before-after-native128.png')
# Explicit source contact markers (cyan left hand; gold right hand), not a
# claim that shared renderer currently consumes these new sockets.
for state in ['idle','attack','magic']:
 canvas=Image.new('RGB',(13*128,8*150),(23,27,34));dr=ImageDraw.Draw(canvas)
 for row,di in enumerate(dirs):
  names=sorted(x['name']for x in info['frames']if x['animation']==state+'_'+di)
  for col,n in enumerate(names):
   im=Image.open(f/(n+'.png')).convert('RGBA').resize((128,128),Image.Resampling.LANCZOS);x=col*128;y=row*150;canvas.paste(im,(x,y+22),im);dr.text((x+2,y+3),n,fill='white')
   for side,color in [('left','#00ffff'),('right','#ffcf45')]:
    p=measure[n][side];px=x+anchor['x']*128+p[0];py=y+22+anchor['y']*128+p[1];dr.ellipse((px-1.5,py-1.5,px+1.5,py+1.5),outline=color)
 canvas.save(dest/(state+'-sockets-8dir-native128.png'))
 for di in ['S','E','N']:
  seq=[]
  for n in sorted(x['name']for x in info['frames']if x['animation']==state+'_'+di):
   im=Image.open(f/(n+'.png')).convert('RGBA').resize((128,128),Image.Resampling.LANCZOS);b=Image.new('RGB',(128,150),(23,27,34));b.paste(im,(0,22),im);ImageDraw.Draw(b).text((2,2),n,fill='white');seq.append(b)
  seq[0].save(dest/(state+'-'+di+'.gif'),save_all=True,append_images=seq[1:],duration=84,loop=0)
metrics={}
for state in ['idle','magic']:
 rows=[v for n,v in measure.items()if n.startswith(state+'_S_')]
 metrics[state+'_foot_max_drift_world']=max(math.dist(a,b)for v in rows for a,b in zip(v['feet'],rows[0]['feet']))
metrics['max_blade_grip_error']=validation['max_grip_error'];metrics['frames']=len(info['frames']);metrics['groups']=len(set(x['animation']for x in info['frames']));metrics['anchor']=anchor
(dest/'motion-metrics.json').write_text(json.dumps(metrics,indent=2));print(json.dumps(metrics))
