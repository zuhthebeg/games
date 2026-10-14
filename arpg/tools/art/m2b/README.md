# M2b — implemented local kits; parent visual review / placement / release pending

Baseline `0c64a94f2a11420309c2ceaa03bfa0180d42cae8`; original checkpoint `e0078e22cc8aa53cbd6e8359f08e61a6c729771b` remains an ancestor and is **source preflight only**. Its immutable `preflight-validation.json` deliberately records historical BLOCKED/null loads, not current behavior. The parent subsequently authorized exactly `demon:'demon'`, `goleling:'goleling'`, `slime:'slime'` in `atlas-state.js`. Current evidence is **`registration-validation.json`**, with real manifest/sheet metadata loading and unchanged baseline files. No renderer function, atlas-library/atlas-visual, sim/net/index, stage, loot, economy, GUI or succubus edit.

## Sources and derivative work

Individual Quaternius CC0 pages: Demon https://poly.pizza/m/LnfIziKv4o ; Goleling https://poly.pizza/m/71gomWolax ; Green Blob https://poly.pizza/m/y4kJh8EeYS . Exact HTML/GLB hashes, individual Public Domain (CC0) excerpts, author and changes: `license-evidence.json`; full `LICENSE-CC0-1.0.txt` bundled. Unmodified original HTML/GLBs remain `C:/Users/user/ai-tools/arpg-art/m2b/source/`. No generic pack-license inference or primitive-character substitution. Mimic remains rejected/unrigged and unregistered.

The local M2b `bake.py` is an isolated copy of the unchanged shared pipeline. Differences: hold each imported Root's **authored first-idle horizontal values**, preserving Demon's offset-rest cancellation; keep configured source albedos; fit the original one-joint Trident evaluated affine mapping (including parent/inverse bind), turn its principal shaft upright at idle, position 30% shaft height at original Middle1.L grip, retain that exact source mesh/skin; include Trident projected bbox evidence. No generated primitive operation is used for these jobs. Demon fixed world-Z lift .10, slime .012; source `.blend` includes the derivative geometry/materials/camera and five native actions. Native sparse defaults, outline, full-envelope fit and fixed camera/ground anchor retained. Shared `../bake.py`, `../verify_atlases.py`, `../pack.py` are byte-unchanged.

All native source timelines are sampled at **6fps**, **128px**, **8 octants × idle/run/attack/hit/death**: Demon Idle/Run/Weapon/HitReact/Death (192 frames); Goleling Flying_Idle/Fast_Flying/Headbutt/HitReact/Death (208); Slime Idle/Walk/Bite_Front/HitRecieve/Death (176). No relabelled hit/death or source-range truncation. End samples follow the existing pipeline's half-open source interval, not an invented extra endpoint. Contact, 1:1 gameplay-size with ground markers, 3-phase grids and all-octant GIFs are in workspace `tmp/arpg-m2b-preview/`. Investigative `source-initial-*`, `source-v2-*`, `bat-goleling-initial.png` are stale, not final art.

Goleling's floating round head/body, no dangling bat legs, curved continuous wings and headbutt are distinct from the preserved bat's tall ears/long torso/legs/angular wings in decoded previews. `delivered-validation.json` measures all 120 same-state/octant/phase alpha comparisons without scaling or color. This is supporting evidence, **not parent artistic approval**. Slime facing is independently measured from actual eye vertices against Head. All 120 native clips have changing centroid-aligned alpha silhouettes, not just different frame indices/colors. Reopened blend verifies native skin movement, octant anatomy, four proximal wing joints, fixed ground projection and Trident joint-local invariance/grip.

## Reproduce with existing tools, no install/config change

```sh
set -e
# Worktree root. Keep each source download/archive hash unchanged.
cp arpg/tools/art/m2b/{bake.py,config.json,verify-source.py} /mnt/c/Users/user/ai-tools/arpg-art/m2b/
'/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --factory-startup --python 'C:/Users/user/ai-tools/arpg-art/m2b/bake.py' -- 'C:/Users/user/ai-tools/arpg-art/m2b/config.json'
python3 arpg/tools/art/pack.py arpg/tools/art/m2b/config.json --repo . --merge-manifest
'/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --factory-startup --python 'C:/Users/user/ai-tools/arpg-art/m2b/verify-source.py' -- 'C:/Users/user/ai-tools/arpg-art/m2b/config.json'
cp /mnt/c/Users/user/ai-tools/arpg-art/m2b/source-validation.json arpg/tools/art/m2b/source-validation.json
python3 arpg/tools/art/m2b/verify-delivery.py --repo .
python3 arpg/tools/art/m2b/preview.py . /home/cocy/.openclaw/workspace/tmp/arpg-m2b-preview
node arpg/test/m2b-monsters-browser-smoke.mjs > arpg/tools/art/m2b/browser-validation.json
node --test --test-reporter=tap arpg/test/*.test.js
```

`verify-preflight.mjs` independently imports the baseline combat/identity archive under `tmp/arpg-m2b-baseline` (create with `git archive 0c64a94 arpg/js package.json | tar -x -C ...`), compares exact baseline bytes except four authorized append-only runtime files, hashes original sources, and compares before/after host traces in workspace tmp. Generate the baseline trace with the unchanged `m2a/host-trace.mjs` **before** additions, and the same script after additions; committed `host-trace-{before,after}.json` retain all **27 stages × 3 seeds × 3 weapons × 900 ticks = 243 runs**. Fresh hash/digest comparisons are in `registration-validation.json`. Original 310 other runtime/art/vendor/index files byte-identical; original combat/identity entries and all old manifest entries/sprites preserved. Original dirty games `.gitignore`/`package.json`/`wrangler.jsonc` SHA-256 preserved independently.

Historical tests only gain explicit three-new-ID exceptions/enumerations: old AV1 monster definitions still exact, B1 19,800 old drop cases/digest unchanged, C1 nine 1,000-seed baselines unchanged, U1/M2a old art/definitions still exact, content CLI expects22 instead19. U5 original-art diff now uses explicit repository cwd (preventing a vacuous arpg/ relative-path check), allows only the new M2b tool/kit directories and append-only manifest, and still compares every original manifest entry. M2b tests verify those exceptions independently; no skip or blanket preservation bypass. Parent-owned index stamp deliberately remains unchanged: the single stamp test must fail until parent stamps the three updated JS entries before release.

## Memory and native limitations

Full decoded RGBA formula is `sum(sheet_width*sheet_height*4)`, including blank sheet capacity: **Demon 2048×1536 =12MiB; Goleling 2048×1664 =13MiB; Slime 2048×1408 =11MiB**. Each <=16MiB target / <=20MiB hard maximum. Simultaneous new three kits =36MiB, **not total application GPU usage**; exclude mipmaps/driver overhead/old active textures/CPU decode copies. Runtime native proof reads actual loaded Pixi Texture-source sizes on desktop1280×800 and emulated mobile390×844, real host debug spawns, native keyboard/touch controls, 240 frozen state/octant samples, clip motion, deliberate offline procedural fallback, console/log/runtime errors0, active WebGL context. Headless SwiftShader/emulated mobile is **not a physical phone, hardware VRAM/FPS benchmark, WAN or visual human review**. No screenshot captured.

## Gameplay boundary

Three new hostile archetypes/identity keys use existing abilities only. Proposed local stats: demon225HP/105speed/75poise/goblin_slash; goleling90HP/155speed/35poise/goblin_hop+goblin_slash; slime150HP/75speed/55poise/wolf_bite. White tint preserves authored colors. No heavyPoise or new combat mechanic. **Unplaced, no drop tables: rollDrops rejects all three.** XP fields are unplaced proposals, not a reward/economy rollout. Parent owns artistic decision, balance/placement/drop follow-up, stamp, integration and deployment. No push/deploy/Codex/childspawn/reset/stash/install/newcost/config edit performed.
