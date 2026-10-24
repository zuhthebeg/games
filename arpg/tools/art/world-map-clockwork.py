from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import random, math
R=random.Random(48048);W,H=1536,768
im=Image.new('RGB',(W,H));pix=im.load()
# Smoky amber dusk over a ruined clockwork foundry: warm haze top, soot-brown floor.
for y in range(H):
 for x in range(W):
  depth=y/H;glow=max(0,1-math.hypot(x-1050,y-120)/950)
  pix[x,y]=(int(46+120*glow-14*depth),int(36+70*glow-12*depth),int(30+30*glow-10*depth))
d=ImageDraw.Draw(im,'RGBA')
# Distant chimney stacks and broken walls; deliberately empty of actors/UI.
for x,h,w in [(140,330,46),(260,250,34),(1290,360,52),(1420,280,38)]:
 d.rectangle((x-w//2,H-h-180,x+w//2,H),fill=(40,32,28,255))
 d.rectangle((x-w//2-6,H-h-190,x+w//2+6,H-h-174),fill=(52,42,34,255))
 for k in range(5):
  s=R.randrange(30,70);cx=x+R.randrange(-20,40)+k*14;cy=H-h-210-k*48
  d.ellipse((cx-s,cy-s*.6,cx+s,cy+s*.6),fill=(120,104,92,R.randrange(26,50)))
def ridge(base,amp,freq,phase,fill,rim):
 pts=[(x,base+amp*math.sin(x*freq+phase)+amp*.5*math.sin(x*freq*2.7+phase*.6)) for x in range(0,W+8,8)]
 d.polygon(pts+[(W,H),(0,H)],fill=fill);d.line(pts,fill=rim,width=3)
ridge(470,26,.005,.8,(48,38,30,255),(120,86,52,170))
# Giant half-buried gears: brass rims, spokes and teeth.
def gear(cx,cy,r,teeth,col,rim,rot):
 for i in range(teeth):
  a=rot+i*2*math.pi/teeth;t=r*.12
  pts=[(cx+(r-2)*math.cos(a-.09),cy+(r-2)*math.sin(a-.09)),(cx+(r+t)*math.cos(a-.06),cy+(r+t)*math.sin(a-.06)),
       (cx+(r+t)*math.cos(a+.06),cy+(r+t)*math.sin(a+.06)),(cx+(r-2)*math.cos(a+.09),cy+(r-2)*math.sin(a+.09))]
  d.polygon(pts,fill=col)
 d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=col,outline=rim,width=4)
 d.ellipse((cx-r*.72,cy-r*.72,cx+r*.72,cy+r*.72),fill=(44,34,28,255))
 for i in range(6):
  a=rot+i*math.pi/3;d.line([(cx,cy),(cx+r*.74*math.cos(a),cy+r*.74*math.sin(a))],fill=col,width=max(6,int(r*.1)))
 d.ellipse((cx-r*.2,cy-r*.2,cx+r*.2,cy+r*.2),fill=rim)
for cx,cy,r,n,rot in [(420,560,190,22,.1),(700,610,110,16,.4),(980,540,230,26,.25),(1240,640,120,16,.7),(190,660,90,12,.3)]:
 gear(cx,cy,r,n,(150,108,56,255),(198,152,82,255),rot)
# Leaning pipes, a fallen girder and steam vents on the floor.
d.polygon([(560,300),(600,296),(780,700),(740,706)],fill=(96,74,52,255))
for k in range(4):d.line([(566+k*48,318+k*96),(598+k*48,314+k*96)],fill=(170,130,74,255),width=6)
d.polygon([(1080,420),(1500,500),(1496,522),(1076,442)],fill=(84,64,46,255))
for x in range(1100,1480,34):d.line([(x,424+(x-1080)*.19),(x+16,444+(x-1080)*.19)],fill=(60,46,34,255),width=4)
ridge(650,14,.007,2.1,(42,32,26,255),(110,80,50,200))
for i in range(9):
 x=R.randrange(80,W-80);y=R.randrange(660,H-10)
 for k in range(7):
  s=10+k*7;d.ellipse((x-s+k*3,y-k*26-s*.6,x+s+k*3,y-k*26+s*.6),fill=(220,206,190,max(8,48-k*6)))
# Floating sparks and loose rivets catching the furnace light.
for i in range(200):
 x=R.randrange(W);y=R.randrange(H);s=R.random()*1.8+.5
 d.ellipse((x-s,y-s,x+s,y+s),fill=(255,R.randrange(150,210),90,R.randrange(70,190)))
for i in range(60):
 x=R.randrange(W);y=R.randrange(560,H);s=R.randrange(3,7)
 d.ellipse((x-s,y-s,x+s,y+s),fill=(176,134,80,220),outline=(70,52,36,255))
im=im.filter(ImageFilter.GaussianBlur(.5)).resize((768,384),Image.Resampling.LANCZOS)
p=Path('arpg/assets/world-map/clockwork.webp');im.save(p,'WEBP',quality=82,method=6)
print(p,p.stat().st_size)
