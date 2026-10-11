# U3 Spider — exact CC0 rig / eight-direction combat atlas

Only `poison_spider` maps to the new `poison-spider` kit. Stats, collision,
poison puddles, rewards, UI, host actions and other kits are unchanged.

## Source and provenance

Individual Quaternius model https://poly.pizza/m/yRYJiAJyiM explicitly lists
“Aug 19, 2021 • FBX/GLTF format • Public Domain (CC0)” and links the CC0 deed.
`license-evidence.json` binds the full HTML snapshot and original downloaded
449,008-byte GLB to their SHA-256. The viewer's actual public GLB URL is recorded.
The generic current Quaternius QAL license is NOT used as CC0 evidence.
Originals, full HTML, modified blend, raw PNGs and contact sheet stay offline at
`C:/Users/user/ai-tools/arpg-art/u3-spider`; only WebP/Pixi metadata ship.

Source SpiderArmature / Cube includes Spider_Idle, Spider_Walk, Spider_Attack,
Spider_Death and Spider_Jump. Jump is NOT renamed as a hit. A dedicated local
`U3_Spider_Recoil` bends Body/Head/Abdomen/front legs from evaluated idle stance
at source frames 0/2/5/8 (strength 0/1/.5/0). `config.json` records joint angles.
The recoil retains the actual source mesh and skin; no fixed illustration or
new simulation move. Its action uses Blender fake-user retention so the
independent reopened-blend verifier can inspect it after saving.
The local recoil authorship is separately dedicated to CC0 in the asset ledger.

## Reproduction and gates

1. Verify offline HTML/GLB bytes and SHA-256 against `license-evidence.json`.
2. Copy `../bake.py`, `config.json` and `verify-source.py` to the offline folder.
   With Windows Blender 5.2.2, run
   `blender.exe -b --factory-startup --python <offline>/bake.py -- <offline>/config.json`.
   Use a fresh output folder after any model/config/bake change; final delivery
   uses `frames-v2`, not the initial bake. Do not pack previews or stale frames.
3. Run
   `blender.exe -b --factory-startup --python <offline>/verify-source.py -- <offline>/config.json`.
   Require `source-validation.json`: actual skinned geometry changes in all five
   clips, Head-minus-Abdomen direction matches eight octants, all eight legs
   articulate in the walk clip. Original source hash and local recoil are recorded.
4. From this worktree run
   `python3 arpg/tools/art/pack.py arpg/tools/art/u3-spider/config.json --repo . --merge-manifest`.
   Move generated `tools/art/contact-sheet.png` offline. Other manifest entries
   and atlas files must match the b7f5e6c baseline exactly.
5. Run
   `python3 arpg/tools/art/verify_atlases.py --only poison-spider --base arpg/assets/sprites --frames /mnt/c/Users/user/ai-tools/arpg-art/u3-spider/frames-v2 --report /tmp/u3-spider-delivered.json`.
   Require all 592 delivered alpha masks to match raw PNGs, no edge clipping,
   eight distinct directions for every state, moving clips, fixed anchor,
   idle centroid drift <6px, <=2048px sheets and <=1.5MB kit.
6. Stamp, full `node --test arpg/test/*.test.js`, stamp `--check` and
   `git diff --check`. Run `u3-spider-browser-smoke.mjs`, existing
   `browser-smoke.mjs` and `u3-wolf-browser-smoke.mjs` under `arpg/test`.
   Override `ARPG_CDP_PORT`/`ARPG_HTTP_PORT` for concurrent port conflicts.
   Spider smoke launches real index/S7 using desktop native Enter/J and mobile
   CDP touch, checks actual Pixi textures in all 40 state/direction pairs,
   frozen host inputs, offline procedural fallback and WebGL texture capacity.
   No screenshots. Mobile emulation is not physical-device proof.
7. Compare `host-trace.mjs` outputs before/after byte-for-byte (S7, nine seed/
   weapon scenarios, 900 ticks each), retain the wolf S5 trace regression too,
   and require empty `git diff -- arpg/js/sim`. Commit scoped files only;
   parent performs review, merge, push and deployment.

## Ground-anchor correction (shadow diagnosis)

The final camera transform must be evaluated before `world_to_camera_view` in
`bake.py`. The old `frames-v2` anchor was exported from the pre-fit camera matrix:
`y=0.5740587711334229`, versus the actual rendered origin
`y=0.6975164711475372` (15.8026px at 128px). This placed the runtime shadow above
its intended ground origin. No ground plane or baked shadow exists in the scene;
only `Cube`/`Cube_outline` render, with light shadows disabled.

`ground-anchor-validation.json` records an exact no-render bake reproduction
and independent saved-camera verification across all 592 samples/40 clips.
Run Windows Blender with `--python verify-ground-anchor.py -- <offline>/config.json`
for the read-only geometry proof. Existing WebP pixels, animation timing and
runtime ellipse are unchanged; only spider manifest/sheet anchors are corrected.
The offline `frames-v2/frames.json` retains the historical erroneous anchor.
Do not repack that metadata uncorrected: use a fresh bake with the fixed exporter,
or explicitly apply the recorded correction while preserving those raw pixels.
Other kits are preserved; their smaller anchor discrepancies are not fixed here.
The existing boar preservation gate permits only this exact metadata scalar and
still verifies every historical pixel byte. Parent must stamp the merged index.
Numerical/native-render evidence is not human screenshot approval.

## Arachnid verification — separate from humanoids

Same approved pipeline camera (40°), orthographic framing, Standard color,
warm key/cool rim and ink hull are reused. Thin legs enclose transparent gaps:
spider-specific pixel gates are >=640 opaque pixels and >=32px minimum bbox
extent, paired with independent skin/leg/anatomical direction proof.
Humanoid >=5% area, >10° arm quaternion and >.015 bind-deformation gates are
unchanged. Quadruped gates remain unchanged. Unknown pose profiles fail.
T-pose/bind-frame counters are N/A for this nonhuman model, not claimed zero.
This is numerical/source/native-render verification, not human visual approval.

Idle/walk/attack/recoil/death have 42/9/8/4/11 frames per direction at 10fps.
Recoil plays fully within .15s and death within .6s, before the unchanged .7s
fade. Attack still follows authoritative act elapsed time. Existing entity
sizeScale, elite palette, bars, hit flash, lazy loading and fallback are reused.
