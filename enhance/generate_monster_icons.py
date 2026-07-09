#!/usr/bin/env python3
"""
무기 강화 게임 잡몹 아이콘 생성기 (티어1~3 — game-icons.net CDN 인증서 만료로 대체)
- LuminarQMix SDXL + rembg 배경제거 (generate_weapon_icons.py와 동일 파이프라인)
- 35종 × 1장, 512px, 투명 배경 PNG
- 출력: enhance/img/monsters/mobs/{key}.png
- 실행: /mnt/c/Users/user/ai-tools/diffusion-env/bin/python3 generate_monster_icons.py
"""

import torch
from pathlib import Path
from diffusers import StableDiffusionXLPipeline

MODEL = str(Path.home() / ".cache/huggingface/hub/models--John6666--luminarqmix-v7-noobaixl-illustriousxl-anime-style-merge-model-v70-base-with-out-lora-sdxl/snapshots/0640e5837d88a339cfb3d9a9ac2715c93a54c036")
OUTPUT_DIR = Path(__file__).parent / "img" / "monsters" / "mobs"
PROGRESS_FILE = Path("/tmp/monster-icon-progress.txt")
IMAGE_SIZE = 512
STEPS = 25
GUIDANCE = 7.5

# 티어1: 귀엽고 단순 / 티어2: 위협적 / 티어3: 강력·정예
MONSTERS = {
    # tier 1
    "slime":         "cute green slime monster, gelatinous blob creature, glossy translucent body, simple fantasy mob",
    "bat":           "small purple cave bat monster, spread wings, tiny fangs, glowing eyes, fantasy mob",
    "worm":          "giant pink earthworm monster, segmented fleshy body, round toothy mouth, fantasy mob",
    "rat":           "aggressive giant grey rat monster, red eyes, sharp teeth, scruffy fur, fantasy mob",
    "spider":        "small black venomous spider monster, eight legs, multiple red eyes, fantasy mob",
    "skeleton":      "skeleton warrior monster, old bones, broken rusty sword, tattered armor, undead fantasy mob",
    "mushroom":      "poisonous mushroom monster, purple spotted cap, angry face on stem, spores floating, fantasy mob",
    "wisp":          "ghostly will-o-wisp monster, floating blue flame spirit, ethereal glow, fantasy mob",
    "imp":           "small red imp demon monster, tiny horns, pointed tail, mischievous grin, fantasy mob",
    # tier 2
    "wolf":          "fierce dire wolf monster, dark grey fur, glowing yellow eyes, bared fangs, fantasy mob",
    "spectre":       "ghostly spectre monster, translucent floating wraith, tattered shroud, hollow glowing eyes, fantasy mob",
    "goblin":        "green goblin warrior monster, pointed ears, crude dagger, leather rags, sneering face, fantasy mob",
    "zombie":        "rotting zombie monster, torn clothes, outstretched arms, decaying green skin, undead fantasy mob",
    "harpy":         "harpy monster, woman with feathered wings and talons, wild hair, screeching, fantasy mob",
    "elemental_fire":"fire elemental monster, humanoid living flame, burning magma core, blazing aura, fantasy mob",
    "elemental_ice": "ice elemental monster, humanoid living crystal ice, frozen shards, cold mist aura, fantasy mob",
    "bandit":        "hooded bandit rogue, dark cloak, curved blade, masked face, menacing pose, fantasy mob",
    "lizardman":     "lizardman warrior monster, green scales, spear and shield, reptilian head, fantasy mob",
    # tier 3
    "beast":         "monstrous magical beast, dark fur, glowing runes on body, huge claws and fangs, fantasy mob",
    "minotaur":      "minotaur monster, bull head warrior, massive muscles, giant battle axe, fantasy mob",
    "ghoul":         "ghoul monster, hunched pale flesh eater, long claws, gaping jaw, undead fantasy mob",
    "orc":           "orc warrior monster, green skin, tusks, heavy iron armor, war axe, fantasy mob",
    "vampire":       "vampire noble monster, pale skin, red eyes, black cape, elegant sinister pose, fantasy mob",
    "golem":         "rock golem monster, massive stone body, glowing core, moss covered boulders, fantasy mob",
    "wyvern":        "wyvern monster, dragon-like beast with two wings, spiked tail, green scales, fantasy mob",
    "dark_knight":   "dark knight monster, black full plate armor, glowing red visor, cursed greatsword, fantasy mob",
    "succubus":      "succubus demon monster, bat wings, small horns, dark elegant dress, seductive smirk, fantasy mob",
    "troll":         "cave troll monster, huge hunched body, mottled skin, wooden club, dumb ferocious face, fantasy mob",
    "gargoyle":      "gargoyle monster, stone winged demon statue come alive, crouching pose, fantasy mob",
    "chimera":       "chimera monster, lion body with goat head and snake tail, three heads, fantasy mob",
    "wraith":        "wraith monster, dark hooded spirit, skeletal hands, floating tattered robes, undead fantasy mob",
    "ogre":          "ogre monster, giant fat brute, spiked club, tiny angry eyes, fantasy mob",
    "cerberus":      "cerberus monster, three headed hellhound, black fur, fire breath, glowing red eyes, fantasy mob",
    "medusa":        "medusa monster, snake hair gorgon woman, serpent lower body, stone gaze, fantasy mob",
    "giant_spider":  "giant spider monster, huge hairy black widow, glowing purple markings, dripping venom, fantasy mob",
}

NEGATIVE = ("lowres, bad anatomy, worst quality, blurry, nsfw, text, watermark, "
            "background scenery, environment, floor, shadow, multiple creatures, "
            "human photo, realistic photo")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print("LuminarQMix 모델 로딩...", flush=True)
    pipe = StableDiffusionXLPipeline.from_pretrained(
        MODEL, torch_dtype=torch.float16, use_safetensors=True
    ).to("cuda")
    try:
        pipe.enable_xformers_memory_efficient_attention()
    except Exception:
        pass

    from rembg import remove
    total = len(MONSTERS)
    errors = []
    for i, (key, desc) in enumerate(MONSTERS.items(), 1):
        out = OUTPUT_DIR / f"{key}.png"
        if out.exists():
            print(f"[{i}/{total}] SKIP {key}", flush=True)
            continue
        prompt = (f"masterpiece, best quality, highly detailed, anime style fantasy monster, "
                  f"{desc}, game asset, monster icon, full body, centered composition, "
                  f"white background, isolated character")
        try:
            img = pipe(prompt=prompt, negative_prompt=NEGATIVE,
                       num_inference_steps=STEPS, guidance_scale=GUIDANCE,
                       width=IMAGE_SIZE, height=IMAGE_SIZE).images[0]
            tmp = OUTPUT_DIR / f"_tmp_{key}.png"
            img.save(tmp)
            with open(tmp, "rb") as f:
                result = remove(f.read())
            out.write_bytes(result)
            tmp.unlink()
            print(f"[{i}/{total}] OK {key}", flush=True)
        except Exception as e:
            errors.append(f"{key}: {e}")
            print(f"[{i}/{total}] ERROR {key}: {e}", flush=True)
        PROGRESS_FILE.write_text(f"{i}/{total} last={key} errors={len(errors)}\n" + "\n".join(errors))

    done = sum(1 for k in MONSTERS if (OUTPUT_DIR / f"{k}.png").exists())
    summary = f"DONE: {done}/{total}\nERRORS: {len(errors)}\n" + ("\n".join(errors) or "NONE")
    PROGRESS_FILE.write_text(summary)
    print(summary, flush=True)


if __name__ == "__main__":
    main()
