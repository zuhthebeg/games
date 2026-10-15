# Skeleton Archer — unregistered technical candidate

Recovered from `31448265a4aebffb8daaf81639a4c2c334724ae1`, based on `d57b160` (not the later parent `9646945`). No merge or runtime integration. Original checkpoint source, contact proof, previews and 41-frame evidence remain unchanged. `final/` and `preview-final/` supersede only the old incremental readiness status.

## Status / provenance

Source + atlas technical gates PASS. **Parent visual approval and registry integration are pending.** No playable, generic-ranged, physical-phone or performance claim.

Base: Kay Lousberg's KayKit Character Pack Skeletons 1.0, CC0, https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 . The original anatomical Skeleton_Rogue uses 41 joints, 8 genuinely skinned meshes and the original static cape. Base meshes were not newly authored here. The custom recurve bow/grip/arrow/fletching/string and `Archer_Draw_Contact_Release` are the additions in these generator scripts; the attack is not the original Rogue melee animation renamed. The initial aiming pose is sampled from `2H_Ranged_Aiming`, then custom hand IK poses are baked over source frames 0..24. No separate external bow/model authorship is asserted.

Original Rogue GLB SHA256 `4003f2b77891bb56f7e0de7d555abcb497aebbcaee35b614211f16275f9ccae3`; original license (914 bytes) `5d822abca4e08c5a91d329e5372b3dc605cba8d994f752cb0f7dfdb7a0a79954`. The 34 original pack files and 1528 U1 output files are checked against the preserved baseline inventory.

## Evidence and review

- `source/player-skeleton-archer-source.blend` + root `source-validation.json`: original checkpoint pair, preserved.
- `source/player-skeleton-archer-full-source.blend`: completed full-bake source, SHA256 `e7fdc12cab7691733b93f999817501bdb2443cd165fbfc76bb9c37be6ee5a125`.
- `final/source-validation.json`: reopened final source; body coordinates preserved, 8 skin modifiers, 6 moving source clips, all 464 bow grips, 96 attack contact-coordinate bindings, 40 in-place dodge source samples.
- `final/frames.json`: original 464 render records; original 256px PNGs remain offline. Only one full-draw fixture was rerendered; its RGBA matches the original exactly.
- `final/source-mask-stats.json`, `delivered-mask-stats.json`, `packing-validation.json`: source coverage 6.17065..13.04169%, physical coverage 6.11572..13.09815%, unchanged 5..60% gates, alpha reconstruction exact for all 464 frames.
- `pixi-parser-validation.json`: shipped Pixi 8.22.0 CPU metadata parsing, all 48 groups/464 textures.
- `native-validation.json`: installed native Chromium + WebGL SwiftShader; all metadata/decoded atlas dimensions, one 128px fixture, exact source alpha, trim/anchor/full original bounds, page errors zero. No browser screenshot or game runtime.
- `final/artifact-validation.json`: 938 existing checkout files + 34 KayKit originals + 1528 U1 output files + all 551 offline files existing at recovery start preserved; artifact hashes bind the reports.
- `preview-final/contact-sheet.png`, `game-size.png`, `arrow-release-four-frames.png`, `preview-meta.json`: full-source review files. Root `preview/` remains the old checkpoint.

Serve the worktree's `arpg` directory over localhost and open `/tools/art/player-skeleton-archer/preview.html` for an independent, standalone Pixi review. It does not import game runtime, use storage, register content or touch the registry. Animation names are merged and sorted by their original indexed names after height-sorted packing.

## Sampling / display contract

12fps, eight directions E/SE/S/SW/W/NW/N/NE. Per direction: idle13, run10, attack12, hit8, death10, dodge5, total58; all directions464. The source camera is fixed at 40° pitch / Standard view / transparent 256px / Eevee16 samples; envelope-derived ortho3.931180954, constant ground anchor `(0.5, 0.6339516043663025)`. Original warm key/cool rim and ink outlines retained.

Attack contact lasts through source frame14, release begins15, first delivered release sample16, arrow hidden from17; the four-phase preview is frames4/12/14/16. Right slot/string/nock contact and true hand-surface proximity are evaluated, followed by arrow displacement and string separation. The bow stays attached to the true left hand in every state.

Dodge is actual `Dodge_Backward`, original range0..9.6 at24fps (.4s), original root travel about.65 world units; horizontal root/hips channels are suppressed by drivers while skeletal lean/limb motion remains (independent skin RMS .233654 world). Rendered samples0/2/4/6/8 are nonstatic and root-in-place in all 8 directions. Future caller must explicitly map normalized dodge progress to the 5 non-looping frames over .4s and let simulation own translation. No idle alias; no existing player dodge integration is claimed. Hit/death gameplay timing also remains a future caller contract, not a simulation change here.

Physical128, logical256. `meta.scale=.5` makes the actual Pixi TextureSource and Spritesheet resolution **.5**, i.e. logical expansion **2**; do not confuse inverse expansion with TextureSource resolution2. Full `sourceSize` is physical128 before Pixi parsing; trim offsets and frame dimensions expand2. Preview Sprite scale.5 gives native128 bounds and the fixed ground anchor cancels correctly.

One physical1024×1936 atlas: base-level RGBA `7,929,856 bytes = 7.5625 MiB` (target8/hard12 met). WebP `760,576 bytes` is transfer size, **not GPU memory**. This excludes driver alignment, framebuffer, other assets, mipmaps if later enabled and overhead; real VRAM/FPS/physical-phone measurements were not performed.

## Bounded reproduction

From workspace `/home/cocy/.openclaw/workspace` (already-installed Python/Pillow, Node/Playwright/Chromium only):

```sh
T=tmp/worktrees/arpg-skeleton-archer-art/arpg/tools/art/player-skeleton-archer
O=/mnt/c/Users/user/ai-tools/arpg-art/player-skeleton-archer
B=tmp/arpg-archer-recovery-20261015T111650+0900
node "$T/verify-pixi.mjs" tmp/worktrees/arpg-skeleton-archer-art/arpg/assets/sprites/player-skeleton-archer
node "$T/verify-native.mjs"
python3 "$T/verify-artifacts.py" "$O" "$B"
```

The native test self-serves a local ephemeral port and closes its browser/server. It refreshes only generated validation reports. The artifact verifier is read-only unless explicitly given `--output`.

Windows-native independent source proof (copy this tool's `verify-source.py` to the existing offline recovery directory before running):

```sh
'/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --factory-startup --python 'C:/Users/user/ai-tools/arpg-art/player-skeleton-archer/recovery-final-20261015T111650/verify-source.py' -- 'C:/Users/user/ai-tools/arpg-art/player-skeleton-archer' 'C:/Users/user/ai-tools/arpg-art/player-skeleton-archer/recovery-final-20261015T111650/source-validation.json'
```

This opens the final offline source read-only, evaluates all render samples, and rerenders only `attack_E_006` into the recovery directory. Never rerun `bake.py` against the protected original output root. For a full independent repack, use a fresh directory, copy the unchanged `frames/` into it, and run `pack-verify.py FRESH_ROOT NEW_NONEXISTENT_KIT --pack`; the destination is deliberately non-overwritable. All original offline paths/files are preserved.
