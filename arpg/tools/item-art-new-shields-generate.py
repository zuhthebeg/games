"""Windows-native offline LuminarQMix generation. No downloads or API; serial GPU."""
from pathlib import Path
import os, sys, json, hashlib, argparse
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
sys.path.insert(0,r'C:\Users\user\ai-tools')
import torch
from importlib import import_module
helper=import_module('generate-image-win')
MODEL=Path(r'C:\Users\user\.cache\huggingface\models--John6666--luminarqmix-v7-noobaixl-illustriousxl-anime-style-merge-model-v70-base-with-out-lora-sdxl\snapshots\0640e5837d88a339cfb3d9a9ac2715c93a54c036')
options=argparse.Namespace(text_pass=False)
OUT=Path(r'C:\Users\user\ai-tools\outputs\arpg-new-shields-20261020')
assert (MODEL/'model_index.json').is_file()
assert sys.platform=='win32' and torch.cuda.is_available()
OUT.mkdir(parents=True,exist_ok=True)
subjects={
'buckler':'shield, one small circular steel buckler, perfectly round metal shield, raised round central metal boss, riveted brass rim, steel surface, no wood, front view',
'kite-shield':'shield, one tall blue heraldic kite shield, elongated teardrop shield with pointed bottom and broad rounded shoulders, brass border and simple gold cross on blue enamel, front view',
'tower-shield':'shield, one large rectangular tower shield, tall broad flat rectangular wooden pavise, squared corners, iron horizontal reinforcing bands, brass border, front view',
'bone-shield':'shield, one jagged medieval bone shield, ivory human skull attached to layered curved rib bones over a dark shield backing, skull eye sockets, angular ivory bone rim, front view',
}
style=', fantasy game item illustration, detailed painted object, centered isolated on plain white background, entire object visible'
negative='human, man, woman, person, 1girl, 1boy, character, full body, upper body, torso, shoulders, arms, legs, face, eyes, hands, holding, text, lettering, logo, watermark, cropped, scenery, background scene, pedestal, glow, silhouette'

pipe=helper.build_pipe(str(MODEL),helper.pick_cache_dir(),True,img2img=not options.text_pass)
records=[]
for i,(name,subject) in enumerate(subjects.items()):
 seed=(2026101900 if options.text_pass else 2026102000)+i
 prompt=subject+style
 path=OUT/(name+'.png')
 reference=OUT/(name+'-guide.png')
 from PIL import Image
 guide=None if options.text_pass else Image.open(reference).convert('RGB').resize((768,768),Image.Resampling.LANCZOS)
 if not path.exists():
  with torch.inference_mode():
   kwargs=dict(width=768,height=768) if options.text_pass else dict(image=guide,strength=0.60)
   im=pipe(prompt=prompt,negative_prompt=negative,**kwargs,num_inference_steps=30,guidance_scale=7,generator=torch.Generator(device='cuda').manual_seed(seed)).images[0]
  im.save(path)
 record=dict(referenceWindowsPath=None if options.text_pass else str(reference),referenceSha256=None if options.text_pass else hashlib.sha256(reference.read_bytes()).hexdigest(),strength=None if options.text_pass else 0.60,id=name,prompt=prompt,negative=negative,seed=seed,steps=30,guidance=7,width=768,height=768,sourceWindowsPath=str(path),sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),sourceBytes=path.stat().st_size)
 records.append(record)
 (OUT/'generation.json').write_text(json.dumps(dict(model=str(MODEL),gpu=torch.cuda.get_device_name(),modelIndexSha256=hashlib.sha256((MODEL/'model_index.json').read_bytes()).hexdigest(),pipelineSourceSha256=hashlib.sha256(Path(helper.__file__).read_bytes()).hexdigest(),assets=records),indent=2),encoding='utf8')
 print('SAVED '+name,flush=True)
