from PIL import Image,ImageDraw,ImageFilter
from pathlib import Path
import random,math
R=random.Random(55057);W,H=1536,768
im=Image.new('RGB',(W,H));pix=im.load()
for y in range(H):
 for x in range(W):
  f=y/H;glow=max(0,1-math.hypot((x-1110)/1400,(y-260)/850))
  pix[x,y]=(int(31+30*glow+17*f),int(30+54*glow+25*f),int(65+88*glow+24*f))
d=ImageDraw.Draw(im,'RGBA')
# Pale moon outside the botanical dome; distant lunar ridges.
d.ellipse((1170,58,1410,298),fill=(224,221,242,230),outline=(245,250,255,210),width=10)
for i in range(34):
 x=R.randrange(W);y=R.randrange(330);v=R.randrange(150,245);d.ellipse((x,y,x+R.choice((2,3,4)),y+3),fill=(v,v,255,140))
d.polygon([(0,493),(240,392),(430,480),(700,365),(950,475),(1190,377),(1536,487),(1536,768),(0,768)],fill=(80,68,117,220))
d.polygon([(0,541),(260,465),(500,526),(720,432),(1040,526),(1280,455),(1536,542),(1536,768),(0,768)],fill=(57,78,111,240))
# Glass biodome ribbing enclosing real plants rather than a tech-glyph background.
d.arc((100,145,1450,935),180,360,fill=(149,235,241,190),width=17)
d.arc((125,175,1425,905),180,360,fill=(221,244,245,115),width=5)
for x in (235,445,665,885,1105,1315):
 d.line([(x,535),(x+(x-768)*.2,245)],fill=(145,221,230,100),width=8)
 d.line([(x+9,535),(x+(x-768)*.2+9,245)],fill=(232,252,255,60),width=2)
# Silver waterway and violet stepping terraces.
d.polygon([(0,680),(350,610),(760,635),(1070,579),(1536,653),(1536,768),(0,768)],fill=(37,100,132,245))
for i in range(9):
 y=640+i*17;d.arc((-100,y,1650,y+80),5,170,fill=(130,228,235,70),width=4)
for x,y,w in [(180,600,150),(470,560,130),(800,545,170),(1220,570,190)]:
 d.ellipse((x-w,y-25,x+w,y+23),fill=(94,88,119,255),outline=(192,170,221,220),width=5)
# Bioluminescent trees, mushroom beds, roots and blossoms.
for cx,base,scale in [(120,555,.9),(370,508,.75),(610,560,.8),(1000,520,1.15),(1420,550,1.)]:
 h=180*scale;d.polygon([(cx-22*scale,base),(cx+22*scale,base),(cx+7*scale,base-h),(cx-12*scale,base-h)],fill=(89,78,110,255))
 for a in (-.8,0,.8):
  bx=cx+a*65*scale;by=base-h+abs(a)*28*scale
  d.ellipse((bx-88*scale,by-85*scale,bx+88*scale,by+28*scale),fill=(65,135,143,210),outline=(166,228,205,125),width=5)
  for i in range(22):
   px=bx+R.uniform(-65,65)*scale;py=by+R.uniform(-60,10)*scale;rad=R.uniform(2,5)*scale
   d.ellipse((px-rad,py-rad,px+rad,py+rad),fill=(167,249,220,R.randrange(100,210)))
for i in range(60):
 x=R.randrange(W);y=R.randrange(475,665);rad=R.randrange(2,7)
 d.ellipse((x-rad,y-rad,x+rad,y+rad),fill=(218,153,235,R.randrange(100,210)))
im=im.filter(ImageFilter.GaussianBlur(.45)).resize((768,384),Image.Resampling.LANCZOS)
out=Path('arpg/assets/world-map/lunar.webp');im.save(out,'WEBP',quality=82,method=6);print(out,out.stat().st_size)
