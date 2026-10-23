from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import random, math
R=random.Random(36042);W,H=1536,768
im=Image.new('RGB',(W,H));pix=im.load()
for y in range(H):
 for x in range(W):
  depth=y/H;mist=max(0,1-abs(x-760)/980)
  pix[x,y]=(int(13+23*depth+8*mist),int(28+45*depth+15*mist),int(25+28*depth+8*mist))
d=ImageDraw.Draw(im,'RGBA')
# Distant drowned forest and low hanging fog; deliberately empty of actors/UI.
for i in range(22):
 x=i*79+R.randrange(-27,27);base=R.randrange(320,525);top=R.randrange(30,160)
 d.polygon([(x-38,base),(x-12,top),(x+11,top-22),(x+38,base)],fill=(25,49,39,180))
 for side in (-1,1):
  d.line([(x,top+110),(x+side*R.randrange(42,102),top+R.randrange(45,96))],fill=(29,54,42,180),width=13)
for band in range(7):
 y=325+band*37
 d.ellipse((-100,y,1640,y+115),fill=(94,145,119,13))
# Backlit shallow water and curving reed banks.
d.polygon([(0,510),(200,470),(405,518),(610,464),(890,520),(1120,468),(1536,492),(1536,768),(0,768)],fill=(31,57,44,255))
d.polygon([(0,610),(245,570),(430,615),(675,554),(940,614),(1240,565),(1536,615),(1536,768),(0,768)],fill=(49,92,72,255))
d.polygon([(210,615),(530,577),(750,640),(940,593),(1190,655),(1536,627),(1536,768),(0,768)],fill=(83,132,100,150))
# One split-trunk ancient willow as dominant focal point.
trunk=(760,480)
d.polygon([(629,505),(655,304),(688,200),(706,140),(730,216),(790,285),(817,146),(836,77),(861,192),(910,306),(928,501),(850,500),(810,423),(755,445),(685,505)],fill=(41,57,40,255))
d.line([(720,380),(643,236),(520,190)],fill=(46,68,46,255),width=34)
d.line([(847,350),(944,237),(1081,178)],fill=(44,66,44,255),width=30)
d.line([(752,335),(751,178),(700,84)],fill=(46,69,44,255),width=22)
for root in [(675,432,480,600),(730,450,575,570),(823,450,997,610),(881,405,1100,540)]:
 x,y,tx,ty=root;d.line([(x,y),(tx,ty)],fill=(47,68,43,255),width=29)
# Drooping fronds make an unmistakable swamp silhouette.
for center_x,center_y,radius in [(720,138,210),(800,150,230),(600,195,135),(995,188,150)]:
 for j in range(25):
  x=center_x+R.randrange(-radius,radius);y=center_y+R.randrange(-35,45);l=R.randrange(85,210)
  d.line([(x,y),(x+R.randrange(-18,18),y+l)],fill=(59,96,58,R.randrange(125,215)),width=R.randrange(3,8))
  if j%4==0:d.ellipse((x-11,y+l-18,x+12,y+l+8),fill=(66,108,63,170))
# Lime-lit fungi on stepping stones; hand-authored environment, not a gameplay capture.
for x,y,s in [(252,561,1.2),(334,598,.8),(1050,561,1),(1160,617,.7),(570,548,.6),(1330,549,.85)]:
 r=int(18*s);d.ellipse((x-2*r,y-5,x+2*r,y+r),fill=(24,42,32,235))
 d.line([(x,y),(x,y-int(48*s))],fill=(154,200,137,240),width=max(2,int(7*s)))
 d.ellipse((x-int(32*s),y-int(61*s),x+int(32*s),y-int(38*s)),fill=(130,204,131,255))
 d.arc((x-int(32*s),y-int(61*s),x+int(32*s),y-int(38*s)),0,180,fill=(214,249,164,210),width=3)
for i in range(130):
 x=R.randrange(W);y=R.randrange(465,H);d.line([(x,y),(x+R.randrange(-11,12),y-R.randrange(13,65))],fill=(75,126,72,R.randrange(90,210)),width=R.randrange(1,4))
for i in range(100):
 x=R.randrange(W);y=R.randrange(200,H);r=R.randrange(1,4)
 d.ellipse((x-r,y-r,x+r,y+r),fill=(171,214,127,R.randrange(25,95)))
im=im.filter(ImageFilter.GaussianBlur(.5)).resize((768,384),Image.Resampling.LANCZOS)
p=Path('arpg/assets/world-map/mire.webp');im.save(p,'WEBP',quality=82,method=6)
print(p,p.stat().st_size)
