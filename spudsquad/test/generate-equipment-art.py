"""Free local vector drawing, supersampled to lossless 256px WebP. No AI/API."""
from PIL import Image, ImageDraw
from pathlib import Path
import math
OUT=Path(__file__).resolve().parents[1]/'assets'
K=4
palette=[('#bc7b3f','#f0bc72','#795030'),('#368cce','#b7e7ff','#1c5688'),('#8756ba','#dbc2ff','#4d307c'),('#e5aa30','#fff1a3','#956114')]
def make(id,t):
 im=Image.new('RGBA',(256*K,256*K));d=ImageDraw.Draw(im);base,light,dark=palette[t-1];outline='#3c251b'
 def pts(p):return [(int(x*K),int(y*K)) for x,y in p]
 def line(p,c,w=3):d.line(pts(p),fill=c,width=int(w*K),joint='curve')
 def poly(p,c):d.polygon(pts(p),fill=c)
 def ellipse(b,c,o=None,w=1):d.ellipse(tuple(int(n*K) for n in b),fill=c,outline=o,width=int(w*K))
 if id=='stick':
  # One blunt, rounded piece of timber. No blade, point, metal crossguard.
  body=[(20,115),(30,106),(69,109),(100,101),(139,94),(178,86),(216,89),(235,98),(241,113),(239,133),(228,147),(206,151),(165,149),(126,144),(89,139),(50,144),(25,140),(17,130),(20,115)]
  poly(body,outline);poly([(x+(4 if x<128 else -4),y+(5 if y<128 else -5)) for x,y in body],'#b9783b')
  poly([(32,114),(91,119),(140,108),(187,97),(222,102),(231,111),(216,115),(166,117),(123,126),(72,130),(29,130)],'#e6ad64')
  line([(82,136),(122,132),(151,136),(188,137),(218,132)],'#724322',3)
  line([(104,113),(143,104),(171,106),(200,102)],'#8e552c',2)
  line([(147,125),(172,120),(201,124),(226,119)],'#8e552c',2)
  ellipse((185,113,206,133),'#b9783b','#744423',2);line([(190,123),(201,121)],'#f4c17a',2)
  # Colored leather grip/rank bindings; short wraps, never a crossguard.
  for x in [39,50,61]:poly([(x,110),(x+8,111),(x+12,139),(x+4,140)],dark);line([(x+2,113),(x+7,135)],light,2)
  ellipse((222,105,235,135),'#946033','#5d391f',2);line([(227,111),(230,129)],'#e1ac68',2)
 else:
  ellipse((19,22,239,242),outline);ellipse((26,29,232,235),dark);ellipse((32,34,225,229),base)
  ellipse((43,45,214,218),outline);ellipse((49,51,208,212),'#a56636')
  # Wooden round shield with colored tier rim, copper rivets and potato crest.
  for x in [82,111,140,169]:line([(x,57),(x-5,203)],'#633e25',3);line([(x+4,60),(x,193)],'#e8ad60',2)
  ellipse((76,74,181,185),outline);ellipse((82,80,175,179),dark);ellipse((88,85,169,174),base)
  poly([(128,96),(143,116),(157,129),(142,149),(127,162),(112,146),(98,129),(114,113)],light)
  ellipse((114,118,120,125),dark);ellipse((136,123,142,130),dark);ellipse((122,141,128,148),dark)
  for n in range(8):
   a=n*math.pi/4;x=129+96*math.cos(a);y=132+96*math.sin(a)
   ellipse((x-5,y-5,x+5,y+5),outline);ellipse((x-3,y-3,x+3,y+3),light)
  line([(46,88),(52,68),(71,50),(91,42)],light,4)
  if t>=3:
   for x,y in [(61,131),(194,131)]:poly([(x,y-8),(x+5,y),(x,y+8),(x-5,y)],light)
 im.resize((256,256),Image.Resampling.LANCZOS).save(OUT/('weapon_'+id+('' if t==1 else '_t'+str(t))+'.webp'),format='WEBP',lossless=True,method=6)
for id in ['stick','shield']:
 for t in range(1,5):make(id,t)
