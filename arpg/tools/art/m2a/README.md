# M2a graveyard monsters — unplaced content

Ghoul / ghost / giant bat use the existing Windows Blender 5.2 bake and WSL WebP/Pixi pack pipeline. No stage, loot table, sim/net, renderer or index changes. Parent owns index stamping, merge and deployment.

## Sources and attribution

- **Ghoul**: [Animated Zombie by Quaternius](https://poly.pizza/m/jkrEvQZb8J), **CC BY 3.0**, [license](https://creativecommons.org/licenses/by/3.0/). Required credit: “Animated Zombie by Quaternius (Poly Pizza), CC BY 3.0; modified: neutral material sprite bake and local rigged calm-idle/recoil/death.” Retain this credit, asset ledger and full bundled legal code in distribution.
- **Ghost**: [Ghost by Quaternius](https://poly.pizza/m/Iip30bDHmu), individual page **Public Domain (CC0)**. Pale albedo overrides, all five native flying/punch/hit/death clips retained.
- **Bat**: [Bat by Quaternius](https://poly.pizza/m/hNO9XvjlKa), individual page **Public Domain (CC0)**. Native winged flight/attack/hit/death; run is a full-cycle time-scaled flight copy, not a renamed hit/death. Neutral fur and fixed offline 3D lift of 3 units place idle skin above world ground.

`license-evidence.json` binds original GLB and original individual-page HTML SHA-256. Page license extracts and full legal text are bundled. Raw/prepared GLBs, blends, PNGs and contact sheet are outside checkout in `C:/Users/user/ai-tools/arpg-art/m2a/`. No runtime hotlinks. The unrigged Ghoul by joney_lol was rejected; generic current Quaternius QAL is not used as license evidence.

## Reproduction

1. Download only the exact GLB URLs recorded in license evidence; confirm `glTF` binary magic and hashes. Keep originals and archived page HTML unchanged.
2. Windows Blender: `blender.exe -b --factory-startup --python prepare-source.py -- C:/Users/user/ai-tools/arpg-art/m2a/source` (absolute Windows script path). This retains the full native idle timeline at half local-motion amplitude (avoiding broad idle lurch without weakening the 6px drift gate), authors ghoul recoil/death on the original rig and a time-scaled bat flight copy, exports prepared GLBs and `preparation.json`.
3. Copy current shared `../bake.py` and this `config.json` to the offline directory. Windows Blender: `blender.exe -b --factory-startup --python bake.py -- config.json`. For a final full run omit `--only`; delivered subset runs here cover every configured kit. Ghoul uses a fixed 9% envelope margin (the existing per-job framing option, no coverage gate relaxation) and samples complete source timelines at **6fps**, not shortened clips; ghost/bat at **10fps**. This avoids six high-memory ghoul sheets while retaining all five actions and eight directions. Optional per-job FPS defaults to the unchanged global FPS for all existing jobs.
4. Reopen saved blends with `verify-source.py -- config.json`. Require real skinned motion in all five clips, anatomical facing dot >.9 in every octant, four moving bat wing joints, idle bat vertices above ground, analytical fixed-ground anchor error <.001px in every delivered sample. Bat Root translation is constant; its non-axis-aligned local axes are not falsely zeroed. Small BodyRoot flight/recoil offsets remain authored.
5. `python3 arpg/tools/art/pack.py arpg/tools/art/m2a/config.json --repo . --merge-manifest`. Only configured kits are replaced. Full clip source FPS becomes Pixi/manifest FPS; local WebP lossless alpha, <=2048px sheets and <=1.5MB/kit remain mandatory. Raw contact sheet goes to the offline frame parent, never checkout.
6. Copy offline `source-validation.json`; run `python3 arpg/tools/art/m2a/verify-delivery.py --repo .`. It calls shared alpha/pose verification and measures centroid-aligned, unscaled mask XOR for three species pairs × five states × eight directions × three phases. It also compares every unique delivered species mask pair with bitset XOR and rejects any exact inter-species collision. No empty or identical species silhouette is accepted. Every one of the 120 species/state/octant clips must also contain more than one distinct centroid-aligned alpha mask: advancing frame indices or changing colors alone cannot satisfy animated silhouette proof. For flapping wings, whole-silhouette bbox sweep is recorded separately: idle stability uses the independently projected Body/Head core (<6px), not a wing-tip bbox whose vertical extrema alternate through flight. Humanoids retain their original <6px silhouette-bbox drift gate. Existing humanoid coverage/quaternion/bind gates remain intact; winged/floating profiles require independent skin/anatomy proof.
7. Run `host-trace.mjs` identically before/after; compare all 24 existing stages × seeds 1/42/999 × blade/bow/focus ×900 ticks. `verify-main.mjs <baseline git-archive directory> fef289f` proves original content, identity/atlas helpers, all prior sprite bytes and forbidden files unchanged.
8. `ARPG_CDP_PORT=19951 ARPG_HTTP_PORT=8971 node arpg/test/m2a-graveyard-browser-smoke.mjs` uses native Enter/J and mobile touch, existing debug extension → real host spawn, frozen state inputs, loaded Pixi clips and offline fallback. Count Runtime exceptions, Log errors and console.error; require 0. Save JSON as `browser-validation.json`. No screenshots.
9. `node --test arpg/test/*.test.js`; only parent-owned stale stamp may fail. `git diff --check`, JS syntax and replacement-character checks before committing. No push/deploy.

## T4 balance proposals / integration limit

- Ghoul: HP **225** = warrior 150 ×1.5; poise100 (+25), speed82 (−36), kbResist.65, goblin_slash, keepRange40–70, undead.
- Ghost: HP **60** = mage40 ×1.5; poise20, speed110, sling_stone, keepRange230–330, undead. HP below tank; no new projectile simulation.
- Bat: HP **75** = rogue50 ×1.5; poise20, speed190 (+40), goblin_hop + goblin_slash, keepRange110–180, beast.

All role-matched HP ratios lie in the requested 1.3–1.6 range. No heavyPoise flag was added. Definitions can debug-spawn and animate, but are **not hunt-ready** until U5 places stages and supplies loot: `rollDrops` intentionally rejects all three new IDs. Smoke does not claim kill/loot settlement or physical-mobile performance/visual human approval.
