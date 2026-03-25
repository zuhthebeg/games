#!/usr/bin/env python3
"""
무기 강화 게임 레벨별 아이콘 생성기
- LuminarQMix SDXL + rembg 배경제거 파이프라인
- 12종 무기 × 15강 = 180개 PNG (투명 배경)
- 출력: enhance/icons/lv/{weapon}-lv{N}.png
"""

import sys, os, json, torch
from pathlib import Path
from PIL import Image
from diffusers import StableDiffusionXLPipeline

# ===== 설정 =====
MODEL = str(Path.home() / ".cache/huggingface/hub/models--John6666--luminarqmix-v7-noobaixl-illustriousxl-anime-style-merge-model-v70-base-with-out-lora-sdxl/snapshots/0640e5837d88a339cfb3d9a9ac2715c93a54c036")
OUTPUT_DIR = Path(__file__).parent / "icons" / "lv"
PROGRESS_FILE = Path("/tmp/codex-icon-progress.txt")
IMAGE_SIZE = 512
STEPS = 25
GUIDANCE = 7.5

# ===== 무기 프롬프트 정의 =====
# 각 무기의 기본 프롬프트 + 레벨별 이펙트 수식어

WEAPON_BASE = {
    "sword": {
        "ko": "검",
        "base": "anime style fantasy broadsword, silver steel blade, golden crossguard, elegant knight sword",
        "color": "blue, silver",
    },
    "axe": {
        "ko": "도끼",
        "base": "anime style fantasy battle axe, large curved blade, brutal warrior weapon, bone ornament handle",
        "color": "red, dark iron",
    },
    "spear": {
        "ko": "창",
        "base": "anime style fantasy long spear, sharp narrow blade, white jade shaft, elegant lance",
        "color": "cyan, white",
    },
    "hammer": {
        "ko": "망치",
        "base": "anime style fantasy war hammer, massive stone head, thick metal handle, rune engraved",
        "color": "grey, yellow",
    },
    "dagger": {
        "ko": "단검",
        "base": "anime style fantasy assassin dagger, thin curved blade, serpentine design, poison drip",
        "color": "green, purple",
    },
    "staff": {
        "ko": "지팡이",
        "base": "anime style fantasy wizard staff, long rod, crystal orb on top, ancient runes carved",
        "color": "purple, gold",
    },
    "wand": {
        "ko": "완드",
        "base": "anime style fantasy magic wand, slender elegant rod, glowing crystal tip, delicate design",
        "color": "sky blue, white",
    },
    "katana": {
        "ko": "태도",
        "base": "anime style fantasy katana, long curved japanese sword, black lacquer scabbard, cherry blossom motif",
        "color": "crimson, black",
    },
    "scythe": {
        "ko": "낫",
        "base": "anime style fantasy death scythe, large curved black blade, dark gothic design, shadow aura",
        "color": "black, purple",
    },
    "bow": {
        "ko": "활",
        "base": "anime style fantasy longbow, elegant curved bow, string glowing with energy, elven design",
        "color": "brown, green",
    },
    "crossbow": {
        "ko": "석궁",
        "base": "anime style fantasy crossbow, mechanical steel crossbow, loaded bolt, precision weapon",
        "color": "grey, brown",
    },
    "knuckle": {
        "ko": "너클",
        "base": "anime style fantasy knuckle dusters, golden spiked gauntlet, martial arts weapon, dragon motif",
        "color": "gold, red",
    },
}

# 레벨별 이펙트 수식어 (1~15강)
def get_level_effect(lv: int, base_color: str) -> tuple[str, str]:
    """(positive_suffix, negative_prompt) 반환"""
    if lv <= 3:
        pos = f"clean weapon icon, simple design, minimal glow, {base_color} color theme, white background"
        neg = "heavy glow, particles, aura, runes, overexposed, complex effects"
    elif lv <= 6:
        pos = f"soft magical glow, subtle enchantment aura, {base_color} color theme, faint sparkles, white background"
        neg = "too many particles, heavy aura, runes, overblown effects"
    elif lv <= 9:
        pos = f"glowing weapon, moderate magical aura, {base_color} energy particles floating, enchanted appearance, white background"
        neg = "too dark, no glow, plain weapon"
    elif lv <= 12:
        pos = f"powerful magical weapon, intense {base_color} aura, many glowing particles, divine energy, white background"
        neg = "plain, dull, no particles"
    else:  # 13~15
        pos = f"legendary weapon, extreme {base_color} aura, rune markings glowing, explosion of magical particles, ethereal godly light, white background"
        neg = "plain, dull, no effects, realistic, no glow"
    return pos, neg


# ===== 생성 함수 =====
def load_pipe():
    print("LuminarQMix 모델 로딩...", flush=True)
    pipe = StableDiffusionXLPipeline.from_pretrained(
        MODEL, torch_dtype=torch.float16, use_safetensors=True
    ).to("cuda")
    try:
        pipe.enable_xformers_memory_efficient_attention()
    except Exception:
        pass  # xformers 없으면 스킵
    return pipe


def generate_one(pipe, weapon: str, lv: int, overwrite: bool = False) -> Path:
    out_path = OUTPUT_DIR / f"{weapon}-lv{lv}.png"
    if out_path.exists() and not overwrite:
        print(f"  SKIP (exists): {out_path.name}", flush=True)
        return out_path

    w = WEAPON_BASE[weapon]
    lv_pos, lv_neg = get_level_effect(lv, w["color"])

    prompt = (
        f"masterpiece, best quality, highly detailed, "
        f"{w['base']}, "
        f"{lv_pos}, "
        f"game asset, item icon, centered composition, no background, isolated object"
    )
    negative = (
        f"lowres, bad anatomy, worst quality, blurry, nsfw, text, watermark, "
        f"background scenery, environment, floor, shadow, multiple weapons, "
        f"{lv_neg}"
    )

    print(f"  생성: {weapon} lv{lv}  steps={STEPS}", flush=True)
    img = pipe(
        prompt=prompt,
        negative_prompt=negative,
        num_inference_steps=STEPS,
        guidance_scale=GUIDANCE,
        width=IMAGE_SIZE,
        height=IMAGE_SIZE,
    ).images[0]

    # 임시 저장 (흰 배경)
    tmp_path = OUTPUT_DIR / f"_tmp_{weapon}_{lv}.png"
    img.save(tmp_path)

    # rembg로 배경 제거
    from rembg import remove
    with open(tmp_path, "rb") as f:
        result = remove(f.read())
    with open(out_path, "wb") as f:
        f.write(result)
    tmp_path.unlink(missing_ok=True)

    print(f"  DONE: {out_path.name}", flush=True)
    return out_path


def update_progress(done: int, total: int, current: str, errors: list):
    status = f"PROGRESS: {done}/{total} | current: {current}"
    if errors:
        status += f"\nERRORS: {', '.join(errors)}"
    PROGRESS_FILE.write_text(status)
    print(status, flush=True)


# ===== 메인 =====
def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    weapons = list(WEAPON_BASE.keys())  # 12종
    levels = list(range(1, 16))          # 1~15

    total = len(weapons) * len(levels)   # 180
    done = 0
    errors = []

    # 이미 생성된 파일 카운트
    existing = sum(1 for w in weapons for lv in levels
                   if (OUTPUT_DIR / f"{w}-lv{lv}.png").exists())
    print(f"기존 파일: {existing}/{total}", flush=True)

    pipe = load_pipe()

    for weapon in weapons:
        for lv in levels:
            try:
                generate_one(pipe, weapon, lv, overwrite=False)
                done += 1
            except Exception as e:
                err = f"{weapon}-lv{lv}: {e}"
                print(f"  ERROR: {err}", flush=True)
                errors.append(err)
                done += 1

            update_progress(done, total, f"{weapon}-lv{lv}", errors)

    # 최종 상태
    final_count = sum(1 for w in weapons for lv in levels
                      if (OUTPUT_DIR / f"{w}-lv{lv}.png").exists())
    summary = f"DONE: {final_count}/{total} icons generated\nERRORS: {len(errors)}\n"
    if errors:
        summary += "\n".join(errors)
    else:
        summary += "NONE"
    PROGRESS_FILE.write_text(summary)
    print(summary, flush=True)


if __name__ == "__main__":
    main()
