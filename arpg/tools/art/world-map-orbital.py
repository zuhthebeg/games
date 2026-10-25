from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math,random
R=random.Random(52054); W,H=1536,768
im=Image.new('RGB',(W,H)); p=im.load()
for y in range(H):
 for x in range(W):
  r=math.hypot((x-1180)/1150,(y-650)/610); g=max(0,1-r)
  p[x,y]=(int(12+40*g+18*y/H),int(25+72*g+16*y/H),int(45+102*g+22*y/H))
d=ImageDraw.Draw(im,'RGBA')
# Planet curve and atmospheric crescent behind the station.
d.ellipse((-180,300,1060,1520),fill=(45,92,126,255),outline=(113,210,226,210),width=12)
d.arc((-210,270,1080,1540),185,335,fill=(182,245,241,155),width=22)
for i in range(220):
 x=R.randrange(W);y=R.randrange(500);v=R.randrange(80,230);s=R.choice((1,1,2,3));d.ellipse((x-s,y-s,x+s,y+s),fill=(v,v+min(255-v,17),255,R.randrange(80,240)))
# Massive station docking hull: long landing deck, freestanding bays and glass control bridge.
d.polygon([(0,575),(1536,530),(1536,768),(0,768)],fill=(49,67,79,255))
d.polygon([(0,575),(1536,530),(1536,548),(0,594)],fill=(114,171,187,255))
for y in (626,685,746):d.line([(0,y),(1536,y-30)],fill=(73,105,122,255),width=4)
for x in range(80,1536,166):
 d.line([(x,555-x*.029),(x-100,768)],fill=(33,51,66,210),width=3)
for cx,cy,w,h in [(270,518,150,230),(760,500,180,285),(1300,486,160,205)]:
 d.polygon([(cx-w,cy),(cx-w*.9,cy-h),(cx+w*.8,cy-h),(cx+w,cy)],fill=(43,65,80,255),outline=(132,188,196,255))
 d.rectangle((cx-w*.65,cy-h*.76,cx+w*.60,cy-h*.28),fill=(53,121,147,255),outline=(160,231,228,255),width=5)
 for k in range(5):d.line([(cx-w*.6+k*w*.3,cy-h*.76),(cx-w*.6+k*w*.3,cy-h*.28)],fill=(34,65,82,255),width=4)
 for k in (-1,1):d.polygon([(cx+k*w*.65,cy-h*.88),(cx+k*w*.9,cy-h*.88),(cx+k*w*.78,cy-h*1.28)],fill=(159,199,207,220))
# Beacon rings, antenna arms and lit landing markings.
d.arc((600,96,1130,550),215,325,fill=(101,219,222,160),width=16)
d.arc((630,126,1100,520),215,325,fill=(193,250,235,105),width=5)
for x in (200,500,1020,1380):
 d.ellipse((x-13,590,x+13,606),fill=(69,235,220,245))
 d.line([(x,568),(x,644)],fill=(90,231,224,130),width=3)
for x in range(200,1470,130):d.polygon([(x,700),(x+40,699),(x+58,708),(x+18,709)],fill=(219,229,163,190))
im=im.filter(ImageFilter.GaussianBlur(.45)).resize((768,384),Image.Resampling.LANCZOS)
out=Path('arpg/assets/world-map/orbital.webp');im.save(out,'WEBP',quality=82,method=6);print(out,out.stat().st_size)
