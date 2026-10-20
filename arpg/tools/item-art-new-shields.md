# Four shield families

Web-game inventory art, 256px WebP, charcoal matte. Four Windows-native offline LuminarQMix SDXL img2img sources (768px, 30 requested / 18 effective steps, strength .60, CFG7). Fixed seeds, explicit silhouette guides; no installs, downloads or paid API. Reviewed at 180px and actual 44/64px: round metal boss, blue/gold teardrop heraldry, reinforced rectangular wood, ivory skull/rib shield. No characters or UI text. This is deliberately restrained icon-led art, not rarity decoration.

Reproduce with the existing Windows `diffusion-win` environment:

1. `python3 arpg/tools/item-art-new-shields-guides.py` writes deterministic guide PNGs to `C:\Users\user\ai-tools\outputs\arpg-new-shields-20261020`.
2. Run `arpg/tools/item-art-new-shields-generate.py` using the Windows native Python executable (not WSL diffusion). Existing raw PNGs are never overwritten. Cached model revision and helper/index hashes are captured by `generation.json`.
3. Directly review all raw outputs, then `python3 arpg/tools/item-art-new-shields-pack.py`. White boundary-only matte, slight edge erosion/feather, charcoal composite, Lanczos downscale; never paint replacement model pixels. `assets/items/new-shields-manifest.json` binds raw sources, guides, prompts, seeds, helper/model index and delivered hashes.
4. `node arpg/tools/new-shields-preview.mjs` locally renders 480 shield/kit/animation/facing combinations and checks all frame sockets. Only local offscreen captures; never production runtime injection.

| Base | Hunt tier | Base grade | AC | kg | Frontal damage blocked | Tradeoff |
|---|---:|---|---:|---:|---:|---|
| round_shield (unchanged) | 1 | common | 0 | 4 | 70% | — |
| buckler | 1 | common | 0 | 2 | 55% | movement +3%, attack-speed bonus +.02 |
| kite_shield | 2 | fine | 2 | 5 | 72% | balanced |
| tower_shield | 3 | fine | 5 | 10 | 80% | movement −8% |
| bone_shield | 3 | fine | 3 | 5 | 73% | incoming undead damage −8% |

All have common/fine/rare/epic variants, ordinary affixes and cap20 enhancement. Authored AC follows existing rarity-power ratios; offhand enchantment remains weight-only (no passive enchant AC). Frontal guard is still 120°, timing-block/bash unchanged. Bone shield has no five-part-bone-set flag or bonus and no extra lineage lock. One-/two-hand exclusion is unchanged. No new level gates.

Recipes pay existing scrap/wood/hide/bone/rune/frost materials and 30/95/160/160G base gold, rarity-scaled through the shared economy. Merchant retains the stable original round offer and adds one independently rotating common/fine shield offer with existing midpoint affix caps; sale/refund limits remain shared. Hunt slot chances/counts, rarity/enhancement rolls and every gold/material/stone stream are unchanged. T2 receives kite, T3/T4 offhands receive tower/bone, T1 receives round/buckler. Only the selected offhand identity and its tier-based affixes/UID change.

`shieldModel:{v:1,type}` is optional on snapshots; old packets default to the legacy wood/gold shield. New/unknown versions/types are rejected. Host rebuilds equipped identity from a validated character save; bare legacy profiles cannot claim new shield capabilities. Guests receive model identity and render it, never apply block/ward/damage logic.

Verification: `node --test arpg/test/new-shields.test.js`, `node arpg/test/new-shields.native.mjs`, `node arpg/test/new-shields-relay.native.mjs` (actual deployed relay). Native scripts accept `ARPG_BASE_URL=https://game.cocy.io` and separate evidence path variables, seed only isolated synthetic preboot saves, and use native PC/touch input with read-only observers. No live saves, runtime-world writes or production screenshots.
