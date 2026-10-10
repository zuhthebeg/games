# ARPG item artwork provenance

## Scope and actual method

31 delivered transparent 96×96 local lossless WebPs, **157,114 encoded bytes** (153.43 KiB). 26 original locally illustrated 2D pictures + 5 reused spudsquad pictures. **New AI/SDXL images: 0.** No external URLs, paid provider, downloads, screenshots, shared assets-ledger writes, or spudsquad changes.

The Windows native diffusion-win Python was reachable, but the generation preflight failed because `C:\Users\user\ai-tools\models\luminarqmix-v7\model_index.json` was absent. `arpg/tools/item-art-generate.py` records the unexecuted prompt/seed contract and requires the local model; its prompts were **not** used to produce delivered pixels. No WSL SDXL or alternate-model inference occurred.

New pixels instead use explicitly authored local 2D illustration (`arpg/tools/item-art-build.py`, Pillow, 4× supersampling). These are coloured, outlined/faceted item pictures, not SVG silhouettes repackaged as AI art, not baked 3D, and not SDXL output. Steel, leather, wood and brass shapes were hand specified in that script. Existing spudsquad `test/generate-equipment-art.py` proves that project also uses local Pillow supersampled 2D artwork for shield/stick; those files were read, not executed or modified. It does **not** prove how the older reused staffs/fang/scroll were made: their original generator/model/license history was not found, and none is fabricated. Reuse is authorized by the user's explicit spudsquad permission.

Other candidates reviewed and excluded: item_helmet (military), item_garden_glove (rubber), item_thorn_armor (not these base armor forms), modern weapons/consumables, and crossbows. Existing enhance FLUX sword/bow PNGs were reviewed only, not used: dark opaque backgrounds, overly thin at 48px and a different style. No credentials in their old generator were used.

## Reused source evidence

Repository sources resolved under `/home/cocy/.openclaw/workspace/tmp/worktrees/arpg-p2impl/`; they are immutable input for this build.

| Delivered file | Source | SHA-256 of source |
|---|---|---|
| wand.webp | `/home/cocy/.openclaw/workspace/tmp/worktrees/arpg-p2impl/spudsquad/assets/weapon_staff.webp` | `51be6bf2cab275cb14c5df13ab440c431d1dd4226976c6a4654f19f6432fb7f1` |
| staff-t2.webp | `/home/cocy/.openclaw/workspace/tmp/worktrees/arpg-p2impl/spudsquad/assets/weapon_staff_t3.webp` | `1a98a9d8e4d052e95ccfa2ec5d0437c0b7de0e66e56cbd6cef54f6eadf1ca496` |
| staff-t3.webp | `/home/cocy/.openclaw/workspace/tmp/worktrees/arpg-p2impl/spudsquad/assets/weapon_staff_t4.webp` | `1c500337b6c6ea4ddb117d597938b0b0fecc2444eb53d32545d6472336b7f8f6` |
| fang.webp | `/home/cocy/.openclaw/workspace/tmp/worktrees/arpg-p2impl/spudsquad/assets/item_vampire_fang.webp` | `5feaa948be24d3148b417f78e539f60fd6fcb543da317555519f1668eee354a0` |
| scroll.webp | `/home/cocy/.openclaw/workspace/tmp/worktrees/arpg-p2impl/spudsquad/assets/item_wisdom_scroll.webp` | `62cde2a4a5deee9ccbf328fb50657fe00ed3ea6f174a7df89a9a3e13948a7d52` |

Every output SHA-256, source SHA-256, absolute source path, exact encoded bytes and processing method is in `manifest.json`. Original drawings reference the builder script SHA; there is no hidden source PNG. Reused pictures keep their original colours and shape, alpha-crop to the nontransparent bounds, Lanczos-fit to 84px and center in a 96px square with transparent margin. Lossless WebP preserves the resulting RGBA pixels.

## Mapping and limitations

`arpg/js/ui/item-art.js` maps reviewed forms from existing item definitions only. Rarity, enhancement and affixes stay on the existing labels/borders/badges; they never select invented stats or fake unique pictures. Sword/bow T1–T3 have physically distinct new silhouettes/trims; staff T2/T3 use visibly distinct existing purple/gold staffs. The short yellow crystal stick is used as a wand, not labelled a long staff. Cleaver and maul use their actual forms instead of a generic sword. Cloth/leather/plate torso, hood/helmet, leather/metal hands and boots provide supported form differences. No crossbow is called a bow.

Not all base templates have unique art: ordinary swords/bows within a hunt tier share a family drawing; leather/medium armor and tiers share neutral representative drawings, and rune/frost materials share neutral mineral art. This is **UI family/form art**, not exact portrait parts or a claim that all armor classes/hunting tiers have unique images. P5 portrait geometry/composition remains untouched. Unknown items/families keep explicit SVG; empty sockets remain SVG. Forge enhancement rows get the three stone pictures through the existing `icon()` call. No item logic or metadata changed.

## Rendering and checks

`itemIcon()` emits a local picture + inline SVG fallback. Both are decorative; existing button/touch/keyboard labels and grade text remain authoritative. Lazy image loading/async decode, 96px declared intrinsic dimensions and CSS containment prevent item-art layout shifts. Event capture keeps SVG visible until load succeeds; actual invalid image bytes are tested to reveal fallback again. No inline error handlers, listeners per icon, external URL, added portrait layer, or UI geometry change.

Run:

```sh
python3 arpg/tools/item-art-build.py
python3 arpg/tools/item-art-check.py /tmp/arpg-item-art-alpha.json
node arpg/tools/stamp-assets.mjs
node --test arpg/test/*.test.js
node arpg/test/item-art-browser-smoke.mjs
```

Source-only contact-sheet review at actual 48/64px: consistent dark outlines/brass and readable distinct bow strings, blades, helmet/hood, torso, pairs of gloves/boots, I/II/III stones, potion colours, scrap/leather/mineral/web. Reused staffs have a more rounded painted style but remain readable. No screenshots were taken. Automated checks cover RGBA decode, dimensions, fully transparent outer rows/columns, visibility at 48/64px, budget, all real item IDs, existing UI paths in Chromium at 360×640/390×844/1280×900 and actual decoder-failure recovery. Machine geometry and source-art review do not claim real-phone thumb or screen-reader testing.
