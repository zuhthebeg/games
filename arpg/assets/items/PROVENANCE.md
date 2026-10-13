# ARPG item artwork provenance

## Scope and actual method

36 delivered transparent 96×96 local lossless WebPs, **204,252 encoded bytes**. 27 original locally illustrated 2D pictures + 5 reused spudsquad pictures + 4 local enchant-scroll derivatives. **New AI/SDXL images: 0.** No external URLs, paid provider, downloads, screenshots, or spudsquad changes. Original wood provenance is also recorded in assets-ledger.md.

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

Every output SHA-256, source SHA-256, source path, exact encoded bytes and processing method is in `manifest.json`. Original drawings reference the builder script SHA; there is no hidden source PNG. Reused pictures keep their original colours and shape, alpha-crop to the nontransparent bounds, Lanczos-fit to 84px and center in a 96px square with transparent margin. Lossless WebP preserves the resulting RGBA pixels.

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

Prior base-art verification (before enchant variants): 123/123 Node tests; stamp check PASS; 31/31 RGBA/transparent-border/48·64px checks; Chromium P2 real UI at all three viewports, 43 image/geometry audits, all 232 item IDs resolving 31 decoded paths, purchase/enhance/dismantle-cancel, native touch inventory + Enter comparison + Escape close, and real invalid-byte SVG fallback/recovery PASS. Receipt/reveal picture decode uses the existing builders with an isolated receipt fixture (3 images), not a new live reward settlement. Normal console/HTTP errors 0, screenshots 0. Evidence logs/report are recorded in the integration result, not the shared ledger.

## Enchant-scroll derivatives (2026-10-11)

`enchant-variants.py` in this directory takes the existing reviewed `scroll.webp` only. It preserves parchment/roll geometry, overlays red wax plus a sword for weapon scrolls and blue wax plus a shield for armor scrolls. Blessed versions add a gold inner alpha-contour border and gold seal trim. Pillow 4× processing, Lanczos downsample, lossless 96×96 WebP; no AI, downloads or external URLs. Original scroll reuse provenance limitations above still apply. The four derived records in manifest.json record the local source hash, method, output hash and bytes. Rebuild with `python3 arpg/assets/items/enchant-variants.py` (after the base builder if used).

All four real enchant item IDs now have distinct local paths; the return scroll keeps its original art. Enhancement grade remains HTML presentation metadata, not item stats inferred from art.


## ART-W original wood (2026-10-12)

`wood-art.py` here adds only `wood.webp`: two locally authored cut timber logs,
faceted brown bark, pale cut ends and growth rings. It follows the approved
item builder's dark `#38271e` outline, earthy wood palette, Pillow 4× supersampling,
alpha crop, 84px fit and 96×96 transparent canvas. 64-color RGBA quantization
before lossless WebP encoding bounds the new icon to **2,140 bytes** and keeps
all 36 icons below the unchanged **200 KiB** budget. No AI inference, external
source, downloaded asset, model, API or cost. Original source-art inspection
confirms timber rather than leather/mineral; this is not a screenshot or a new
human visual approval claim. The original contribution is dedicated to CC0 1.0
by cocy/Untitled's local pipeline; no third-party license is inferred.

Rebuild only this icon with `python3 arpg/assets/items/wood-art.py`. It preserves
all prior manifest records and WebP bytes, adds its own source/output SHA-256,
and is deterministic in the tested Pillow 12.1.1 environment. The base builder
predates this addition; if rebuilding everything, run base builder, enchant
variants, then wood-art.py. `wood` now maps exactly to `assets/items/wood.webp`,
with a timber SVG fallback instead of the generic bag glyph. Unknown items and
empty equipment sockets retain their old fallback behavior. Item definitions,
materials, economics, save logic, drops and simulation are untouched.

The actual index browser smoke now requires every real item (including wood)
to have and decode a local image at each mobile/desktop viewport, explicitly
checks a labelled wood material row via native touch/keyboard activation and
checks wood in receipt/reveal builders. No coverage exclusion for wood remains.

## I1 original T4 equipment and guardian scale

`arpg/tools/item-art-tier4.py` appends eleven original local pictures: ten grave/
guardian equipment forms plus the guardian-scale crafting material. Same dark
outline/steel/brass/earth palette and Pillow 4x supersampling / 84px fit as ART-W,
96x96 transparent lossless WebP, 64-color RGBA quantization. Near-solid alpha is
restored to 255 after quantization. No GPU/model, AI, external assets or cost.
Unique geometry includes straight/notched and curved fang blades, articulated
bone bow, short flame-crowned wand, long fork-headed staff, bone-banded maul,
wide-sleeved cloth robe, laced leather, ribbed plate, overlapping scale armor.

47 delivered files: 38 original + 5 reused + 4 derivatives. Prior 36 records and
WebP bytes preserved; eleven new icons add **16,964 bytes**, total **221,216**.
The legacy 200 KiB budget is still checked independently; this content expansion
has a separate 32 KiB budget (overall 232 KiB) instead of recompressing old art.
Each file's original builder source/output SHA and exact bytes are in manifest.
No third-party licensing claims: these authored contributions follow the local
CC0 dedication recorded in assets-ledger.md. Source-only contact sheet reviewed;
no screenshots/new human approval/physical-phone certification claimed.

Rebuild: base builder → enchant variants → wood-art.py →
`python3 arpg/tools/item-art-tier4.py`. T4-only rebuild preserves all earlier files.
`python3 arpg/tools/item-art-tier4-check.py` checks full/threshold alpha support at
96/64/48px, transparent borders and pairwise alpha-mask XOR counts. Exact T4 base
IDs/rarity variants share each base's own new UI picture; the guardian-scale
material has a scale-specific SVG fallback. Paperdoll retains its existing
family kit/fallback: unique item icons are not new character-held 3D models.
