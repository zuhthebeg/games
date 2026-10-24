from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import random, math
R=random.Random(39042);W,H=1536,768
im=Image.new('RGB',(W,H));pix=im.load()
# Hot amber sky fading into a pale horizon haze around a low sun.
for y in range(H):
 for x in range(W):
  depth=y/H;glow=max(0,1-math.hypot(x-1080,y-250)/720)
  pix[x,y]=(int(70+80*depth+95*glow),int(42+50*depth+62*glow),int(26+22*depth+24*glow))
d=ImageDraw.Draw(im,'RGBA')
d.ellipse((1010,180,1150,320),fill=(255,222,150,235))
for r in range(6):d.ellipse((1010-r*26,180-r*26,1150+r*26,320+r*26),fill=(255,205,120,10))
# Distant mesas; deliberately empty of actors/UI.
for i in range(9):
 x=i*190+R.randrange(-40,40);w=R.randrange(110,210);top=R.randrange(300,380)
 d.polygon([(x-w,470),(x-w+30,top),(x+w-30,top),(x+w,470)],fill=(118,66,43,200))
 d.line([(x-w+30,top),(x+w-30,top)],fill=(166,98,60,200),width=4)
# Layered dune ridges with sunlit crests.
def ridge(base,amp,freq,phase,fill,crest):
 pts=[(x,base+amp*math.sin(x*freq+phase)+amp*.4*math.sin(x*freq*2.3+phase*1.7)) for x in range(0,W+8,8)]
 d.polygon(pts+[(W,H),(0,H)],fill=fill);d.line(pts,fill=crest,width=3)
ridge(470,22,.006,.4,(150,92,52,255),(214,150,92,220))
ridge(540,30,.0045,2.1,(176,112,62,255),(236,176,108,230))
ridge(625,36,.0038,4.0,(196,132,74,255),(248,196,126,235))
ridge(700,28,.005,1.2,(170,108,60,255),(232,170,104,230))
# Ruined sun gate as focal point: two broken pillars and a fallen lintel.
for px,ph in [(640,250),(860,205)]:
 d.rectangle((px-28,600-ph,px+28,600),fill=(132,88,56,255))
 for k in range(0,ph,34):d.line([(px-28,600-k),(px+28,600-k)],fill=(104,68,44,255),width=3)
 d.polygon([(px-36,600-ph),(px+36,600-ph),(px+22,600-ph-18),(px-24,600-ph-12)],fill=(150,100,62,255))
d.polygon([(700,612),(905,592),(910,622),(704,640)],fill=(140,94,58,255))
d.ellipse((732,312,790,370),outline=(245,198,110,200),width=6)
# Saguaro-style silhouettes and wind-blown sand streaks.
for x,y,s in [(220,640,1.3),(330,676,.8),(1180,660,1.1),(1330,628,.9),(480,700,.6)]:
 c=(64,92,52,255);t=int(14*s);h=int(120*s)
 d.rounded_rectangle((x-t,y-h,x+t,y),radius=t,fill=c)
 d.rounded_rectangle((x-int(48*s),y-int(80*s),x-int(30*s),y-int(36*s)),radius=t,fill=c)
 d.line([(x-int(39*s),y-int(40*s)),(x-t,y-int(40*s))],fill=c,width=int(16*s))
 d.rounded_rectangle((x+int(30*s),y-int(96*s),x+int(48*s),y-int(54*s)),radius=t,fill=c)
 d.line([(x+t,y-int(58*s)),(x+int(39*s),y-int(58*s))],fill=c,width=int(16*s))
for i in range(160):
 x=R.randrange(W);y=R.randrange(420,H);l=R.randrange(30,140)
 d.line([(x,y),(x+l,y-R.randrange(2,10))],fill=(255,226,170,R.randrange(20,70)),width=R.randrange(1,3))
im=im.filter(ImageFilter.GaussianBlur(.5)).resize((768,384),Image.Resampling.LANCZOS)
p=Path('arpg/assets/world-map/dunes.webp');im.save(p,'WEBP',quality=82,method=6)
print(p,p.stat().st_size)
