"""Run using existing Windows diffusion-win Python; local cached models only."""
import os, sys, json, importlib.util, hashlib
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
import torch
spec=importlib.util.spec_from_file_location('localgen',r'C:\Users\user\ai-tools\generate-image-win.py')
gen=importlib.util.module_from_spec(spec); spec.loader.exec_module(gen)
cfg=json.loads(Path(__file__).with_name('prompts.json').read_text())
out=Path(r'C:\Users\user\ai-tools\arpg-art\skill-icons-1028'); out.mkdir(parents=True,exist_ok=True)
assert torch.cuda.is_available(), 'Windows native CUDA required'
pipe=gen.build_pipe(cfg['model'],gen.pick_cache_dir(),False)
for icon in cfg['icons']:
    if len(sys.argv)>1 and icon['id'] not in sys.argv[1:]: continue
    with torch.inference_mode():
        image=pipe(prompt=icon['prompt'],negative_prompt=cfg['negative'],width=cfg['width'],height=cfg['height'],num_inference_steps=cfg['steps'],guidance_scale=cfg['guidance'],generator=torch.Generator(device='cuda').manual_seed(icon['seed'])).images[0]
    target=out/(icon['id']+'.png'); image.save(target)
    print('SAVED',icon['id'],hashlib.sha256(target.read_bytes()).hexdigest(),flush=True)
print('COMPLETE',torch.cuda.get_device_name(0),flush=True)
