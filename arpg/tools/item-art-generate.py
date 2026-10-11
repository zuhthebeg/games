"""Run ONLY with Windows diffusion-win Python; local SDXL, no API/model downloads.
Outputs are review sources outside the delivered game. Pack only approved images.
"""
from pathlib import Path
import sys
import json
import torch
sys.path.insert(0, r'C:\Users\user\ai-tools')
from importlib import import_module
pipeline = import_module('generate-image-win')
OUT = Path(r'C:\Users\user\ai-tools\outputs\arpg-item-art-20261011')
MODEL = Path(r'C:\Users\user\ai-tools\models\luminarqmix-v7')
assert (MODEL / 'model_index.json').is_file(), 'local model required; no download fallback'
assert torch.cuda.is_available(), 'Windows CUDA required'
OUT.mkdir(parents=True, exist_ok=True)
subjects = {
    'sword': 'one medieval straight double edged steel sword, long blade, brass crossguard, brown leather handle, diagonal composition',
    'bow': 'one medieval curved wooden longbow with a clearly visible taut bowstring, no crossbow, no arrow, diagonal composition',
    'head': 'one medieval closed steel knight helmet, brass trim, visor eye slit, no face, no military helmet',
    'body': 'one medieval brown leather torso cuirass, brass buckles, sleeveless armor vest, no head, no arms',
    'hands': 'one pair of medieval brown leather armored gauntlets, brass knuckle plates, no arms',
    'feet': 'one pair of medieval brown leather tall boots, brass buckles, no legs, no sneakers',
    'stone-low': 'one rough warm grey magical mineral crystal, small brass rune engraved on stone',
    'stone-mid': 'one faceted blue magical mineral crystal, small brass rune engraved on stone',
    'stone-high': 'one faceted amber magical mineral crystal, small brass rune engraved on stone',
    'potion': 'one round glass healing potion bottle filled with red liquid, brown cork stopper, brass collar, no label',
    'mana-potion': 'one round glass mana potion bottle filled with blue liquid, brown cork stopper, brass collar, no label',
    'scrap': 'one small pile of broken medieval steel metal fragments, brass rivets, no weapons',
    'leather': 'one folded brown animal leather hide with stitched edges, no animal, no face',
    'ore': 'one irregular grey iron ore rock with metallic facets',
    'cleaver': 'one medieval heavy steel cleaver sword, broad rectangular blade, brown leather handle, brass guard',
    'maul': 'one medieval heavy iron war hammer, blunt square head, wooden handle, brass bands, diagonal composition',
}
prompt_style = ', inventory item icon, cute low poly painted 2D fantasy game art, bold dark brown outline, warm muted brass and earthy palette, readable simple chunky shape, centered entire object, large empty margin, pure white background, flat studio light, no cast shadow, no floor, no scenery, app safe'
negative = 'text, letters, watermark, logo, character, person, hand holding object, scene, frame, border, background texture, cast shadow, cropped, blurry, photorealistic, guns, sneakers, modern clothes'
pipe = pipeline.build_pipe(str(MODEL), pipeline.pick_cache_dir(), False)
records = []
for i, (name, subject) in enumerate(subjects.items()):
    seed = 2026101100 + i
    prompt = subject + prompt_style
    if not (OUT / (name + '.png')).exists():
        with torch.inference_mode():
            image = pipe(prompt=prompt, negative_prompt=negative, width=512, height=512,
                         num_inference_steps=30, guidance_scale=7.0,
                         generator=torch.Generator(device='cuda').manual_seed(seed)).images[0]
        image.save(OUT / (name + '.png'))
    records.append(dict(name=name, prompt=prompt, negative=negative, seed=seed,
                        model=str(MODEL), width=512, height=512, steps=30, guidance=7.0))
    (OUT / 'generation.json').write_text(json.dumps(records, indent=2), encoding='utf8')
    print('SAVED ' + name, flush=True)
