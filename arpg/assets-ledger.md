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
- Used: `Characters/gltf/Skeleton_Minion.glb` with embedded textures/rig/clips (Idle, Running_A, Unarmed_Melee_Attack_Punch_A, Hit_A, Death_A).
- Base material moved 30% toward light neutral for multiplicative Pixi Sprite.tint. Facial contrast retained. No noncommercial material used.

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
