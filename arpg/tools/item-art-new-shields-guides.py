from pathlib import Path
from PIL import Image,ImageDraw
p=Path('/mnt/c/Users/user/ai-tools/outputs/arpg-new-shields-20261020');p.mkdir(parents=True,exist_ok=True)
for name in ['buckler','kite-shield','tower-shield','bone-shield']:
 im=Image.new('RGB',(768,768),'white');d=ImageDraw.Draw(im)
 if name=='buckler':
  d.ellipse((160,160,608,608),fill='#697678',outline='#363d40',width=18);d.ellipse((180,180,588,588),outline='#c0b28c',width=18);d.ellipse((290,290,478,478),fill='#c2c5b5',outline='#414947',width=14)
 elif name=='kite-shield':
  pts=[(384,90),(580,160),(558,390),(490,540),(384,690),(278,540),(210,390),(188,160)];d.polygon(pts,fill='#b5985f',outline='#333b3f',width=12);d.polygon([(384,120),(550,183),(526,395),(464,528),(384,640),(304,528),(242,395),(218,183)],fill='#223c59');d.polygon([(363,155),(405,155),(405,310),(514,310),(510,351),(405,351),(405,581),(384,612),(363,581),(363,351),(258,351),(254,310),(363,310)],fill='#c9b36f')
 elif name=='tower-shield':
  d.rounded_rectangle((175,88,593,687),radius=28,fill='#494f4d',outline='#252b2b',width=18);d.rounded_rectangle((199,112,569,663),radius=16,fill='#644d35',outline='#b29863',width=16)
  for x in [265,345,425,505]:d.line([(x,130),(x,647)],fill='#302c24',width=8)
  for y in [240,525]:d.rectangle((205,y,565,y+30),fill='#8b8d76');d.ellipse((332,320,436,440),fill='#aaa37d',outline='#3e433d',width=14)
 else:
  pts=[(384,95),(445,150),(535,125),(572,228),(535,390),(493,540),(384,670),(275,540),(233,390),(196,228),(233,125),(323,150)];d.polygon(pts,fill='#5d5848',outline='#353833',width=12)
  for y in [260,340,420,500]:
   d.line([(260,y),(384,y+65),(508,y)],fill='#c8bd99',width=30)
  d.ellipse((290,160,478,347),fill='#d7c9a4',outline='#81745b',width=10);d.rectangle((326,300,442,369),fill='#baac89');d.ellipse((315,227,366,277),fill='#252b27');d.ellipse((402,227,453,277),fill='#252b27');d.polygon([(384,273),(368,306),(400,306)],fill='#292c27')
 im.save(p/(name+'-guide.png'))
