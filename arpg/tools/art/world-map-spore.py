from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import random, math
R=random.Random(42042);W,H=1536,768
im=Image.new('RGB',(W,H));pix=im.load()
# Deep indigo cavern air with a teal bioluminescent haze low in the hollow.
for y in range(H):
 for x in range(W):
  depth=y/H;glow=max(0,1-math.hypot(x-760,y-560)/820)
  pix[x,y]=(int(18+16*depth+10*glow),int(20+22*depth+58*glow),int(36+30*depth+62*glow))
d=ImageDraw.Draw(im,'RGBA')
# Hanging root curtains from the cavern ceiling; deliberately empty of actors/UI.
for i in range(46):
 x=R.randrange(W);l=R.randrange(60,240);c=(34,30,52,R.randrange(150,230))
 pts=[(x+8*math.sin(k*.5+i),k) for k in range(0,l,10)];d.line(pts,fill=c,width=R.randrange(3,8))
# Distant layered rock shelves.
def shelf(base,amp,freq,phase,fill,rim):
 pts=[(x,base+amp*math.sin(x*freq+phase)+amp*.5*math.sin(x*freq*2.7+phase*1.3)) for x in range(0,W+8,8)]
 d.polygon(pts+[(W,H),(0,H)],fill=fill);d.line(pts,fill=rim,width=3)
shelf(430,26,.005,.8,(30,34,58,255),(62,120,130,180))
shelf(520,32,.004,2.6,(36,40,66,255),(74,150,150,200))
# Giant mushroom trees: tall stalks with glowing domed caps and gills.
def mushroom(x,base,h,capw,cap,glow):
 sw=max(10,capw//7)
 d.polygon([(x-sw,base),(x-sw*.6,base-h),(x+sw*.6,base-h),(x+sw,base)],fill=(112,108,128,255))
 d.line([(x-sw*.3,base),(x-sw*.2,base-h)],fill=(150,146,168,200),width=max(2,sw//3))
 for r in range(5,0,-1):d.ellipse((x-capw//2-r*14,base-h-capw//3-r*14,x+capw//2+r*14,base-h+capw//6+r*14),fill=(*glow,12))
 d.pieslice((x-capw//2,base-h-capw//2,x+capw//2,base-h+capw//4),180,360,fill=cap)
 for k in range(-capw//2+12,capw//2-8,14):d.line([(x+k,base-h-capw//8),(x+k*.6,base-h)],fill=(150,140,170,200),width=2)
 for _ in range(6):
  sx=x+R.randrange(-capw//3,capw//3);sy=base-h-R.randrange(capw//6,capw//3);s=R.randrange(5,12)
  d.ellipse((sx-s,sy-s,sx+s,sy+s),fill=(235,240,250,200))
for x,base,h,cw,cap,glow in [(230,640,300,240,(46,120,150,255),(90,220,230)),(560,600,210,170,(120,70,160,255),(190,120,240)),
  (1000,630,340,280,(40,130,140,255),(80,230,210)),(1330,610,230,190,(130,64,140,255),(220,110,220)),(770,690,120,110,(60,140,170,255),(90,220,240))]:
 mushroom(x,base,h,cw,cap,glow)
shelf(660,22,.006,4.4,(26,30,48,255),(70,160,150,220))
# Small glowing toadstools and drifting spores across the floor.
for i in range(60):
 x=R.randrange(W);y=R.randrange(650,H);s=R.randrange(5,14);c=R.choice([(90,230,220),(200,120,240),(120,200,250)])
 d.rectangle((x-2,y-s,x+2,y),fill=(130,124,140,230));d.pieslice((x-s,y-s-s//2,x+s,y-s+s//2),180,360,fill=(*c,235))
for i in range(260):
 x=R.randrange(W);y=R.randrange(80,H);s=R.random()*2.6+.6;c=R.choice([(150,255,235),(220,170,255)])
 d.ellipse((x-s,y-s,x+s,y+s),fill=(*c,R.randrange(70,190)))
im=im.filter(ImageFilter.GaussianBlur(.5)).resize((768,384),Image.Resampling.LANCZOS)
p=Path('arpg/assets/world-map/spore.webp');im.save(p,'WEBP',quality=82,method=6)
print(p,p.stat().st_size)
