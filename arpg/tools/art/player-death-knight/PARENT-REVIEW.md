# Parent acceptance gate — not registered, not visually approved

## Technical evidence available

- Final actual saved/reopened Blender 5.2.2 source: 41-joint credited CC0 rig, 8 preserved-coordinate skinned base meshes, 56 new project-authored objects (including 7 flame meshes), 57 outline hulls. All 480 delivered poses reevaluated from saved source independently of generator. Blade grip follows `handslot.r` within .0001 world units; horizontal root stays in place.
- All six clips have independently measured evaluated-body motion; real `Dodge_Forward` skin RMS from first sample is .2784548 world units, not run/idle alias. Flame shape values change from reopened source; red/orange emissive material colors survive without neutralization. Outline parent/vertex counts/expansion checked.
- `attack_E_006` rerender from reopened source is exact RGBA against original source PNG. All source and physical masks have nonempty alpha and no boundary clipping. Source opaque coverage 5.12695–10.27222%; physical 5.13916–10.23560%, both relative to full untrimmed canvas.
- 480 frames: per octant 13 idle / 10 run / 13 attack / 8 hit / 10 death / 6 dodge. All 48 groups nonstatic; each state's initial octant images are unique.
- One 1024×1692 WebP, 729,494 compressed image bytes. Total delivery incl metadata/descriptor 838,415 bytes. Base decoded RGBA 6,930,432 bytes = 6.609375 MiB; soft8/hard12 met. Not real GPU telemetry; no mipmap/driver overhead claim.
- Shipped Pixi8.22.0 CPU Spritesheet parser checks all textures, physical128/logical256, scale .5, trim and anchor. No group fragments: all 48 groups belong wholly to the one page; actual Object.assign-like merge preserves every indexed chronological group.
- Real `.4s` Dodge_Forward inclusive endpoint is delivered as 6 samples, with descriptor `.2s` presentation retime. Actual shipped `atlasFrame` gives `0,1,2,3,4,5,5` at `0..6/30` seconds. Runtime reset/mapping and run-mask removal are NOT implemented here.
- 2,911 original reference/source/atlas files SHA256-preserved. No manifests/runtime/simulation/network/save/stamps edited.

## Inspect these actual model renders with view_image

All relative to this directory:

1. `review/actual-size-128.png` — full six-state/eight-direction actual physical-size grid.
2. `review/front-side-back-attack-dodge-phases-128.png` — complete front/side/rear idle, attack and forward-dodge sample sequences at physical size.
3. `review/source-256.png` — original source-size pose grid, not an illustration.
4. `review/fixture-attack_E_006.png` — independently reopened source fixture.

Offline `preview-full/attack-dodge-{S,E,N}.gif` also provide actual model animation review. Editable final source: `C:/Users/user/ai-tools/arpg-art/player-death-knight/source/player-death-knight-source.blend`; hash in `evidence/offline-source-bindings.json`.

## Remaining acceptance/integration

Parent owns artistic acceptance: original identity, black armor/skull-helm silhouette, fit/intersections, outline cleanliness, red eye/orange flame legibility, attack grip/arc and back-facing readability, dodge forward intent and actual-size legibility. Mathematical attachment/framing checks are not artistic approval or proof of absence of every mesh intersection. No browser/native Pixi renderer or gameplay placement test was run in this art-only unit; standalone preview exists for that follow-up.

After approval only: minimally register and bind the DeathKnight form; retain simulation-owned movement and authoritative 200ms dodge, remove run masking only for this six-state kit, test startedTick resets/final endpoint/frozen/terminal behavior and unchanged gameplay/save/network bytes. Base skeleton dodge art remains separately absent/out of scope. No push/deploy/shared-manifest/shared-configuration/install/network/paid-service action was performed.
