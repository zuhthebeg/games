# Throne forecourt dragon (TD1)

Independent, immediately unlocked **왕좌의 수호룡** test challenge. S1 training and the twenty campaign stages/requirements remain unchanged. Normal route: 월드맵 → 왕좌 앞뜰 · 시험 도전 → TD1 → 출정. No debug URL is required. Solo threat-1 HP is 770 after the existing global ×0.7; recommendation Lv4 and balance remain provisional.

## Original source and clips

Project-authored derivative of `../original-dragon/generate.py`, preserving the approved original copper geometry/materials (four grounded legs, long neck/snouted head, curved tail, two membranes, 91 meshes). No imported model, external texture, paid API, or new third-party license claim. Legacy gargoyle and S1 original atlas/source remain byte-identical.

New kit: 320px, 504 frames, 8 directions, WebP sheets 1920px maximum. `breath`, `stomp`, `tail` each have 12 phase-authored poses: frames 0–5 anticipation, 6 locked cue, 7–8 active attack, 9–11 recovery. Breath retracts/lowers neck; stomp lifts the two forelegs then plants them; tail coils and sweeps. `dragon-presentation.js` maps authoritative phase timing, including guest snapshots, to those poses. Render-only flame ribbons, impact rings, rear arcs and label:value cues complement the exact hit telegraphs; they never apply damage.

Source camera fit: 8.1029291153 vs S1 7.9643383026. Display scale 1.4650580478 compensates for the 320/256 frame sizes and camera fit, yielding **1.5×** the original S1 base silhouette (before S1's existing ±10% random size). Collider 48px vs training base 32px. Higher-resolution multi-attack kit is separately capped at 4MB, actual 3,561,536 bytes at quality85; every older kit retains its 1.5MB test cap and lazy-loading behavior.

## Rebuild in an isolated checkout

1. Copy this `generate.py`, `verify-source.py`, `config.json` to `C:/Users/user/ai-tools/arpg-art/throne-dragon/`.
2. Run Windows Blender5.2 `--background --factory-startup --python C:/Users/user/ai-tools/arpg-art/throne-dragon/generate.py -- C:/Users/user/ai-tools/arpg-art/throne-dragon/config.json`.
3. Run `python3 arpg/tools/art/throne-dragon/pack.py arpg/tools/art/throne-dragon/config.json --repo "$PWD" --merge-manifest`. An explicit isolated checkout is required; never use the dirty main checkout.
4. Run Blender with `verify-source.py` and that config, then `python3 arpg/tools/art/throne-dragon/verify.py`. Checks all 504 actual source/atlas alpha crops, constant projected ground anchor, no clipping, animation and distinct directions, stationary idle paws, preserved S1/legacy files.
5. `node arpg/tools/stamp-assets.mjs`; `node --test arpg/test/*.test.js`; run `throne-dragon-browser-smoke.mjs`, `throne-multi-browser-smoke.mjs`, and existing `d0-dragon-browser-smoke.mjs` under `arpg/test/`. Browser tests use native input and read-only `__arpg`, no screenshots or host writes. Native solo fixture is a validated Lv12 geared meta save to observe all attacks safely; it is not a claim of starter balance or physical-device performance.

Generated `.blend`/RGBA source frames and PNG reference sheets are outside web root in `C:/Users/user/ai-tools/arpg-art/throne-dragon/`. `validation.json` and `source-validation.json` record actual output evidence, not a substitute for rerunning validation after source changes.

## Combat/rewards and integration gate

All three use existing host act machinery/one hit per target, independent cooldowns, substantial lock/recovery, and normal dodge iframes. Minimal additive sim support: `core.js` optional shape-facing rotation; `world.js` optional stage arena resize and monster ability aim rotation. Tail rotates its body away at windup start and commits to the rear sector; no retargeting during lock/active/recovery.

Rewards use existing tier-1 ordinary drop stream with explicit reward rank4, 12–18 base gold, existing scrap/fang, 260 first-clear XP/65 repeat stage XP and normal consumable/death/settlement rules. No top-tier/boss-guaranteed new farming reward, new currency, claim endpoint, migration or campaign unlock. Kill journal/budget protections remain unchanged.

**No merge/push/deploy from this branch. Parent must obtain separate authorized sim review before integration**, inspect the two sim files and regression digests, then rerun tests/stamps and native checks against the integrated HEAD. BroadcastChannel two-document proof does not assert production relay or physical-phone verification.
