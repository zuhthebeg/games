"""Deterministic local 2D illustration + reviewed reuse; NOT AI/SDXL output.
Run from any cwd with Pillow. Supersampled colour/facet drawings, 96px WebP.
No network, no edits to reused sources. Does not run the unavailable SDXL tool.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'arpg/assets/items'
OUT.mkdir(parents=True, exist_ok=True)
K = 4
SIZE = 96
INK = '#38271e'
STEEL = '#849595'
LIGHT = '#dde2cc'
BRASS = '#c19b57'
WOOD = '#885831'
records = []

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(name, im, source, method):
    # Trim redundant empty margins, never crop nontransparent source pixels.
    bbox = im.getchannel('A').getbbox()
    im = im.crop(bbox)
    im.thumbnail((84, 84), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE))
    canvas.alpha_composite(im, ((SIZE-im.width)//2, (SIZE-im.height)//2))
    path = OUT / (name + '.webp')
    canvas.save(path, 'WEBP', lossless=True, method=6)
    records.append(dict(file=path.name, source=str(source), sourceSha256=sha(source),
                        method=method, sha256=sha(path), bytes=path.stat().st_size))

def draw(name):
    im = Image.new('RGBA', (SIZE*K, SIZE*K))
    d = ImageDraw.Draw(im)
    def points(p): return [(int(x*K), int(y*K)) for x,y in p]
    def poly(p, fill, edge=INK, width=2):
        p = points(p)
        d.polygon(p, fill=fill)
        if edge: d.line(p+[p[0]], fill=edge, width=width*K, joint='curve')
    def line(p, fill, width=2): d.line(points(p), fill=fill, width=width*K, joint='curve')
    def ellipse(box, fill, edge=INK, width=2):
        d.ellipse(tuple(int(x*K) for x in box), fill=fill, outline=edge, width=width*K)
    def rect(box, fill, edge=INK, width=2):
        d.rounded_rectangle(tuple(int(x*K) for x in box), radius=2*K, fill=fill, outline=edge, width=width*K)
    tier = 3 if name.endswith('-t3') else 2 if name.endswith('-t2') else 1
    if name.startswith('sword'):
        # Long straight blade; higher hunting-tier shapes have actual wider blades.
        w = [0,0,2,4][tier]
        poly([(46-w,12),(53,4),(60+w,12),(59+w,62),(47-w,62)],STEEL)
        poly([(53,7),(53,60),(48-w,60),(48-w,14)],LIGHT,edge=None)
        poly([(53,12),(57+w,16),(56+w,57),(53,60)],'#56696b',edge=None)
        poly([(33,61),(41,58),(47,61),(59,61),(67,58),(73,61),(69,68),(36,68)],BRASS)
        rect((48,67,58,85),WOOD)
        for y in [71,76,81]:line([(49,y),(57,y-1)],'#d4a578',1)
        ellipse((46,84,61,93),BRASS)
        if tier>1:
            for y in [24,34,44]:line([(51,y-3),(56,y),(51,y+3)],'#8ab8bf',1)
        if tier==3:poly([(42,60),(53,52),(64,60),(53,66)],BRASS);ellipse((50,56,57,63),'#88bcc3',width=1)
    elif name.startswith('bow'):
        # Actual open bow with string, not a gun/crossbow. Preserve inner transparency.
        c = [WOOD,WOOD,'#755838','#4f7378'][tier]
        poly([(20,8),(29,11),(43,22),(54,37),(57,48),(53,63),(42,78),(23,88),(20,84),(36,72),(44,59),(47,48),(42,33),(33,22),(20,12)],c)
        line([(23,13),(36,24),(47,39),(49,49),(44,65),(36,75),(23,84)],'#cfad72',2)
        line([(20,10),(20,86)],'#e9d9ab',2)
        rect((44,42,55,56),BRASS)
        line([(46,46),(53,46)],'#efd79b',1)
        if tier>1:
            poly([(32,18),(40,20),(43,27),(38,28)],BRASS)
            poly([(36,70),(43,72),(38,80),(30,82)],BRASS)
        if tier==3:poly([(48,38),(59,46),(52,61),(46,54)],'#8faeb3');ellipse((48,45,55,52),'#d6e6dc',width=1)
    elif name == 'cleaver':
        poly([(28,8),(68,8),(71,57),(38,64),(28,55)],STEEL)
        poly([(29,10),(38,10),(38,58),(31,54)],LIGHT,edge=None)
        line([(43,14),(62,14),(65,47)],'#56696b',3)
        ellipse((58,18,64,24),'#38271e',width=1)
        rect((34,61,61,68),BRASS);rect((42,67,54,87),WOOD);ellipse((40,85,56,93),BRASS)
    elif name == 'maul':
        poly([(43,28),(56,28),(60,88),(48,92)],WOOD)
        for y in [66,74,82]:line([(47,y),(58,y-2)],BRASS,3)
        poly([(16,12),(34,8),(73,11),(83,22),(77,43),(26,41),(15,31)],STEEL)
        poly([(19,13),(34,11),(71,14),(78,21),(27,22)],LIGHT,edge=None)
        poly([(27,22),(78,21),(74,38),(28,36)],'#5b7072',edge=None)
        rect((37,10,50,40),BRASS);line([(40,14),(40,34)],'#f1d6a3',2)
    elif name == 'head-light':
        poly([(16,78),(13,43),(23,19),(48,8),(73,20),(83,45),(79,80),(60,87),(34,87)],WOOD)
        poly([(28,71),(26,42),(37,28),(59,28),(70,43),(66,71),(54,78),(42,78)],'#281e18')
        line([(25,72),(22,43),(35,24),(48,19),(64,26),(74,45),(72,73)],'#c3965c',4)
        line([(19,77),(34,84)],BRASS,2)
    elif name == 'head':
        poly([(18,71),(16,39),(24,20),(47,10),(69,20),(78,38),(77,71),(59,84),(36,84)],STEEL)
        poly([(20,37),(27,24),(45,15),(45,39)],LIGHT,edge=None)
        poly([(48,15),(67,25),(73,37),(50,37)],'#a5b0a7',edge=None)
        poly([(19,42),(76,42),(71,68),(49,79),(24,68)],'#657a7c')
        rect((24,45,68,53),INK);line([(47,15),(47,42)],BRASS,4)
        poly([(44,44),(52,44),(54,74),(48,79),(42,74)],BRASS)
        for x in [30,36,60,66]:line([(x,61),(x,68)],INK,2)
        line([(24,71),(37,79)],LIGHT,2)
    elif name in ['body','body-cloth','body-plate']:
        material = {'body':WOOD,'body-cloth':'#aaa38a','body-plate':STEEL}[name]
        facet = {'body':'#b47f4a','body-cloth':'#d5cdb2','body-plate':LIGHT}[name]
        shadow = {'body':'#654632','body-cloth':'#777463','body-plate':'#566c6f'}[name]
        poly([(15,18),(32,11),(42,22),(54,22),(66,11),(81,18),(75,43),(65,42),(68,82),(50,89),(28,82),(31,42),(21,43)],material)
        poly([(19,22),(29,18),(27,38),(22,38)],'#be9160',edge=None)
        poly([(67,18),(76,22),(72,37),(67,38)],'#be9160',edge=None)
        poly([(34,30),(47,34),(46,75),(33,72)],facet,edge=None)
        poly([(50,33),(61,30),(63,72),(51,77)],shadow,edge=None)
        rect((28,57,67,66),'#4e3830');rect((43,56,55,67),BRASS);rect((47,59,51,64),'#4e3830',edge=None)
        line([(34,27),(46,31),(61,27)],BRASS,2)
        for x,y in [(34,38),(61,38),(33,73),(63,73)]:ellipse((x-2,y-2,x+2,y+2),BRASS,width=1)
    elif name in ['hands','hands-heavy']:
        for dx,dy in [(0,0),(39,7)]:
            poly([(9+dx,64+dy),(10+dx,38+dy),(14+dx,16+dy),(19+dx,15+dy),(23+dx,30+dy),(24+dx,10+dy),(30+dx,10+dy),(33+dx,33+dy),(39+dx,25+dy),(44+dx,28+dy),(43+dx,47+dy),(36+dx,66+dy)],WOOD)
            poly([(13+dx,36+dy),(33+dx,35+dy),(37+dx,43+dy),(31+dx,52+dy),(14+dx,51+dy)],STEEL if name=='hands-heavy' else '#bb8e59')
            line([(16+dx,39+dy),(30+dx,38+dy)],LIGHT,2)
            rect((9+dx,60+dy,36+dx,80+dy),'#684431');rect((9+dx,64+dy,36+dx,70+dy),BRASS)
    elif name in ['feet','feet-heavy']:
        for dx,dy in [(0,0),(39,5)]:
            poly([(14+dx,12+dy),(36+dx,12+dy),(35+dx,54+dy),(43+dx,67+dy),(42+dx,79+dy),(4+dx,79+dy),(4+dx,67+dy),(14+dx,58+dy)],STEEL if name=='feet-heavy' else WOOD)
            poly([(18+dx,20+dy),(24+dx,20+dy),(22+dx,56+dy),(12+dx,68+dy),(8+dx,68+dy),(18+dx,56+dy)],'#bc8d5a',edge=None)
            rect((13+dx,13+dy,37+dx,23+dy),'#5d4231');rect((13+dx,35+dy,36+dx,42+dy),'#503a2b');rect((25+dx,33+dy,33+dx,44+dy),BRASS)
            line([(6+dx,75+dy),(41+dx,75+dy)],INK,4)
    elif name.startswith('stone-') or name == 'ore':
        colors = {'stone-low':('#909c88','#d6d7bc','#626f65'), 'stone-mid':('#638eab','#b6d9de','#3d6179'), 'stone-high':('#ca994d','#f2d798','#8a6234'), 'ore':('#899391','#c8cec3','#526563')}
        base,light,dark=colors[name]
        poly([(24,17),(53,8),(77,31),(82,61),(60,84),(25,80),(12,54)],base)
        poly([(24,18),(52,11),(47,42),(15,54)],light,edge=None)
        poly([(52,11),(75,32),(47,42)],base,edge=None)
        poly([(47,42),(78,61),(59,81),(48,66)],dark,edge=None)
        line([(24,19),(47,42),(76,33)],INK,2);line([(47,42),(48,66),(25,78)],INK,2)
        if name != 'ore':
            n={'stone-low':1,'stone-mid':2,'stone-high':3}[name]
            for i in range(n):line([(31+i*8,47),(31+i*8,62)],'#ead8a5',3)
        else:
            for x,y in [(26,37),(60,30),(59,67)]:poly([(x,y),(x+6,y-3),(x+9,y+3),(x+2,y+6)],'#b3bdba',width=1)
    elif name in ['potion','mana-potion']:
        liquid = '#ac5147' if name == 'potion' else '#528aab'
        poly([(38,21),(57,21),(57,34),(69,46),(73,65),(65,82),(32,82),(23,65),(28,46),(38,34)],'#b6c5b5')
        poly([(28,55),(67,55),(68,66),(61,78),(36,78),(28,66)],liquid,width=1)
        poly([(31,46),(37,42),(32,57),(34,66),(31,69),(27,58)],'#eef0d8',edge=None)
        rect((36,19,59,29),BRASS);rect((40,10,55,21),WOOD)
        line([(43,13),(51,13)],'#c99c62',2);line([(34,81),(63,81)],LIGHT,2)
    elif name == 'scrap':
        poly([(12,47),(34,20),(50,27),(46,43),(25,61)],STEEL)
        poly([(36,62),(64,51),(80,58),(67,83),(47,83)],'#667777')
        poly([(52,13),(77,19),(83,44),(66,39),(58,28)],'#a6af9f')
        line([(16,45),(35,25),(45,29)],LIGHT,2);line([(44,65),(63,57)],LIGHT,2)
        for x,y in [(42,36),(68,29),(55,72)]:ellipse((x-3,y-3,x+3,y+3),BRASS,width=1)
    elif name == 'leather':
        poly([(20,10),(42,19),(70,13),(83,30),(74,48),(81,77),(54,83),(33,76),(14,85),(8,61),(18,38)],WOOD)
        poly([(24,17),(43,25),(67,21),(74,32),(62,42),(67,68),(49,74),(34,65),(21,71),(18,56),(25,35)],'#b98755',edge=None)
        for x,y in [(23,28),(22,44),(20,60),(33,68),(51,75),(68,65),(69,49),(67,29)]:line([(x,y),(x+3,y+2)],'#edc590',2)
    elif name == 'web':
        for a,b in [((48,9),(48,87)),((10,48),(86,48)),((20,20),(76,76)),((20,76),(76,20))]:line([a,b],'#c1c6b4',3)
        for radius in [16,29]:
            p=[(48,48-radius),(48+radius*.7,48-radius*.7),(48+radius,48),(48+radius*.7,48+radius*.7),(48,48+radius),(48-radius*.7,48+radius*.7),(48-radius,48),(48-radius*.7,48-radius*.7),(48,48-radius)]
            line(p,INK,5);line(p,'#dce0cd',3)
    else: raise ValueError(name)
    return im

for name in ['sword','sword-t2','sword-t3','bow','bow-t2','bow-t3','cleaver','maul','head','head-light','body','body-cloth','body-plate','hands','hands-heavy','feet','feet-heavy','stone-low','stone-mid','stone-high','potion','mana-potion','scrap','leather','ore','web']:
    save(name, draw(name), Path(__file__), 'original locally drawn 2D; Pillow 4x supersampling, fit 84px, 96px lossless WebP; no AI')

# Reviewed forms: the short crystal stick is a wand; long crystal staffs provide
# distinct hunt-tier shapes, not fake extra rarity/affix/enhancement tiers.
for name, file in [('wand','weapon_staff.webp'),('staff-t2','weapon_staff_t3.webp'),('staff-t3','weapon_staff_t4.webp'),('fang','item_vampire_fang.webp'),('scroll','item_wisdom_scroll.webp')]:
    source = ROOT / 'spudsquad/assets' / file
    save(name, Image.open(source).convert('RGBA'), source,
         'reviewed existing spudsquad art; alpha crop, Lanczos fit 84px, 96px lossless WebP')

(OUT / 'manifest.json').write_text(json.dumps(records, indent=2)+'\n')
print(json.dumps(dict(original2D=len(records)-5, reused=5, files=len(records), encodedBytes=sum(r['bytes'] for r in records))))
