# Weapon art / shield / HUD — local review only

Base: c706b9559f63578df0536ea90fa54bd52761fd4f. No merge, push or deployment authorized for this combined feature.

## Art and firing geometry

Source assets inspected directly (not game screenshots): pistol/SMG/shotgun/potato cannon face left with grips below the bore. The old π rotation inverted the grip; left-aim reflection alone did not normalize right-facing art. Shotgun/cannon/laser/flame angles also vary by tier. Crossbow points southwest; rocket points north.

`data.weapons[id].art` annotates original 256px muzzle center/bore axis for T1–T4. `sim.weaponGeometry` caches immutable tier geometry: normalize raw axis, reflect canonical Y for barrel-left guns, offset bore to the slot's aim axis. Render and simulation share `weaponPose`/tier scale. Left-facing aim reflects canonical Y before aim rotation. Calibrated firing art no longer receives cosmetic pulse/camera sprite enlargement, which previously detached the drawn barrel from authoritative muzzle coordinates. Other weapon art, camera and enemy sizes remain unchanged. Recoil is cosmetic; muzzle flash records the authoritative shot origin. Existing close-target projectile body-origin fallback remains intentional.

Coverage: pistol, SMG, shotgun, rocket, potato cannon, crossbow, laser, flamethrower; six slots, six sampled aim directions, T1–T6. Raw pixel annotations were manually measured from inspected source art; actual Canvas matrices independently confirm those annotations map to the simulated firing origin/axis. This is not a screenshot-based visual review or a claim of subpixel anatomical accuracy of every irregular illustrated barrel.

Stick T1–T4 now uses blunt rounded timber, woodgrain and short bronze/blue/purple/gold leather wraps: no blade/point/crossguard. Shield is round timber with tier rim, rivets and potato crest. `test/generate-equipment-art.py` draws locally at 4× resolution then saves 256px lossless WebP; no AI/API or credentials. Paths unchanged for stick, four appended shield paths. T5/T6 deliberately reuse T4 + existing badge/color. UI/render cache-bust updated.

## Shield contract

Append-only 19th weapon ID `shield`; existing IDs/order/starters unchanged. One normal weapon slot, blunt class, existing narrow-line thrust/bash (90 range), 5 base damage, 1.8s cooldown, 150 knockback, base price30. Existing 1.6^(tier−1) damage and .9^(tier−1) cooldown apply through T6. Existing melee crit/lifesteal/regen rules remain intact; punch sample reused for light impact.

Each equipped shield derives armor `3 + tier - 1` (+3 at T1, +8 at T6), additive per slot, never written into `p.stats`. Blunt set bonuses still apply separately: six T6 shields = 48 equipment +4 set armor, not 48. Removing/merging a slot immediately recalculates defense; merging two shields can reduce total armor in exchange for slot capacity/tier. Stats dialog shows derived total and each shield's tier bonus. No new offhand slot, invulnerability, reflection, special block/heal mechanic or starter changes.

Shop uses the existing dynamic weapon catalogue (gunslinger still excludes melee); tier weights/owner-mean floor unchanged. Buy/recycle/merge/anvil/save/READY/WAVE_START and collection accept shields through existing dynamic ID validation. Existing crates/boss rewards contain items, not weapons; no new weapon-drop mechanic invented. Item T4 cap is unchanged.

## HUD

44×44 settings control immediately follows stats in the HUD. Portrait HUD56 and landscape HUD44 unchanged; landscape HUD width bounds both controls. Panel anchors to button and clamps within field; resize reanchors only an open panel, not camera/simulation. Menu retains a zero-height settings entry above its overlay, without increasing canvas/HUD height. ESC/outside click/focus return and all persisted audio/music/language/orientation controls preserved. Ad loaders remain absent.

## Evidence

- `node --test spudsquad/test/*.test.cjs`: 288/288, no skip/fail (baseline278 + ten tests, including dynamically enumerated shield combat).
- `art-shield-smoke.mjs`: 184 decoded render assets; 5184 actual drawImage/matrix muzzle samples across three viewports, max error0.00001462 canvas px (native transform precision, tolerance0.001); bore error <1e−6 radians. Decoded shield/stick alpha pixels, actual shop purchase/T5→T6 merge, stats +8, reload +11, preferences/focus/bounds pass. Screenshots0, remote writes0.
- Existing `vnext-browser-smoke.mjs` and `perf-ads-smoke.mjs` pass: level/price/save/ult/boss/UI regressions and ad count0.
- Canvas heights390×844=732, 844×390=334, 320×568=456: equal to deployed baseline.
- Fixed 4-player/150-enemy/90-tick/DPR2/CPU4× software-headless replay, one T6 shield per build: same authority/RNG/1380FX using identical current simulation and baseline-vs-new renderer. Draw p50/p95 6.8/11.4→6.7/10.8ms; frame p95 82.6→77.2ms; draw skips/errors0. Single-run noise, not real-phone FPS or a general speedup guarantee.
- `shield-balance.cjs`: 20 seeds × W1/W21 × T1/T6 × one/six shields, fixed stationary builds, regen0, contact enemy HP1e6, 90s bound. All160 take positive damage and die; no stored armor accumulation/healing. Six T6 include existing blunt maxHP/armor set. This is a bounded defense smoke, not an all-build immortality proof, human balancing acceptance or full natural-wave growth evaluation.

External evidence retained under workspace `tmp/spud-art-shield-evidence/`: red/green/unit/browser logs, source/new art contact sheets, performance JSON and 160 balance samples. Production remains c706b95; release requires user approval.
