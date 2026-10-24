from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import random, math
R=random.Random(51051);W,H=1536,768
im=Image.new('RGB',(W,H));pix=im.load()
# Rose-violet dusk above a sea of clouds: warm gold glow low on the horizon.
for y in range(H):
 for x in range(W):
  depth=y/H;glow=max(0,1-math.hypot(x-420,y-430)/1000)
  pix[x,y]=(int(70+150*glow+20*depth),int(52+96*glow+10*depth),int(96+40*glow-6*depth))
d=ImageDraw.Draw(im,'RGBA')
# Faint light shafts from the hidden sun.
for a in (-.55,-.32,-.1,.14,.36):
 d.polygon([(420,430),(420+1400*math.cos(a-.03),430-900*math.sin(.7+a)),(420+1400*math.cos(a+.03),430-900*math.sin(.72+a))],fill=(255,226,170,18))
# Distant floating spire islands; deliberately empty of actors/UI.
def island(cx,cy,w,h,col,rim):
 d.polygon([(cx-w,cy),(cx+w,cy),(cx+w*.35,cy+h),(cx,cy+h*1.25),(cx-w*.4,cy+h)],fill=col)
 d.line([(cx-w,cy),(cx+w,cy)],fill=rim,width=3)
def spire(cx,base,h,w,col,cap):
 d.rectangle((cx-w,base-h,cx+w,base),fill=col)
 d.polygon([(cx-w-6,base-h),(cx,base-h-w*3.2),(cx+w+6,base-h)],fill=cap)
 for k in range(3):d.rectangle((cx-w*.35,base-h+18+k*h/3.6,cx+w*.35,base-h+38+k*h/3.6),fill=(60,46,74,255))
for cx,cy,w,h,s in [(1180,300,150,90,1),(980,250,70,46,.6),(1400,230,80,52,.7),(240,280,90,60,.75)]:
 col=(int(118*s+30),int(100*s+26),int(126*s+30),255);island(cx,cy,w,h,col,(236,206,150,200))
 spire(cx,cy,int(190*s),int(22*s)+4,(int(200*s+30),int(186*s+28),int(196*s+30),255),(214,170,92,255))
# Cloud sea in layered bands.
def clouds(base,amp,col,n,size):
 for i in range(n):
  x=R.randrange(-80,W+80);y=base+R.randrange(-amp,amp);s=R.randrange(size//2,size)
  d.ellipse((x-s*1.8,y-s*.55,x+s*1.8,y+s*.55),fill=col)
clouds(470,30,(214,180,196,90),60,90)
clouds(560,40,(236,206,212,120),70,110)
# Foreground marble terrace: broken columns, an arch and a gold-rimmed altar step.
d.polygon([(0,640),(W,610),(W,H),(0,H)],fill=(176,160,170,255))
d.line([(0,640),(W,610)],fill=(240,214,160,255),width=4)
for x in range(0,W,96):d.line([(x,640-x*.0195),(x-60,H)],fill=(140,124,140,160),width=2)
def column(cx,base,h,w,broken):
 d.rectangle((cx-w,base-h,cx+w,base),fill=(222,212,214,255))
 for k in range(-w+6,w,10):d.line([(cx+k,base-h+6),(cx+k,base-4)],fill=(184,170,180,255),width=2)
 d.rectangle((cx-w-8,base-10,cx+w+8,base+6),fill=(200,188,192,255))
 if broken:d.polygon([(cx-w,base-h),(cx-w*.2,base-h-22),(cx+w*.4,base-h-6),(cx+w,base-h-30),(cx+w,base-h)],fill=(222,212,214,255))
 else:d.rectangle((cx-w-10,base-h-16,cx+w+10,base-h),fill=(232,200,132,255))
for cx,h,w,b in [(110,300,30,True),(330,220,26,False),(1290,330,32,False),(1460,190,28,True)]:column(cx,632,h,w,b)
# Ruined arch framing the far clouds.
d.arc((560,330,980,750),180,360,fill=(214,202,206,255),width=34)
d.rectangle((560,540,594,640),fill=(214,202,206,255));d.rectangle((946,540,980,640),fill=(214,202,206,255))
d.arc((560,330,980,750),180,360,fill=(236,196,120,255),width=4)
# Fallen column drums and feathers drifting on the wind.
for x,y,r in [(720,690,34),(820,706,26),(1090,688,30)]:
 d.ellipse((x-r,y-r*.45,x+r,y+r*.45),fill=(204,192,196,255),outline=(150,134,150,255),width=3)
for i in range(70):
 x=R.randrange(W);y=R.randrange(80,H-40);l=R.randrange(8,18);a=R.random()*math.pi
 d.line([(x,y),(x+l*math.cos(a),y+l*math.sin(a))],fill=(252,244,236,R.randrange(90,190)),width=2)
for i in range(160):
 x=R.randrange(W);y=R.randrange(H);s=R.random()*1.6+.4
 d.ellipse((x-s,y-s,x+s,y+s),fill=(255,236,190,R.randrange(60,170)))
im=im.filter(ImageFilter.GaussianBlur(.5)).resize((768,384),Image.Resampling.LANCZOS)
p=Path('arpg/assets/world-map/sky.webp');im.save(p,'WEBP',quality=82,method=6)
print(p,p.stat().st_size)
