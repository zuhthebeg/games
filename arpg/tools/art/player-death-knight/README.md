# Original DeathKnight — unregistered art candidate

Art-only fork of `8c2b156`. **Parent visual/source review and later runtime binding are required.** Nothing here registers a kit, changes stats/simulation/save/network code, updates manifests/stamps, or deploys.

## Authorship

New project-authored geometry: articulated obsidian cuirass/chevrons, separate shoulder plates/fins, vambraces/gauntlets/thighs/greaves/boots/toes/hip plates, split skull visor with red eyes, sagittal crest/temple guards, new blade/guard/grip/ember channel and seven animated flame tongues. Shapes are independently constructed in `weapon.py`; no Lineage model, texture or traced silhouette is used.

The preserved skinned anatomical body, 41-joint skeleton/weights and six source clips are **Kay Lousberg / KayKit Skeleton_Warrior, CC0**, not wholly original rig/body/animation. Imported helmet, cloak and props are removed. Base skull/eye materials become dark recesses under the new mask. See `provenance.json` and `LICENSE-KayKit.txt`. Existing generic/archer project bake/packer/parser patterns were deliberately adapted; no old archer configs are executed.

## Sources and review files

Offline Windows root: `C:/Users/user/ai-tools/arpg-art/player-death-knight` (WSL `/mnt/c/Users/user/ai-tools/arpg-art/player-death-knight`).

- `source/player-death-knight-source.blend`: final editable compressed source, all six real actions, bone-attached original geometry, persistent keyed flame shape animation, constant horizontal root/hips drivers, outlines/camera/lights.
- `checkpoint-v1/`: preserved earlier actual saved/reopened source, 27 renders and preview/verification. This is an earlier design checkpoint, not the final model.
- `frames/player-death-knight/`: full 256-square transparent source renders, `frames.json`.
- `preview-full/`: actual-size128 contact/phase sheets, source256 sheet, front/side/back attack+dodge GIFs.
- Repository `review/`: copied final actual-render contact/phase sheets and source fixture for parent `view_image`; these are not screenshots or stand-alone concept art.
- Repository `evidence/`: source-reopen, packing, frame/mask/provenance evidence. Editable .blend/raw full sequence stay offline, not in web sprite delivery.

## Reproduction (existing installed Blender 5.2.2 only)

Copy this namespace's `bake.py`, `weapon.py`, `verify-source.py`, and `config.json` into the NEW offline root's `pipeline/` directory. Copy config also to root/config.json. Never point these at U1/archer or their source outputs. Config contains only this new Warrior job. Existing offline paths are the delivered reproducible job, not a reusable skill.

```sh
BLENDER='/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe'
"$BLENDER" -b --factory-startup --python C:/Users/user/ai-tools/arpg-art/player-death-knight/pipeline/bake.py -- C:/Users/user/ai-tools/arpg-art/player-death-knight/pipeline/config.json --checkpoint
# Preserve checkpoint before full bake in this same NEW namespace.
"$BLENDER" -b --factory-startup --python C:/Users/user/ai-tools/arpg-art/player-death-knight/pipeline/bake.py -- C:/Users/user/ai-tools/arpg-art/player-death-knight/pipeline/config.json
"$BLENDER" -b --factory-startup --python C:/Users/user/ai-tools/arpg-art/player-death-knight/pipeline/verify-source.py -- C:/Users/user/ai-tools/arpg-art/player-death-knight
python3 arpg/tools/art/player-death-knight/pack-verify.py /mnt/c/Users/user/ai-tools/arpg-art/player-death-knight NEW_NONEXISTENT_DELIVERY_DIR --pack
node arpg/tools/art/player-death-knight/verify-pixi.mjs NEW_NONEXISTENT_DELIVERY_DIR
```

The new-directory-only packer refuses overwrite. Final fixture is rerendered from reopened source without executing the generator; RGBA must exactly match source render `attack_E_006`. `verify-artifacts.py` accepts offline root, kit path, preservation inventory and output report. The inventory records originals before authoring; its absolute paths are this machine's evidence, not portable inputs.

## Animation and delivery contract

480 actual frames, 48 complete state/direction groups. Per direction idle13/run10/attack13/hit8/death10/dodge6. Eight existing octant conventions and 40° orthographic style, one envelope/ground anchor over every delivered pose, including outlines and flame geometry; no frame-dependent camera fit.

Dodge uses actual **Dodge_Forward** source `.4s`, inclusive source frames `0,1.92,3.84,5.76,7.68,9.6`, not a run/idle alias. Descriptor `animation_durations.dodge=.2` is presentation-only retime. The shipped `atlasFrame` is tested at 30Hz ages `0..6/30`: frames `0,1,2,3,4,5,5`, making the full source endpoint reachable before 200ms. Caller must reset age on `startedTick`; current normal-game run-masking is intentionally untouched. No new base-skeleton dodge is supplied.

Physical128 / logical256, Pixi `meta.scale='.5'` means actual source resolution `.5` (logical expansion2). Cropped frames retain original trim/anchor. Entire indexed/sorted state-direction groups stay on one page: simulated `Object.assign` merge and actual shipped Pixi CPU parser verify no fragments/duplicates. WebP alpha is lossless against original physical masks. Transfer and decoded base-RGBA allocation are measured separately in evidence; this is not live GPU telemetry and excludes mipmaps/driver overhead.

`preview.html`/`preview.mjs` provide standalone local Pixi playback, not gameplay integration. No browser/native renderer test or aesthetic approval is asserted by this unit. Parent must inspect front/side/rear, attack grip/arc, forward-dodge phases, flame readability, actual-size silhouette, fitting and outlines before registration.
