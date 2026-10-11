# U3 Wolf: reproducible model-based eight-direction delivery

Only wolf is added to the existing runtime registry. No simulation, stats,
collision, telegraph, rewards, UI layout or other monster art changes.

## Exact source and license

`license-evidence.json` binds the individual **P1gU3Qkr9r** Poly Pizza CC0
listing to the 986,712-byte Quaternius Wolf GLB. The full original HTML,
GLB and modified blend live at `C:/Users/user/ai-tools/arpg-art/u3-wolf/source`.
Never infer CC0 from Quaternius's generic current license (QAL).
See `arpg/assets-ledger.md` for URLs, byte hashes and source animation names.

## Bake, pack and verify

1. Verify offline model and HTML SHA-256 against `license-evidence.json`.
2. Copy `../bake.py`, this `config.json` and `verify-source.py` to the offline
   `C:/Users/user/ai-tools/arpg-art/u3-wolf` directory. Run the existing Windows
   Blender 5.2.2:
   `blender.exe -b --factory-startup --python <offline>/bake.py -- <offline>/config.json`.
   Use a fresh output folder if model/camera/material/config changes; no preview
   or stale frame resume is shipped. Source rig is AnimalArmature, mesh Wolf.
3. Run `blender.exe -b --factory-startup --python <offline>/verify-source.py -- <offline>/config.json`.
   This independent evaluator restores authored sparse-channel defaults, samples
   all delivered E clip frames on actual skinned geometry, and verifies anatomical
   head-minus-tail direction in all eight octants. Require `source-validation.json`.
4. From this worktree: `python3 arpg/tools/art/pack.py arpg/tools/art/u3-wolf/config.json --repo . --merge-manifest`.
   Merge mode replaces only configured kit IDs and preserves every other kit.
   Move the generated `tools/art/contact-sheet.png` to the offline directory;
   contact sheets, source PNGs, originals and blend files are not deliverables.
5. Run `python3 arpg/tools/art/verify_atlases.py --only wolf --base arpg/assets/sprites --frames /mnt/c/Users/user/ai-tools/arpg-art/u3-wolf/frames --report /tmp/u3-wolf-validation.json`.
   Require all 576 delivered alpha masks to match exact raw PNGs, no edge clipping,
   eight unique directions for each of five states, nonstatic clips, fixed anchor,
   idle centroid drift <6px, <=2048px sheets, <=1.5MB kit.
6. Run stamp, all `node --test arpg/test/*.test.js`, stamp `--check`,
   `git diff --check`, `node arpg/test/u3-wolf-browser-smoke.mjs` and existing
   `node arpg/test/browser-smoke.mjs`. The focused smoke launches the real index
   through native desktop keyboard/mobile touch, tests 40 frozen wolf state/direction
   pairs per viewport in actual Pixi, and checks intentional offline fallback.
   No screenshot calls. Mobile emulation is not physical-phone proof.
7. Capture `node arpg/tools/art/u3-wolf/host-trace.mjs` before/after the render
   change and compare byte-for-byte: nine S5 scenarios ×900 ticks (three seeds,
   three weapons). Check `git diff -- arpg/js/sim` is empty. Store source,
   delivered, host trace and browser JSON here; commit only scoped files.

## Quadruped verification contract

The approved humanoid camera (40°), Standard lighting/color and ink outline are
reused. A long low wolf becomes optically narrow end-on: measured alpha coverage
3.552–8.508% and minimum end-on bbox width 20px, unlike humanoid 5% area/T-pose
expectations. Quadrupeds therefore require >=512 opaque pixels and >=16px minimum
bbox extent, plus independent skinned motion/anatomical direction proof.
Humanoid area, arm quaternion and bind-pose gates remain unchanged. The wolf's
front-leg quaternion fields retain the legacy metadata key `arm_degrees_from_bind`;
T-pose/bind-frame counters are N/A, not claimed zero. Actual alpha is losslessly
preserved. This is a numerical/source review, not a human visual approval.

## Runtime integration

The wolf registry adds `ATLAS_IDS.wolf='wolf'`. Manifest fetch revalidates via
`cache:'no-cache'`, so a cached pre-wolf registry cannot hide the new kit. Optional per-kit presentation
durations play the full hit clip in 0.15s and death clip in 0.6s, within the existing
0.7s death fade. Other kits retain source fps. Existing lazy loading, animation
priority, host-act elapsed frame selection, entity sizeScale, elite palette,
health indicators, additive hit flash and procedural fallback stay untouched.
Idle 34 / gallop 6 / attack 14 / hit 7 / death 11 frames per direction at 10fps.
The existing monster death fade remains 0.7s; all 11 collapse frames fit before
that fade completes. Shared fade and host timing are not altered.
Boar and spider remain procedural; no skeleton substitution or scope expansion.
