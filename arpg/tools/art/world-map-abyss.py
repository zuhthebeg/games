from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import random, math
R=random.Random(45045);W,H=1536,768
im=Image.new('RGB',(W,H));pix=im.load()
# Deep-water gradient: pale cyan surface glow fading into an ink-blue trench floor.
for y in range(H):
 for x in range(W):
  depth=y/H;glow=max(0,1-math.hypot(x-520,y+120)/900)
  pix[x,y]=(int(10+18*glow-6*depth),int(40+70*glow-22*depth),int(62+80*glow-20*depth))
d=ImageDraw.Draw(im,'RGBA')
# Slanted god rays from the surface; deliberately empty of actors/UI.
for i in range(9):
 x=R.randrange(-200,W);w=R.randrange(40,120);sl=R.randrange(160,320)
 d.polygon([(x,0),(x+w,0),(x+w+sl,H),(x+sl,H)],fill=(150,220,230,R.randrange(10,22)))
# Distant trench walls.
def ridge(base,amp,freq,phase,fill,rim):
 pts=[(x,base+amp*math.sin(x*freq+phase)+amp*.6*math.sin(x*freq*3.1+phase*.7)) for x in range(0,W+8,8)]
 d.polygon(pts+[(W,H),(0,H)],fill=fill);d.line(pts,fill=rim,width=3)
ridge(420,40,.004,1.4,(14,40,56,255),(40,110,120,160))
# Sunken temple: broken columns and a tilted lintel on the middle shelf.
def column(x,base,h,w,broken):
 d.rectangle((x-w//2,base-h,x+w//2,base),fill=(70,96,104,255))
 for k in range(-w//2+6,w//2-4,9):d.line([(x+k,base-h+6),(x+k,base-4)],fill=(52,76,86,255),width=3)
 d.rectangle((x-w//2-8,base-12,x+w//2+8,base),fill=(60,84,92,255))
 if broken:d.polygon([(x-w//2,base-h),(x-w//4,base-h-18),(x+w//6,base-h-6),(x+w//2,base-h-24),(x+w//2,base-h)],fill=(70,96,104,255))
 else:d.rectangle((x-w//2-10,base-h-14,x+w//2+10,base-h),fill=(78,104,112,255))
for x,h,b in [(430,250,False),(560,190,True),(900,280,False),(1040,150,True),(1180,220,True)]:column(x,560,h,46,b)
d.polygon([(400,300),(930,270),(934,290),(404,322)],fill=(82,108,116,255))
ridge(560,18,.006,3.2,(18,46,58,255),(50,130,130,200))
# Kelp and coral fans on the floor.
for i in range(70):
 x=R.randrange(W);base=R.randrange(600,H+20);l=R.randrange(60,220);c=R.choice([(30,110,80),(40,130,90),(26,90,70)])
 pts=[(x+12*math.sin(k*.04+i),base-k) for k in range(0,l,8)];d.line(pts,fill=(*c,230),width=R.randrange(4,9))
for i in range(26):
 x=R.randrange(W);y=R.randrange(640,H);s=R.randrange(14,34);c=R.choice([(200,90,110),(230,140,90),(170,80,150)])
 for a in range(-60,61,20):d.line([(x,y),(x+s*math.sin(math.radians(a)),y-s*math.cos(math.radians(a)))],fill=(*c,220),width=4)
# Rising bubbles and drifting plankton glints.
for i in range(220):
 x=R.randrange(W);y=R.randrange(H);s=R.random()*3.2+.8
 d.ellipse((x-s,y-s,x+s,y+s),outline=(190,240,245,R.randrange(80,200)),width=1)
for i in range(160):
 x=R.randrange(W);y=R.randrange(H);s=R.random()*1.6+.4
 d.ellipse((x-s,y-s,x+s,y+s),fill=(150,250,230,R.randrange(60,160)))
im=im.filter(ImageFilter.GaussianBlur(.5)).resize((768,384),Image.Resampling.LANCZOS)
p=Path('arpg/assets/world-map/abyss.webp');im.save(p,'WEBP',quality=82,method=6)
print(p,p.stat().st_size)
