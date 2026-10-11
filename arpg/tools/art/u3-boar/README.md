# U3 Iron Boar — model-based armored quadruped

Only `iron_boar` maps to `iron-boar`; no simulation, UI, collision, stats,
rewards, stage or performance policy changes. All nine prior kits/manifest
entries are preserved byte-for-byte against f3a6100.

## Exact source / authored additions

Quaternius Pig https://poly.pizza/m/u35l6uP5vj individually lists
“Nov 15, 2023 • FBX/GLTF format • Public Domain (CC0)” and the CC0 deed.
The actual viewer request is recorded in `license-evidence.json`. Original
300,940-byte GLB and full HTML (with SHA-256) remain offline under
`C:/Users/user/ai-tools/arpg-art/u3-boar/source`. The current generic
Quaternius QAL page is NOT license proof. No paid API or runtime hotlink.

Pig mesh / AnimalArmature supplies Idle, Run, Headbutt and Death. Idle uses
source frames 0–80 (one returned-to-neutral look cycle), rather than both
left/right look cycles in the full 0–160 source clip: full-source end-on
centroid drift was 9.5px; delivered drift is 4.743px without relaxing the
<6px gate. Original GLB is unchanged. Run/headbutt/death are original clips.

There is NO original hit clip. `U3_Boar_Recoil` is locally authored on the
original skin/rig at 0/2/5/8 with strength 0/1/.5/0, exact bone angles in
config. Jump is not substituted for hit. Recoil has fake-user retention and
is inspected after an independent saved-blend reopen.
Three original faceted iron arch plates attach to Body; two curved ivory
tusks attach to Head. Both accessory geometry and local recoil are dedicated
to CC0 1.0 by cocy/Untitled's local pipeline. They are not external armor.
The 40° orthographic camera, warm key/cool rim, Standard view, ink hull and
existing runtime boar/elite tint are retained; no new game art style.

## Reproduction

1. Verify `license-evidence.json` against original GLB/full HTML hashes.
2. Copy `../bake.py`, `config.json`, `verify-source.py` to the offline folder.
   Run Windows Blender 5.2.2:
   `blender.exe -b --factory-startup --python <offline>/bake.py -- <offline>/config.json`.
   Final source PNGs are `frames-v2`; never pack the initial full-idle bake.
3. Run independent Windows Blender:
   `blender.exe -b --factory-startup --python <offline>/verify-source.py -- <offline>/config.json`.
   Require all five skin clips, four leg joints, anatomical Head-minus-Body
   eight-facing vectors and five actual moving bone-parented accessories.
4. `python3 arpg/tools/art/pack.py arpg/tools/art/u3-boar/config.json --repo . --merge-manifest`.
   Move generated `tools/art/contact-sheet.png` offline. Only WebP/Pixi JSON ship.
5. `python3 arpg/tools/art/verify_atlases.py --only iron-boar --base arpg/assets/sprites --frames /mnt/c/Users/user/ai-tools/arpg-art/u3-boar/frames-v2 --report /tmp/u3-boar-delivered.json`.
   Require 488 alpha matches, no edge clipping, 8 unique directions per state,
   nonstatic clips, constant anchor, <6px idle drift, <=2048 sheets, <=1.5MB.
   Boar uses a separate source-proof profile with the same pixel floors as
   quadrupeds (512 opaque pixels / 16px minimum extent); humanoid, wolf and
   spider gates are unchanged. Unknown profiles still fail.
6. Stamp, full `node --test arpg/test/*.test.js`, stamp `--check`, `git diff --check`.
   Run `u3-boar-browser-smoke.mjs`, `u3-wolf-browser-smoke.mjs`,
   `u3-spider-browser-smoke.mjs` and `browser-smoke.mjs` under `arpg/test`.
   Port overrides: `ARPG_CDP_PORT=9393 ARPG_HTTP_PORT=8823`.
   Boar smoke uses actual index/S3, native desktop Enter/J and mobile CDP touch,
   40 live Pixi state/direction cases per viewport, actual clip advancement,
   frozen host inputs, intentional offline fallback and active WebGL capacity.
7. Compare boar S3, wolf S5 and spider S7 `host-trace.mjs` before/after separately:
   nine seed/weapon scenarios ×900 ticks each. Do not label S7 traces as S5.
   Check no sim/content diff and verify the preservation file hashes.

## Delivery and limits

34/7/7/4/9 idle/run/attack/hit/death samples per direction at 10fps:
488 frames, 453,624 bytes including JSON; 2048×1920 and 2048×2048 sheets.
Coverage 5.560–10.596%, all alpha exactly matches Blender PNGs.
Existing attack elapsed-time selection stays authoritative. Full recoil/death
fit .15s/.6s presentation windows, before unchanged .7s shared death fade.
Source/geometry/alpha/DOM/native evidence only: no screenshots, no human
visual approval and no physical-phone claim. Parent reviews/pushes/deploys.
