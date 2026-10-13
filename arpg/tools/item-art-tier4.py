"""Original T4 grave/guardian item illustrations; existing Pillow 4x earthy item style.
96px transparent lossless WebP, no AI/network/reused external assets. Append-only manifest.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib, json
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/items'
K = 4
INK, STEEL, LIGHT, BRASS, WOOD = '#38271e', '#849595', '#dde2cc', '#c19b57', '#885831'
NAMES = ['revenant-blade','bone-bow','soulfire-wand','gravekeeper-staff','ossuary-maul','shroud-robe','shadow-leather','ossuary-plate','dragonfang-blade','dragon-scale-armor','dragon-scale']
records = json.loads((OUT/'manifest.json').read_text())
for name in NAMES:
    im = Image.new('RGBA',(96*K,96*K)); d = ImageDraw.Draw(im)
    def poly(p,c,edge=INK,w=2):
        p=[(int(x*K),int(y*K))for x,y in p];d.polygon(p,fill=c)
        if edge:d.line(p+[p[0]],fill=edge,width=w*K,joint='curve')
    def line(p,c,w=2):d.line([(int(x*K),int(y*K))for x,y in p],fill=c,width=w*K,joint='curve')
    def ellipse(b,c,edge=INK,w=2):d.ellipse(tuple(int(v*K)for v in b),fill=c,outline=edge,width=w*K)
    def bone(p,w=4):line(p,LIGHT,w);x,y=p[0];ellipse((x-3,y-3,x+3,y+3),LIGHT,w=1)
    if name=='revenant-blade':
        poly([(48,5),(58,12),(58,25),(54,29),(58,34),(58,62),(43,62),(43,12)],STEEL)
        poly([(48,8),(49,60),(44,59),(44,15)],LIGHT,None)
        poly([(27,57),(39,59),(42,54),(57,54),(61,58),(72,54),(69,65),(31,67)],BRASS)
        poly([(44,67),(56,65),(56,85),(48,91),(42,85)],WOOD)
        for y in [71,77,83]:line([(44,y),(54,y-2)],LIGHT,1)
        for y in [25,38,50]:line([(49,y-3),(53,y),(49,y+3)],'#6db4a0',1)
    elif name=='bone-bow':
        poly([(18,7),(31,14),(41,23),(49,34),(53,47),(51,61),(44,73),(29,84),(18,90),(15,85),(28,75),(36,64),(41,50),(37,35),(29,25),(17,14)],LIGHT)
        line([(18,10),(18,87)],'#d4bb87',2)
        for x,y in [(27,19),(38,31),(45,46),(43,62),(32,77)]:ellipse((x-5,y-4,x+5,y+4),BRASS,w=1)
        poly([(41,39),(53,43),(51,55),(40,58)],WOOD)
        line([(44,44),(50,45)],LIGHT,1)
    elif name=='soulfire-wand':
        poly([(41,42),(53,43),(50,84),(43,90),(38,83)],WOOD)
        for y in [52,64,76]:line([(41,y),(50,y-3)],BRASS,3)
        poly([(31,44),(26,29),(35,31),(39,12),(44,21),(51,5),(54,24),(65,18),(62,36),(56,47)],'#63978b')
        poly([(39,39),(39,29),(44,31),(50,17),(54,36),(50,44)],'#dde8c8',None)
        poly([(31,43),(56,43),(58,51),(33,52)],BRASS)
    elif name=='gravekeeper-staff':
        poly([(44,34),(52,34),(52,88),(44,93),(41,86)],WOOD)
        poly([(25,36),(23,22),(29,10),(35,7),(35,23),(41,28),(53,28),(60,21),(60,8),(67,13),(72,24),(66,36),(54,42),(36,41)],BRASS)
        ellipse((36,12,58,31),'#698b80');poly([(47,10),(54,21),(47,30),(40,21)],LIGHT,w=1)
        for y in [50,64,78]:bone([(44,y),(52,y+4)],2)
        poly([(40,88),(54,88),(54,94),(40,94)],STEEL)
    elif name=='ossuary-maul':
        poly([(43,38),(57,38),(56,87),(49,93),(42,87)],WOOD)
        poly([(16,18),(28,9),(66,9),(81,19),(77,46),(20,46)],STEEL)
        poly([(20,18),(29,13),(65,13),(75,20),(20,24)],LIGHT,None)
        poly([(33,10),(61,10),(64,46),(31,46)],BRASS)
        for x in [38,48,58]:bone([(x,18),(x,38)],3)
        for y in [59,69,79]:line([(44,y),(55,y-2)],BRASS,3)
    elif name=='shroud-robe':
        poly([(28,9),(37,15),(48,20),(59,15),(67,9),(86,40),(76,51),(67,44),(75,89),(56,94),(48,88),(38,94),(20,87),(29,43),(18,52),(9,41)],'#aaa38a')
        poly([(35,28),(46,31),(43,82),(27,86)],LIGHT,None)
        poly([(51,31),(62,25),(66,83),(53,85)],'#777463',None)
        line([(36,16),(48,26),(60,16)],BRASS,3)
        line([(30,57),(64,57)],WOOD,5);ellipse((43,52,54,63),BRASS,w=1)
        for x in [28,39,58,69]:line([(x,78),(x+2,88)],'#d5cdb2',1)
    elif name=='shadow-leather':
        poly([(13,15),(32,7),(41,19),(56,19),(64,7),(83,15),(89,32),(71,41),(68,48),(71,82),(56,90),(37,90),(24,81),(28,44),(12,39),(7,29)],'#654632')
        poly([(31,28),(47,32),(44,74),(30,76)],'#a47850',None)
        poly([(53,30),(65,24),(64,74),(52,82)],'#49392e',None)
        poly([(13,18),(29,13),(25,31),(10,33)],WOOD)
        poly([(66,14),(82,18),(85,30),(70,34)],WOOD)
        line([(30,45),(62,51),(32,61),(63,69)],BRASS,2)
        for x,y in [(32,32),(61,33),(31,76),(64,76)]:ellipse((x-2,y-2,x+2,y+2),BRASS,w=1)
    elif name=='ossuary-plate':
        poly([(9,21),(24,8),(39,15),(48,23),(57,15),(73,8),(86,21),(83,42),(68,39),(69,77),(59,87),(48,91),(34,85),(26,77),(28,40),(12,44)],STEEL)
        poly([(31,27),(44,30),(44,76),(32,72)],LIGHT,None)
        poly([(52,30),(64,25),(65,73),(51,80)],'#566c6f',None)
        for y in [35,46,57]:bone([(31,y),(43,y+5)],3);bone([(64,y),(52,y+5)],3)
        poly([(42,29),(54,29),(53,77),(48,84),(43,77)],BRASS)
        line([(29,74),(48,82),(67,74)],BRASS,3)
    elif name=='dragonfang-blade':
        poly([(57,3),(65,16),(63,27),(59,32),(64,37),(60,53),(53,64),(40,59),(42,37),(48,16)],LIGHT)
        poly([(56,8),(54,58),(43,56),(46,34)],STEEL,None)
        poly([(27,49),(38,56),(54,61),(75,57),(67,70),(49,71),(33,63)],BRASS)
        poly([(39,66),(51,71),(48,88),(38,93),(33,87)],WOOD)
        for y in [74,81]:line([(38,y),(48,y+2)],BRASS,2)
        ellipse((46,59,57,70),'#63978b',w=1)
    elif name=='dragon-scale-armor':
        poly([(9,16),(26,5),(37,21),(58,21),(68,5),(86,16),(90,36),(72,43),(69,77),(61,86),(47,94),(32,85),(26,77),(25,42),(6,36)],'#566c6f')
        poly([(12,16),(25,9),(30,27),(16,32)],BRASS)
        poly([(70,9),(84,18),(82,32),(66,26)],BRASS)
        for row,y in enumerate([31,43,55,67,79]):
            for x in ([32,47,62] if row%2==0 else [38,55]):
                poly([(x-7,y),(x,y-3),(x+7,y),(x+5,y+7),(x,y+11),(x-5,y+7)],STEEL if x<48 else '#6e8d87',w=1)
                line([(x-4,y+1),(x,y-1)],LIGHT,1)
        line([(47,24),(47,84)],BRASS,2)
    else:
        poly([(46,9),(70,21),(81,44),(73,68),(49,89),(23,69),(14,43),(24,22)],'#6e8d87')
        poly([(46,14),(46,74),(27,61),(19,43),(29,25)],LIGHT,None)
        poly([(46,14),(66,25),(75,45),(67,65),(46,80)],STEEL,None)
        line([(46,14),(46,80)],BRASS,3)
        line([(26,29),(46,47),(69,31)],'#566c6f',2)
        line([(22,48),(46,64),(74,49)],'#566c6f',2)
    im=im.crop(im.getchannel('A').getbbox());im.thumbnail((84,84),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(96,96));canvas.alpha_composite(im,((96-im.width)//2,(96-im.height)//2))
    canvas=canvas.quantize(colors=64,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).convert('RGBA')
    canvas.putalpha(canvas.getchannel('A').point(lambda a: 255 if a >= 250 else a))
    path=OUT/(name+'.webp');canvas.save(path,'WEBP',lossless=True,method=6)
    record=dict(file=path.name,source='arpg/tools/item-art-tier4.py',sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),method='original locally drawn 2D T4; Pillow 4x supersampling, fit 84px, 64-color RGBA quantization, 96px lossless WebP; no AI',sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size)
    records=[r for r in records if r['file']!=path.name];records.append(record)
(OUT/'manifest.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(dict(files=len(NAMES),newBytes=sum(r['bytes']for r in records if r['file']in [n+'.webp'for n in NAMES]),totalBytes=sum(r['bytes']for r in records))))
