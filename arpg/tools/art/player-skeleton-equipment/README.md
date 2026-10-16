# Bare skeleton: actual equipment kit

Scope: presentation only. One exposed-bone base plus independently bone-attached hands, feet, body, head, sword and blunt geometry. Inventory, rarity and unlock level never imply wearing a layer. Both normal combat and inn portrait use `skeletonAppearance(save)`. Permanent DeathKnight continues using its existing dedicated kit after armor removal.

The Warrior's original body/limb meshes contain built-in armor details. They remain hidden rig-validation references, **not visible base geometry**. Its CC0 skull/jaw/eyes, rig and real clips remain; exposed rib cage, spine, pelvis and limbs and the equipment are project-authored geometry. No base helmet, cloak or skull mask. See both license files and provenance.json.

## Reproduce locally

Installed Windows Blender 5.2.2 and existing local CC0 GLB; no downloads/services. Keep `config.json`'s output/source in the **new offline namespace** `C:/Users/user/ai-tools/arpg-art/player-skeleton-equipment/`, never under the website. Copy this directory's bake.py, weapon.py, config.json and verify-source.py there. From this checkout:

```sh
'/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --factory-startup --python 'C:/Users/user/ai-tools/arpg-art/player-skeleton-equipment/bake.py' -- 'C:/Users/user/ai-tools/arpg-art/player-skeleton-equipment/config.json' --checkpoint
# Inspect actual model checkpoint before full delivery; omit --checkpoint for full bake.
'/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --factory-startup --python 'C:/Users/user/ai-tools/arpg-art/player-skeleton-equipment/bake.py' -- 'C:/Users/user/ai-tools/arpg-art/player-skeleton-equipment/config.json'
python3 arpg/tools/art/player-skeleton-equipment/pack.py /mnt/c/Users/user/ai-tools/arpg-art/player-skeleton-equipment arpg/assets/sprites/player-skeleton-equipment --portrait-module arpg/js/render/skeleton-portrait-frames.js
'/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --factory-startup --python 'C:/Users/user/ai-tools/arpg-art/player-skeleton-equipment/verify-source.py' -- 'C:/Users/user/ai-tools/arpg-art/player-skeleton-equipment/config.json'
python3 arpg/tools/art/player-skeleton-equipment/verify-composition.py /mnt/c/Users/user/ai-tools/arpg-art/player-skeleton-equipment arpg/assets/sprites/player-skeleton-equipment
node --test arpg/test/skeleton-equipment.test.js arpg/test/paperdoll.test.js
node arpg/test/skeleton-equipment.native.mjs
node arpg/test/skeleton-equipment-budget.mjs
```

`pack.py` writes only the supplied new kit destination and optional explicit portrait metadata module. It never merges the shared manifest. Raw PNGs and .blend stay offline; web delivery contains sparse lossless WebP color, PNG RG16 depth and JSON. Tools intentionally preserve old U1/DK/archer pipelines.

## Geometry and playback contract

- 480 frames; 48 groups = 6 real clips × 8 directions; physical/logical frame128. Same camera, lighting, ground anchor and every source sample for all layers. The envelope includes **all** optional geometry and outlines. Original horizontal root/hips travel is suppressed with drivers.
- Dodge_Forward .4s source sampled at0/1.92/3.84/5.76/7.68/9.6 Blender frames. All six including endpoint are retimed into existing authoritative .2s dash. The already-tested DK presentation clock is reused for catch-up, restart and endpoint hold. No sim/input/timing changes.
- Each selected part is a genuine posed 3D render. Camera distance is exported via Blender5.2 compositor file-output FLOAT item into 16-bit linear PNG with display transform disabled; pack encodes it losslessly in RG channels. Runtime sorts per-pixel fragments by depth and alpha-composites back-to-front, **not a fixed head/body/weapon screen overlay**.
- 16 armor combinations × 2 weapon geometries are composed on demand, not stored as32 atlases. The existing serial lease library retains at most2 outputs; source bitmaps close after readback. Colors/depth arrays become collectible when composition resolves. Weapon glow uses a visible-depth-filtered mask from the actual selected weapon.
- Source IDs/UIDs and selected layers are part of the shared descriptor/cache identity. Rarity does not create new meshes yet. A missing skeleton kit never silently loads human hero art.
- The inn lacked a normal armor-removal action. A narrowly scoped skeleton armor-only button now clears that equipped slot through the existing transactional Hub commit; no items/currency/permanent flag/schema/requirements are modified. Humans and weapon removal are excluded.

## Evidence and limits

`packing-proof.json`, `composition-proof.json`, `provenance.json`; full offline frames.json contains per-frame source sampling, skin/reference movement, grip, root and framing evidence. Verification reopens the actual source and renders all16 armor combinations × both weapons × each6-state/8-direction middle source pose; compares shipped decoded-layer composites against direct assembled geometry. Small multisampling edge differences are measured, not claimed byte-identical.

Native test uses validator-valid SAVE fixtures only, then real UI equip/remove/reload/launch and native keyboard/touch dodge. World reads are observational; no forced clear, world mutation, screenshot or sim acceleration. 390px is desktop headless Chromium viewport evidence, not physical-phone performance. Budget test records32 actual compositions with <=2 cached outputs, decoded array bytes and canvas dimensions, **not measured GPU/heap peak**. Source model aesthetic approval remains the parent reviewer's decision.

Simple steel equipment silhouettes are intentionally shared across rarities; sword and blunt are distinct physical forms. The base skull is deliberately large/stylized like the CC0 source. Dedicated DK geometry/animations remain unchanged. No hub/HUD/CSS theme work, progression/gates, economy, save schema, network, input, classes or trial work is included. Stamping/integration/deployment are parent-owned.
