from PIL import Image, ImageDraw, ImageFilter
import random, math
from pathlib import Path
R=random.Random(31033); W,H=1536,768
im=Image.new('RGB',(W,H)); pix=im.load()
for y in range(H):
 for x in range(W):
  haze=max(0,1-abs(x-W*.53)/(W*.9)); depth=y/H
  pix[x,y]=(int(13+19*depth+5*haze),int(26+39*depth+8*haze),int(42+53*depth+15*haze))
d=ImageDraw.Draw(im,'RGBA')
# Receding cave walls and ice shelves, a natural cavern rather than a gameplay capture.
for i in range(10):
 x=i*190-110+R.randrange(-30,30); y=R.randrange(25,120)
 d.polygon([(x-140,0),(x+190,0),(x+135,y+245),(x+70,y+126),(x-8,y+290),(x-83,y+115)],fill=(16+i%3*3,36+i%3*4,53+i%3*7,190))
for i in range(28):
 x=R.randrange(W); y=R.randrange(0,140); length=R.randrange(35,195)
 d.polygon([(x-17,y),(x+25,y),(x+R.randrange(-17,17),y+length)],fill=(91,150,169,125))
 d.line([(x-14,y+5),(x,y+length-13)],fill=(178,229,229,90),width=3)
# Frosted tunnel arch opening and distant teal light.
d.ellipse((460,100,1150,660),fill=(37,76,94,255))
d.ellipse((545,175,1070,610),fill=(75,126,144,255))
for k in range(9,0,-1):
 box=(660-k*10,220-k*4,975+k*10,570+k*4)
 d.ellipse(box,fill=(int(124-k*8),int(204-k*10),int(220-k*10),200))
# Jagged arch rocks frame the luminous tunnel.
d.polygon([(260,0),(700,0),(640,80),(515,165),(480,325),(390,402),(332,254)],fill=(29,54,70,255))
d.polygon([(1000,0),(1430,0),(1370,230),(1250,350),(1115,240),(1030,105)],fill=(25,51,68,255))
d.polygon([(0,440),(320,330),(475,400),(650,520),(440,600),(0,610)],fill=(35,62,77,255))
d.polygon([(1536,350),(1240,335),(1080,470),(930,620),(1536,600)],fill=(37,63,76,255))
# Layered floor, frozen stream leading toward the cave exit.
d.polygon([(0,625),(430,565),(680,586),(835,570),(1210,545),(1536,595),(1536,768),(0,768)],fill=(33,62,78,255))
d.polygon([(650,585),(910,558),(1120,580),(900,768),(410,768)],fill=(85,143,159,225))
d.polygon([(740,586),(909,558),(1040,583),(745,768),(530,768)],fill=(138,194,199,130))
for i in range(47):
 x=R.randrange(-50,W+50); y=R.randrange(500,840); radius=R.randrange(15,95)
 c=R.choice([(48,82,97,220),(62,101,117,220),(78,121,136,230)])
 d.polygon([(x-radius,y+radius//3),(x-radius//2,y-radius//2),(x+radius//4,y-radius),(x+radius,y-radius//4),(x+radius//2,y+radius//3)],fill=c)
 d.line([(x-radius//2,y-radius//2),(x+radius//4,y-radius),(x+radius,y-radius//4)],fill=(132,184,190,100),width=3)
# Translucent crystal columns with cold edges.
for x,y,h in [(270,585,215),(370,625,140),(1200,585,245),(1320,630,150),(105,610,95)]:
 d.polygon([(x-32,y),(x-21,y-h*0.68),(x,y-h),(x+24,y-h*.7),(x+38,y)],fill=(65,155,184,210))
 d.polygon([(x,y-h),(x+24,y-h*.7),(x+38,y),(x+5,y)],fill=(136,225,231,150))
 d.line([(x-21,y-h*.68),(x,y-h),(x+24,y-h*.7)],fill=(210,249,246,200),width=5)
for i in range(125):
 x=R.randrange(W);y=R.randrange(95,H-20); rr=R.randrange(1,4)
 d.ellipse((x-rr,y-rr,x+rr,y+rr),fill=(178,234,242,R.randrange(25,100)))
im=im.filter(ImageFilter.GaussianBlur(.55)).resize((768,384),Image.Resampling.LANCZOS)
p=Path('arpg/assets/world-map/frost.webp'); im.save(p,'WEBP',quality=82,method=6)
print(p,p.stat().st_size)
