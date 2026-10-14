# Untitled ART PIPELINE SPIKE — asset ledger
Verified 2026-10-10. All baked images are local copies, never runtime-hotlinked.

## KayKit Adventurers Character Pack 1.0
- Author: **Kay Lousberg** (https://kaylousberg.com).
- Official page: https://kaylousberg.itch.io/kaykit-adventurers (HTTP 429 during this run; did not retry rapidly).
- Author's asset repository: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
- Download: https://codeload.github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/zip/refs/heads/main
- License: **Creative Commons Zero / CC0 1.0**, personal, educational and **commercial** use explicitly allowed, attribution optional.
- License evidence: `source/KayKit-Character-Pack-Adventures-1.0-main/addons/kaykit_character_pack_adventures/LICENSE.txt`, also checked repository root LICENSE via raw.githubusercontent.com.
- Used: `Characters/gltf/Knight.glb` (embedded rig, textures and source animations). Bow/staff are original procedural meshes from `pipeline/bake.py`.
- Visible mesh subset: Knight body/head/arms/legs/helmet/cape. Embedded `1H_Sword` scaled to 110% for mobile readability. Other swords/shields/helper geometry removed from bake scene.
- Clips used: Idle, Running_A, 1H_Melee_Attack_Slice_Horizontal, 2H_Ranged_Shoot, Spellcast_Shoot, Dodge_Forward, Hit_A, Death_A.
- SAME Knight base, skeleton and materials for all three jobs; no separate Mage/Rogue body substitutions.

## KayKit Skeletons Character Pack 1.0
- Author: **Kay Lousberg**.
- Official repository: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0
- Download: https://codeload.github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/zip/refs/heads/main
- License: **CC0 1.0**, commercial use allowed, optional attribution.
- License evidence: `source/KayKit-Character-Pack-Skeletons-1.0-main/addons/kaykit_character_pack_skeletons/LICENSE.txt`.
- Original viewer sample: `Characters/gltf/Skeleton_Minion.glb` with embedded textures/rig/clips (Idle, Running_A, Unarmed_Melee_Attack_Punch_A, Hit_A, Death_A). U1 game kits below are separate fresh bakes; existing sample bytes are preserved.
- Existing pipeline moves neutral-job base materials 30% toward light neutral for multiplicative Pixi Sprite.tint. Facial contrast retained. U1 uses a white neutral multiplier, preserving the resulting KayKit source-color distinctions without an extra runtime recolor. No noncommercial material used.

## Original procedural bow / viewer ground / blob shadow
- Author: this spike, generated specifically for cocy/Untitled (2026-10-10).
- License: **CC0 1.0** dedication of the original procedural geometry/art, https://creativecommons.org/publicdomain/zero/1.0/ .
- Files: bow and bowstring created by `pipeline/bake.py`; ground and independent blob shadow drawn by `arpg/art-viewer/viewer.js`.
- Bow clip is KayKit generic `2H_Ranged_Shoot`, NOT a dedicated bow-draw clip; requires animation polish. No unverified external bow asset.

## Quaternius Goblin — supplied and byte-verified (2026-10-10)
- Author: **Quaternius**, author profile https://poly.pizza/u/Quaternius .
- Exact model page: **https://poly.pizza/m/OdCOFSmEhl** (`Goblin`, published Aug 27, 2023).
- Actual pack: **Cube World Kit**, https://poly.pizza/bundle/Cube-World-Kit-DwDr8493Fw . This is NOT the Ultimate Monsters bundle. Its blocky Goblin mesh, EnemyArmature rig and animation names match the imported source.
- Exact download URL observed in the model page's viewer network log: **https://static.poly.pizza/54e0fd61-6898-4b17-b039-8fa656d02954.glb.br** . The HTTP response is decoded glTF binary (`glTF` magic), despite the `.br` filename. No authentication is needed.
- Download path: `C:\Users\user\ai-tools\arpg-art\source\Quaternius-Goblin.glb`. Independently fetched verification copy: `source/Goblin-poly-download.glb.br`.
- **215,420 bytes; SHA-256 `189c34c4ae369d0e722f5555fc214fd6a3757f4babc71b864c3a5d686d3cae14`**. The fresh public download matches the already imported GLB byte-for-byte.
- Individual model page's original license text: **“Aug 27, 2023 • FBX/GLTF format • Public Domain (CC0)”**, linked to https://creativecommons.org/publicdomain/zero/1.0/ . HTML saved as `source/poly-goblin-cc0.html`; pack page saved as `source/poly-cube-world-cc0.html`. Evidence sizes/digests/download proof are in `source/goblin-license-evidence.json`.
- CC0 deed original permission: **“You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission.”** Saved as `source/cc0-1.0-deed.html`.
- Important: Quaternius's generic `/license.html` currently describes QAL v1.0 (2026-08-28), NOT CC0. We do not use that generic license or an unrelated pack to infer this model's license. This exact author model listing explicitly publishes the exact downloaded asset as CC0. Current generic page is archived as `source/quaternius-current-license.html` for transparent review.
- Delivered variants: `goblin-grunt` (original procedural sword), `goblin-archer` (original procedural longbow), `goblin-chief` (sword + raised eight-point crown, coral-red runtime tint, **1.3×** visual scale). Original procedural accessories are dedicated to CC0; source Goblin remains credited to Quaternius.
- Used source clips: `Idle`, `Run`, `Attack`, `HitRecieve`, `Death` (full imported EnemyArmature action names recorded in config).
- **Boar is NOT supplied.** `iron_boar` keeps the existing procedural boar silhouette and original collision/telegraph behavior. The CC0 Skeleton Minion is only an art-viewer sample, not mapped to boar in game.

## Existing viewer dependency (not downloaded/modified)
- PixiJS v8.22.0, MIT. Relative import of `arpg/vendor/pixi-8.22.0.min.mjs`; included `PIXI-LICENSE.txt` remains untouched.

## Combat SFX — local generation (2026-10-10)
- **Locally generated with MOSS-SoundEffect v2**, `/home/cocy/ai-local/moss-sfx-out/gen.py` and local model `moss-soundeffect-v2`, not sampled/downloaded third-party audio: `arpg/assets/audio/{swing,hit,critical,dodge,hurt,kill,level-up}.ogg` (mono 48kHz, 0.24–1.15s, **50,613 bytes total**). Prompts, seeds, generation settings, source WAV SHA-256 and trim offsets: `assets/audio/generation.json`; trimming/compression: `tools/trim-sfx.py`. `critical` is used for actual `exposed` weak-point hits; this spike has no critical-roll mechanic and none was added.

## U3 Wolf — exact individual CC0 source (2026-10-12)
- Author: **Quaternius**. Individual model **https://poly.pizza/m/P1gU3Qkr9r**, not a generic creator license. Exact text: “Sep 7, 2021 • FBX/GLTF format • Public Domain (CC0)”, linked directly to https://creativecommons.org/publicdomain/zero/1.0/ .
- Download observed in that model viewer's network log: https://static.poly.pizza/f1d12388-e39b-4157-b32a-646a1d089fc4.glb.br . Response is decoded glTF 2 binary despite the `.br` suffix; no authentication or paid service.
- Offline archive: `C:/Users/user/ai-tools/arpg-art/u3-wolf/source/Quaternius-Wolf.glb` and `poly-wolf-cc0.html`. Raw PNGs, modified blend and contact sheet stay outside the game checkout. No runtime hotlinks.
- GLB: **986,712 bytes**, SHA-256 `16ac96339d06f7def9af20d5d9b27622d61e53580dab43970c9edb1bffbe8f84`. Individual page snapshot: 111,470 bytes, SHA-256 `78729d0ee2364032e23b82eaaafe2469c62d5224d9b2f6de751aa6d5439e8d6c`. Machine-readable evidence: `tools/art/u3-wolf/license-evidence.json`.
- Source mesh **Wolf**, AnimalArmature rig: `Idle`, `Gallop`, `Attack`, `Idle_HitReact_Left`, `Death` → existing display states idle/run/attack/hit/death. Attack follows existing host-act elapsed time; full hit/death clips fit 0.15s/0.6s presentation windows, without new combat timing or changing the shared 0.7s death fade. Same 40° orthographic camera, warm key/cool rim, Standard view and ink outline as approved hero/goblin pipeline; neutral albedo receives the existing wolf/elite runtime palette.
- Delivery: `assets/sprites/wolf/atlas-{0,1,2}.webp` + Pixi metadata, **576 frames, 8 directions × 5 actions, 561,040 bytes**. Metadata anchor is constant; atlasScale continues to use unchanged entity sizeScale. Other manifest entries are preserved. Boar/spider remain procedural.
- Independent Blender proof: all five clips deform the actual skinned Wolf mesh; head-minus-tail direction matches every screen-space octant. Delivered verification binds all 576 lossless alpha masks to source PNGs, checks clipping, eight unique directions, nonstatic clips and idle anchor drift.
- Quadruped verifier uses ≥512 opaque pixels and ≥16px bbox extent (long low body foreshortens end-on); humanoid 5% coverage + arm/T-pose gates are unchanged. Measured wolf coverage **3.552–8.508%**, max idle drift **2.062px**, no clipped frames. Humanoid T-pose/bind counters are N/A for the wolf, not asserted as zero.

## U3 Poison Spider — exact individual CC0 source (2026-10-12)
- Author: **Quaternius**. Individual model **https://poly.pizza/m/yRYJiAJyiM** explicitly lists “Aug 19, 2021 • FBX/GLTF format • Public Domain (CC0)” with https://creativecommons.org/publicdomain/zero/1.0/ . No inference from the creator's current generic QAL license.
- Actual viewer network download: https://static.poly.pizza/4259fbdb-afb5-4d40-9108-363625dd6b6e.glb.br . Public decoded glTF binary, no authentication/payment. Original **449,008 bytes**, SHA-256 `d759e35f6cf5adc7eb7e3f70135cd2a808787fc36337a523015592ba840ccd6d`.
- Individual page raw HTML: **111,160 bytes**, SHA-256 `3d289e95623224c0b1813dd3ac5f0cccb81cd253e936e85c3c5f22011888ac2d`. Full HTML, original GLB, modified blend and PNGs archived under `C:/Users/user/ai-tools/arpg-art/u3-spider/source` / `frames-v2`. Machine-readable provenance: `tools/art/u3-spider/license-evidence.json`. No runtime hotlinks.
- Original SpiderArmature/Cube source clips: `SpiderArmature|Spider_Idle`, `SpiderArmature|Spider_Walk`, `SpiderArmature|Spider_Attack`, `SpiderArmature|Spider_Death`. Source Jump is unused, never mislabeled as a hit. **Original rig has no authored hit reaction**: `U3_Spider_Recoil` is a separately locally authored 0/2/5/8-frame pose blend on Body/Head/Abdomen/front legs; exact angles and strength curve in config/bake. This original recoil contribution is dedicated to **CC0 1.0** by cocy/Untitled's local pipeline, while the original Quaternius model retains its provenance. No new simulation ability.
- Existing approved 40° orthographic camera, warm key/cool rim, Standard transform and ink hull; neutral material receives unchanged poison-spider/elite palette. Map only `poison_spider` to `poison-spider`. Idle/walk/attack/recoil/death: **42/9/8/4/11 frames ×8 directions =592**, **918,346 bytes** including Pixi JSON; sheets 2048×2048, 2048×2048, 2048×768. Full hit/death presentation fits .15s/.6s without changing host attack or shared .7s fade.
- Independent reopened-blend proof: all five clips deform actual skin; Head-minus-Abdomen direction dot >.9999 for every octant; all eight walk legs articulate (.424–1.056 radians). Delivery proof binds all **592** lossless alpha masks to raw PNGs; **0 clipped frames**, 8 distinct direction hashes per state, max idle drift **2px**, opaque area **4.266–7.068%**.
- New `arachnid` gates require >=640 opaque pixels, >=32px bbox extent, independent skinned/leg/direction proof. Humanoid >=5% coverage, arm/T-pose/bind gates and wolf quadruped gates remain unchanged; unknown profiles rejected. Nonhuman T-pose/bind counters N/A, not zero. Numerical/native verification is not human visual approval or physical-device proof.
- Existing wolf and every other sprite file/manifest descriptor preserved byte-for-byte from `b7f5e6c`; iron boar remains its distinct procedural visual.


## U3 Iron Boar — exact individual CC0 Pig rig (2026-10-12)
- Author: **Quaternius**. Individual model **https://poly.pizza/m/u35l6uP5vj** explicitly lists “Nov 15, 2023 • FBX/GLTF format • Public Domain (CC0)” linked to https://creativecommons.org/publicdomain/zero/1.0/ . Generic current QAL license is not used as evidence.
- Actual public viewer request: https://static.poly.pizza/6277c120-ea5c-405d-9614-0d3d7e0b829d.glb.br . Decoded glTF binary: **300,940 bytes**, SHA-256 `39a6187a43130b6d758090294ff4292c06a113df6b03243e124644eb8c71aee4`.
- Full original HTML: **111,251 bytes**, SHA-256 `5240554fe1e02041817055e006805388708b1878d14b520d45a4b1d6e2d9d724`. Original GLB/full HTML/modified blend/raw PNGs/contact sheet archived offline under `C:/Users/user/ai-tools/arpg-art/u3-boar/source` / `frames-v2`; machine-readable evidence `tools/art/u3-boar/license-evidence.json`. No runtime hotlinks or paid API.
- Actual **Pig** skin / AnimalArmature; source full names `AnimalArmature|AnimalArmature|AnimalArmature|Idle`, `...|Run`, `...|Headbutt`, `...|Death`. Idle uses source range **0–80 of 0–160** (one look-and-return cycle) to keep end-on idle centroid drift below the unchanged 6px gate; other source clips are not renamed/shortened. Original GLB bytes remain untouched.
- Source has **no hit reaction**. `U3_Boar_Recoil` is a local authored rig action (0/2/5/8 frames, strength 0/1/.5/0, exact Body/Neck/Head/front-leg angles in config), retained with fake-user and validated by independently reopening the blend. Jump is unused, never claimed as hit. Three original faceted iron shell plates attach to Body and two curved tusks to Head. These original geometry/recoil contributions are dedicated to **CC0 1.0** by cocy/Untitled's local pipeline; original Pig retains Quaternius provenance.
- Same approved 40° orthographic camera, warm key/cool rim, Standard color and ink hull. Existing boar/elite tint, sizeScale, health indicators, hit flash, lazy loading/fallback and host attack selection are unchanged. Map only `iron_boar` → `iron-boar`; no Skeleton substitution.
- Delivery: **488 frames** (34/7/7/4/9 ×8 for idle/run/attack/hit/death), **453,624 bytes** including Pixi metadata, two WebP sheets **2048×1920 / 2048×2048**. Alpha coverage **5.560–10.596%**, max idle centroid drift **4.743px**, **0 clipping**, 8 unique directions per state. All 488 lossless alpha masks match source PNGs. Full hit/death in .15s/.6s, unchanged shared .7s fade and simulation timing.
- Independent reopened source proof: five actual moving skinned clips; four run-leg rotations **1.654–2.401 radians**; anatomical direction dot **>.9999** all octants; five accessories retain actual bone parents and move **.386–.435 world units** in attack/run. Boar-specific independent proof uses unchanged quadruped pixel floors (512px/16px); existing humanoid/ wolf/spider gates are not weakened; nonhuman T-pose/bind counters N/A, not zero. Numerical/native evidence is not human visual approval or physical-device proof.
- All prior **9 kits** and their original manifest descriptors remain byte-identical to **f3a6100** (`tools/art/u3-boar/preservation-validation.json`). Historical earlier “boar remains procedural” entries describe pre-U3 state, not the current registry.


## ART-W Wood — original local 2D item art (2026-10-12)
- Author: cocy/Untitled local item pipeline. Original contribution dedicated to **CC0 1.0**, https://creativecommons.org/publicdomain/zero/1.0/ . No third-party source or inferred external license.
- Source: `assets/items/wood-art.py`; authored timber polygons, bark facets and growth rings using the existing item-art Pillow 4× method/palette, 84px fit, 64-color RGBA quantization and lossless WebP. No AI generation, paid API, downloads, or screenshots.
- Delivery: `assets/items/wood.webp`, **96×96**, transparent border, **2,140 bytes**. Exact source/output SHA-256 and method: `assets/items/manifest.json`; fuller method and rebuild order: `assets/items/PROVENANCE.md`.
- Mapping: only wood material → wood.webp with timber SVG decode-failure fallback. All prior 35 icon bytes/manifest records preserved; item data, economics, drops and sim unchanged. Source/native/DOM inspection is not physical-device or new human visual approval.

## D0 Training Dragon — exact individual CC0 source (2026-10-12)
- Author: **Quaternius**. Individual model **Dragon Evolved, https://poly.pizza/m/LlwD0QNUPj**. Exact page text: “Oct 23, 2022 • FBX/GLTF format • Public Domain (CC0)”, linked to https://creativecommons.org/publicdomain/zero/1.0/ . Generic Quaternius license pages are not used to infer this.
- GLB: **436,000 bytes**, SHA-256 `f660d8f48be4ea3f39639f6206a0181127e7fe7503cb4bad8d07d27d80528f3a` (download https://static.poly.pizza/90ed3740-d8c4-4910-88ce-ac2ed426022d.glb). Page snapshot 120,372 bytes, SHA-256 `a06d50a0559f5dbbe876690000137582823cac90de85184e1df4e8c9364e8290`.
- Other two CC0 candidates (VBvzjFIYws Dragon, 3rUm1cN3yp Dragon) archived with hashes in `tools/art/d0-dragon/license-evidence.json`; not shipped.
- Offline archive: `C:/Users/user/ai-tools/arpg-art/d0-dragon/source` (GLB, HTML, baked blends). Raw frames stay outside the checkout. No runtime hotlinks.
- Delivery: `assets/sprites/dragon/atlas-{0..6}.webp` + JSON, **424 frames at 256px (2048px sheets), 8 directions × idle/run/attack/hit/death, 1,493,195 bytes**, WebP q74. `training_dragon` (S1, invulnerable, no moves/attacks/rewards, no HP bar), visual scale 1.2×, near-white tint 0xeef5e4. First 128px/q52/2.4× delivery (457cf45) looked dark and blurry and was replaced.

## Original copper training dragon — active replacement (2026-10-12)
- **Authorship:** original procedural geometry and object-keyed animation authored by Sol for cocy. No downloaded model, reskin, image texture, external model API or paid service. Project-created source/output follow repository licensing; no third-party attribution or imported CC0 assertion.
- **Active kit:** `assets/sprites/dragon`; replaces the historical D0 imported dragon above. Historical source/license evidence is retained for history, not provenance of the active pixels.
- **Source:** `tools/art/original-dragon/generate.py`, `config.json`, compatible derived `pack.py`, `verify-source.py`, `verify.py`. Saved `.blend`, raw renders, contact preview and PNG reference sheets: `C:/Users/user/ai-tools/arpg-art/original-dragon/` (new directory, not d0-dragon).
- **Anatomy:** four independent clawed legs, horizontal ribcage, long arched plated neck, elongated reptilian snout, horns, dorsal spines, long curved tapering tail, two finger-supported scalloped membranous wings. Grounded idle breathing, run, attack, hit recoil and collapse clips.
- **Delivery:** 264 frames, 256px, 8 directions, WebP-only sprite atlases strictly below 2048px. Whole-animation fixed framing and world-ground anchor; all decoded alpha checked against original renders. `tools/art/original-dragon/validation.json` and `source-validation.json` are evidence for this original object-keyed model (not the historical imported skinned rig).
- **Gameplay:** only `training_dragon` S1 sprite pixels/atlas metadata replaced. No `js/` changes; invulnerable, nonattacking, no rewards, S1 30-second timer and all other stages unchanged.

## FX1 Effekseer fire pair — opt-in local bake (2026-10-13)
- **Source:** KanaWorks_AI, https://github.com/kanaworksai-hue/effekseer-vfx-skill at commit `c28919890f0483c0f968a884ea03979803d3b528`. Adapted upstream `VFX_Projectile_Fire` + `VFX_Fire_Explosion` example, not original painted art or a claim of independently reviewed effects.
- **License:** skill and its example textures **MIT**. Exact repository `LICENSE` and `THIRD_PARTY_NOTICES.md` are preserved in `tools/vfx/fireball/licenses/`; the latter explicitly includes image-model-created `assets/examples/textures/`. Used painted textures: `T_Crack01`, `T_ExplosionSheet01`, `T_SmokeSheet01`, `T_WispTrail01`; all four match pinned originals byte-for-byte. Nine generated mathematical textures are from MIT `scripts/vfxkit/textures.py`. All 13 resource SHA-256/byte counts and source paths are in `tools/vfx/fireball/provenance.json`, with original texture prompts under `source/texture_prompts.json`.
- **Tool license evidence:** Effekseer **1.80.7 MIT**, official https://github.com/effekseer/Effekseer/releases/tag/1807, full archive `LICENSE_TOOL` retained. EffekseerForGodot4 **1.80.5.1 MIT**, https://github.com/effekseer/EffekseerForGodot4/releases/tag/1.80.5.1, plugin LICENSE retained. Godot 4.7.2 MIT tool is installed in the Windows user folder, not bundled into game assets. No extra account, paid API, global skills installation or runtime hotlink.
- **Delivery:** `assets/vfx/fireball/atlas.webp` + `atlas.json`; **40** actual Forward+ RGBA frames (12 projectile, 28 impact), **256×160**, atlas **2048×800**, **112,587 bytes total**. Decoded alpha is lossless against captures, **0 clipped frames**; complete per-frame proof `tools/vfx/fireball/atlas-validation.json`. Raw PNGs/native filmstrips remain under `C:/Users/user/AppData/Local/Temp/arpg-fx1/` outside checkout; source recipes/briefs/capture/packer/logs retained in `tools/vfx/fireball/`.
- **Mapping:** only `?fx=effekseer` enables `ember_bolt` flipbook; absent flag, reduced motion, resource failure or impact pool exhaustion retains legacy vectors. No sim/damage/timing changes or default replacement. Godot native review flags impact peak mismatch/core brightness; retained as limitations, not a forged independent review or physical-device visual approval. Fixed browser pools 24 projectile + 12 impact sprites; decoded texture costs **6.25MiB** regardless of compressed network size.

### FX2 ember_bolt contact upgrade
- Native Effekseer1.80.7 → Godot4.7.2 Forward+ transparent recapture; upstream pinned MIT source/texture licenses and receipt remain `tools/vfx/fireball/provenance.json` / `licenses/` (not CC0).
- Modified contact recipe: immediate white core, no empty contact delay; 18 impact frames. Native captures are resized/masked only to presentation support, never substitute generated frames. Runtime does not change hit/phase/host state. New capture/import logs and quantified core before/after: `tools/vfx/fireball/fx2-*`.

### FX2 lunge
- Locally authored Effekseer→Godot transparent bake; pinned upstream MIT primitives/texture generator (not CC0/CC-BY). Source URL: https://github.com/kanaworksai-hue/effekseer-vfx-skill/tree/c28919890f0483c0f968a884ea03979803d3b528. Individual texture hashes/origin + source recipes: `tools/vfx/lunge/provenance.json`; exact license texts: `tools/vfx/fireball/licenses/`.
- Distribution: `assets/vfx/lunge/atlas.webp` + `atlas.json`; no runtime hotlink. Native captures resized and alpha-support-masked to gameplay geometry. Per-skill byte/frame/decode proof: `tools/vfx/lunge/atlas-validation.json`. No independent artist or physical-device certification claimed.

### FX2 volley
- Locally authored Effekseer→Godot transparent bake; pinned upstream MIT primitives/texture generator (not CC0/CC-BY). Source URL: https://github.com/kanaworksai-hue/effekseer-vfx-skill/tree/c28919890f0483c0f968a884ea03979803d3b528. Individual texture hashes/origin + source recipes: `tools/vfx/volley/provenance.json`; exact license texts: `tools/vfx/fireball/licenses/`.
- Distribution: `assets/vfx/volley/atlas.webp` + `atlas.json`; no runtime hotlink. Native captures resized and alpha-support-masked to gameplay geometry. Per-skill byte/frame/decode proof: `tools/vfx/volley/atlas-validation.json`. No independent artist or physical-device certification claimed.

### FX2 frost_lance
- Locally authored Effekseer→Godot transparent bake; pinned upstream MIT primitives/texture generator (not CC0/CC-BY). Source URL: https://github.com/kanaworksai-hue/effekseer-vfx-skill/tree/c28919890f0483c0f968a884ea03979803d3b528. Individual texture hashes/origin + source recipes: `tools/vfx/frost_lance/provenance.json`; exact license texts: `tools/vfx/fireball/licenses/`.
- Distribution: `assets/vfx/frost_lance/atlas.webp` + `atlas.json`; no runtime hotlink. Native captures resized and alpha-support-masked to gameplay geometry. Per-skill byte/frame/decode proof: `tools/vfx/frost_lance/atlas-validation.json`. No independent artist or physical-device certification claimed.

### FX2 whirl
- Locally authored Effekseer→Godot transparent bake; pinned upstream MIT primitives/texture generator (not CC0/CC-BY). Source URL: https://github.com/kanaworksai-hue/effekseer-vfx-skill/tree/c28919890f0483c0f968a884ea03979803d3b528. Individual texture hashes/origin + source recipes: `tools/vfx/whirl/provenance.json`; exact license texts: `tools/vfx/fireball/licenses/`.
- Distribution: `assets/vfx/whirl/atlas.webp` + `atlas.json`; no runtime hotlink. Native captures resized and alpha-support-masked to gameplay geometry. Per-skill byte/frame/decode proof: `tools/vfx/whirl/atlas-validation.json`. No independent artist or physical-device certification claimed.

### FX2 pierce_shot
- Locally authored Effekseer→Godot transparent bake; pinned upstream MIT primitives/texture generator (not CC0/CC-BY). Source URL: https://github.com/kanaworksai-hue/effekseer-vfx-skill/tree/c28919890f0483c0f968a884ea03979803d3b528. Individual texture hashes/origin + source recipes: `tools/vfx/pierce_shot/provenance.json`; exact license texts: `tools/vfx/fireball/licenses/`.
- Distribution: `assets/vfx/pierce_shot/atlas.webp` + `atlas.json`; no runtime hotlink. Native captures resized and alpha-support-masked to gameplay geometry. Per-skill byte/frame/decode proof: `tools/vfx/pierce_shot/atlas-validation.json`. No independent artist or physical-device certification claimed.

### FX2 flame_ring
- Locally authored Effekseer→Godot transparent bake; pinned upstream MIT primitives/texture generator (not CC0/CC-BY). Source URL: https://github.com/kanaworksai-hue/effekseer-vfx-skill/tree/c28919890f0483c0f968a884ea03979803d3b528. Individual texture hashes/origin + source recipes: `tools/vfx/flame_ring/provenance.json`; exact license texts: `tools/vfx/fireball/licenses/`.
- Distribution: `assets/vfx/flame_ring/atlas.webp` + `atlas.json`; no runtime hotlink. Native captures resized and alpha-support-masked to gameplay geometry. Per-skill byte/frame/decode proof: `tools/vfx/flame_ring/atlas-validation.json`. No independent artist or physical-device certification claimed.

### FX2 blast_arrow
- Locally authored Effekseer→Godot transparent bake; pinned upstream MIT primitives/texture generator (not CC0/CC-BY). Source URL: https://github.com/kanaworksai-hue/effekseer-vfx-skill/tree/c28919890f0483c0f968a884ea03979803d3b528. Individual texture hashes/origin + source recipes: `tools/vfx/blast_arrow/provenance.json`; exact license texts: `tools/vfx/fireball/licenses/`.
- Distribution: `assets/vfx/blast_arrow/atlas.webp` + `atlas.json`; no runtime hotlink. Native captures resized and alpha-support-masked to gameplay geometry. Per-skill byte/frame/decode proof: `tools/vfx/blast_arrow/atlas-validation.json`. No independent artist or physical-device certification claimed.

### FX2 heavy_cleave
- Locally authored Effekseer→Godot transparent bake; pinned upstream MIT primitives/texture generator (not CC0/CC-BY). Source URL: https://github.com/kanaworksai-hue/effekseer-vfx-skill/tree/c28919890f0483c0f968a884ea03979803d3b528. Individual texture hashes/origin + source recipes: `tools/vfx/heavy_cleave/provenance.json`; exact license texts: `tools/vfx/fireball/licenses/`.
- Distribution: `assets/vfx/heavy_cleave/atlas.webp` + `atlas.json`; no runtime hotlink. Native captures resized and alpha-support-masked to gameplay geometry. Per-skill byte/frame/decode proof: `tools/vfx/heavy_cleave/atlas-validation.json`. No independent artist or physical-device certification claimed.

### FX2 healing_light
- Locally authored Effekseer→Godot transparent bake; pinned upstream MIT primitives/texture generator (not CC0/CC-BY). Source URL: https://github.com/kanaworksai-hue/effekseer-vfx-skill/tree/c28919890f0483c0f968a884ea03979803d3b528. Individual texture hashes/origin + source recipes: `tools/vfx/healing_light/provenance.json`; exact license texts: `tools/vfx/fireball/licenses/`.
- Distribution: `assets/vfx/healing_light/atlas.webp` + `atlas.json`; no runtime hotlink. Native captures resized and alpha-support-masked to gameplay geometry. Per-skill byte/frame/decode proof: `tools/vfx/healing_light/atlas-validation.json`. No independent artist or physical-device certification claimed.

## QC1 Gargoyle — preserved D0 CC0 atlas reuse (2026-10-13)
- Source: immutable `tools/art/legacy-gargoyle` (historical Dragon Evolved kit); exact Quaternius individual model/page/license/hash evidence in D0 above and `tools/art/d0-dragon/license-evidence.json`. No download or new license inference.
- Delivery: distinct `assets/sprites/gargoyle`, 7 WebP sheets copied byte-identically, 424 frames/256px, all 8 directions × idle/run/attack/hit/death. JSON frame names gain `gc_`; Pixi cachePrefix is `gargoyle/`. Manifest byte total: 1495739. Archive/source/active dragon kits unchanged.
- Existing `CharacterArmature|Headbutt` 15-frame attack clip reused for both ground crush and short dash, with authoritative phase timing. It reads as a headbutt, not an authored ground slam. Archived idle/run derive from Flying_Idle/Fast_Flying with the baked ground anchor; wing motion is retained but combat has no flying or breath. No separate crush/dash clip or visual-contact equivalence claimed.

## U1 KayKit Skeletons — four CC0 game kits (2026-10-12)
- Author: **Kay Lousberg**. Original pack repository: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 . No new downloads, paid API, or runtime hotlinks.
- **Exact original license path:** `C:/Users/user/ai-tools/arpg-art/source/KayKit-Character-Pack-Skeletons-1.0-main/addons/kaykit_character_pack_skeletons/LICENSE.txt`. Original text: **“License: (Creative Commons Zero, CC0)”**, linked to `http://creativecommons.org/publicdomain/zero/1.0/`; **“This content is free to use in personal, educational and commercial projects.”** Attribution is optional: “Support me by crediting Kay Lousberg, www.kaylousberg.com (this is not mandatory)”. Full original copy `tools/art/u1-skeletons/LICENSE-KayKit.txt`; original license SHA-256 **5d822abca4e08c5a91d329e5372b3dc605cba8d994f752cb0f7dfdb7a0a79954** and all four unchanged GLB sizes/digests in `license-evidence.json`.
- Source files under that pack's `Characters/gltf/`: `Skeleton_Minion.glb`, `Skeleton_Warrior.glb`, `Skeleton_Rogue.glb`, `Skeleton_Mage.glb`. Original embedded rigs/materials/textures/clips. Idle/Running_A/Hit_A/Death_A shared; respective attacks **Unarmed_Melee_Attack_Punch_A / 1H_Melee_Attack_Slice_Horizontal / 1H_Melee_Attack_Stab / Spellcast_Shoot**. Warrior/rogue sword and mage staff use existing locally authored procedural geometry in `tools/art/bake.py`, dedicated to **CC0 1.0** by cocy/Untitled. No new external accessories.
- Same existing 40° orthographic camera, Standard transform, warm key/cool rim, ink hull, fixed ground origin and horizontal root-motion suppression. Final camera dependency graph update verified before anchor export. White neutral palette keeps baked KayKit colors; no simulation changes. Skeleton warrior is a **direction-independent tank**, only HP/poise/kbResist increased relative to minion. Rogue reuses goblin dash, mage reuses sling projectile. **Definitions only; no stage placement or new drop tables (U5/content follow-up).**
- Delivery `assets/sprites/skeleton-{minion,warrior,rogue,mage}/atlas-{0,1}.webp` + Pixi metadata. **392 / 360 / 400 / 352 frames = 1,504**, each **8 directions × 5 states**; total kit sizes **479,068 / 433,225 / 453,502 / 388,305 bytes**. Hit/death presentation .15s/.6s, unchanged host timings and shared .7s fade. Source GLBs, raw PNGs, blends and contact sheet stay outside checkout at `C:/Users/user/ai-tools/arpg-art/u1-skeletons/`.
- Existing humanoid verifier **unchanged**: >=5% opaque coverage, local arm rotation >10°, skinned RMS >.015; 8 unique octants, nonstatic clips, no any-alpha clipping. All 1,504 lossless alpha masks match fresh source poses; **0 T-pose/bind/clipped frames**. Minimum measured coverage **5.438 / 5.237 / 6.128 / 8.282%**; idle drift **.5 / .5 / 1 / .5px**. Evidence plus delivery hashes: `tools/art/u1-skeletons/delivered-validation.json`.
- Independent read-only reopened-blend analytical camera projection agrees with metadata ground anchors in all **1,504 samples** (maximum **0.000001px** error); no baked ground/light shadows. Script and evidence `verify-ground-anchor.py` / `ground-anchor-validation.json`. After rebase on main **dc2a876**, existing **13 kits / 128 files** and their manifest descriptors are preserved exactly; **216 host digests across all 24 main stages** (three seeds × three weapons ×900ticks) match main byte-for-byte, SHA-256 `af2f73a70406519d9ecc67f7ebcc0bcc28be9434e44321e3cef5d324dafb23d9`. Stored preservation/trace evidence binds current bytes. Native CDP debug-spawn smoke at 1280×800 / 390×844 checks all four kits, 320 total state/octant samples, white tint, moving clips, fallback and active WebGL; **consoleErrors 0**. Numerical/browser-native evidence does not claim human visual approval or physical-device testing.

## I1 T4 item illustrations — original local CC0
- Source: `arpg/tools/item-art-tier4.py`, locally authored Pillow 4x illustrations in the existing item/ART-W palette. Original contribution dedicated to CC0 1.0 under the project's existing original-item-art dedication; no external asset/page/download/model/license inference.
- Delivery: `assets/items/{revenant-blade,bone-bow,soulfire-wand,gravekeeper-staff,ossuary-maul,shroud-robe,shadow-leather,ossuary-plate,dragonfang-blade,dragon-scale-armor,dragon-scale}.webp`; 96x96 transparent lossless, eleven distinct alpha silhouettes, 16,964 bytes added. Source/output hashes and byte counts: `assets/items/manifest.json`.
- Geometry/alpha evidence produced by `tools/item-art-tier4-check.py`; prior 36 item pictures/records unchanged. No AI, GPU, paid service, hotlink or character-model change.

## M2a — graveyard ghoul / ghost / giant bat (offline Blender atlas)
- Ghoul: **Animated Zombie by Quaternius**, https://poly.pizza/m/jkrEvQZb8J, **CC BY 3.0**, https://creativecommons.org/licenses/by/3.0/. Attribution required: “Animated Zombie by Quaternius (Poly Pizza), CC BY 3.0; modified: neutralized materials, local calm-idle/recoil/death, 8-direction sprite bake.” This ledger and bundled `tools/art/m2a/LICENSE-CC-BY-3.0.txt` carry attribution/license; retain them in distribution.
- Ghost: **Ghost by Quaternius**, https://poly.pizza/m/Iip30bDHmu, **CC0 1.0** (individual page: Public Domain (CC0)). Original flying-idle/fast-flight/punch/hit/death clips; no new ability.
- Giant bat: **Bat by Quaternius**, https://poly.pizza/m/hNO9XvjlKa, **CC0 1.0** (individual page: Public Domain (CC0)). Original flight/attack/hit/death; fast-flight is a local time-scaled copy, not a replacement for hit/death.
- Provenance: `tools/art/m2a/license-evidence.json` records each individual page/license quotation, original GLB and HTML SHA-256; legal text and page extracts bundled. Raw HTML/GLBs, prepared GLBs, blends/PNGs stay at `C:/Users/user/ai-tools/arpg-art/m2a/`. Runtime uses local WebP + JSON, no hotlinks. Generic Quaternius QAL not used as license evidence. Rejected unrigged candidate: https://poly.pizza/m/pEwXEubhxz (no animations/skin).


## M2b — demon / goleling / slime (local kits, not deployed)

Parent explicitly authorized only three `ATLAS_IDS` mappings after original source-only checkpoint `e0078e2`; baseline `0c64a94` remains preserved. This is implementation delivery for parent visual review, **not artistic acceptance, hunt placement or production release**.

| Kit | Individual source | Author | Individual license |
|---|---|---|---|
| Demon | https://poly.pizza/m/LnfIziKv4o | Quaternius | Public Domain CC0 1.0 |
| Goleling | https://poly.pizza/m/71gomWolax | Quaternius | Public Domain CC0 1.0 |
| Green Blob (slime) | https://poly.pizza/m/y4kJh8EeYS | Quaternius | Public Domain CC0 1.0 |

Legal: https://creativecommons.org/publicdomain/zero/1.0/ . Each original HTML/GLB SHA-256, individual-page quote, author and modification disclosure is in `tools/art/m2b/license-evidence.json`; full CC0 text and page extracts bundled. No generic pack-license inference, paid generation, hotlink or primitive character substitution. Unmodified HTML/GLBs, current derived `.blend` and full native PNG frames remain at `C:/Users/user/ai-tools/arpg-art/m2b/`.

Native clips, all **8 directions × idle/run/attack/hit/death**, complete source timelines sampled at 6fps: Demon Idle/Run/Weapon/HitReact/Death; Goleling Flying_Idle/Fast_Flying/Headbutt/HitReact/Death; Slime Idle/Walk/Bite_Front/HitRecieve/Death. Demon’s imported Root keys cancel an offset rest skeleton: preserve first-idle horizontal values rather than zeroing them. The original Trident mesh is reoriented once to upright idle grip via its evaluated one-joint affine transform, retaining original Middle1.L skin; no new weapon mesh. Per-kit source color overrides, ink hull, fixed 40° orthographic camera, 0.10 demon / 0.012 slime constant ground lifts. Goleling has eight original wing joints; separate source proof checks four active proximal wing joints and floating core stability. Slime anatomical octants are measured using actual eye vertices against Head, not inferred from a spherical body.

576 delivered frames: **192 / 208 / 176**. Full decoded RGBA sheet capacity `sum(width*height*4)` is **12 / 13 / 11 MiB**, maximum sheet 2048px, total new kits 36MiB (excluding mipmaps, driver overhead, old active kits, CPU decode copies). Compressed bytes are not a GPU-memory claim. Per-frame source/alpha, clipping, native skin, octant anatomy, silhouette motion and fixed-ground evidence in `source-validation.json` / `delivered-validation.json`; runtime loaded Texture-source dimensions in `browser-validation.json`. Parent reviews `tmp/arpg-m2b-preview/` contact/game-size/phase previews separately. Physical-phone memory/performance unmeasured. Existing sim/net/index/renderer functions, 27 stages, loot and economy unchanged; these IDs have no drops and are not placed.
