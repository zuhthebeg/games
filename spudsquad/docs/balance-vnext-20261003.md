# Integrated balance vnext — verified scope and limits

Parent source: `4e5c052` (level prices, boss gem, compact settings), itself based only on deployed `3886195`. No `6fc95ff` / `f44581e` merge. A single Sol6.1 writer recovered the preserved dirty worktree; binary patch, 25-file archive and manifest are outside this repository at `tmp/spud-vnext-recovery/20261003-180938-*`.

## Gameplay contract

- XP thresholds: `ceil(old integer threshold * 1.25)`; existing character XP factors retained. Old saved level, XP, stats, items and locked offers are grandfathered, not recalculated. Levels themselves grant no new automatic stats.
- Enemy HP/damage boost ramps linearly from baseline at W1 to +15%/+10% at W20, then stays at those multipliers. Counts, speeds and solo220/multi150 caps are unchanged. This deliberately replaces the initial constant early boost: the W2 blob became13.064HP against the starter pistol's12 damage (baseline11.36), turning a one-shot kill into two shots and reducing income and growth. Final W2HP11.449684 preserves that threshold. Archived initial code fails both new early regressions; final code passes them. XP slowdown, item inflation, strict weapon offers and late difficulty are not relaxed.
- Endless W20+ requires one actual boss kill every wave; elapsed timer alone cannot advance. Normal W20 still wins. Late multipliers replace, rather than compound with, old1.10/1.06: HP `2 * 1.18^min(80,max(0,w-20))`, damage `1.5 * 1.12^min(80,max(0,w-20))`, from W20. W100 stats remain finite. One cap slot is reserved until a required boss actually spawns; full legacy caps retry without falsely marking spawned. All-dead loss still terminates; old erroneous absent-boss saves repair, killed bosses do not respawn.
- Weapons are T1–T6 in real damage/cooldown, merge, full-slot matching purchase, anvil, debug, saved loadout, READY and subsequent WAVE_START. T7/malformed new READY weapons are rejected; no authority rewrite. T5/T6 deliberately reuse T4 art with separate orange/teal tier colors, labels and beam colors, never request nonexistent T5/T6 assets. Items and level-up grades remain separately capped at4.
- New weapon quotes use owner-local held-weapon arithmetic mean, default1 when empty. Minimum tier is `min(6,floor(mean)+1)`; mean6 is the only non-superior exception. Offset weights80/16/3/.8/.2 normalize over remaining tiers. Existing frozen/locked quotes remain legal and are not silently repriced. Full inventories still require explicit existing merge/recycle actions; there is no silent replacement.
- Item rarity is selected before catalogue entry:75/20/4.5/.5 normalized over eligible tiers (W1:T1, W4:T2, W8:T3, W10:T4). Luck0–100 adds at most2× upper-tier weight; higher or negative luck clamps. Unique/max exclusions remove exhausted tiers from sampling. Boss reward floorT2 overrides normal early gate and never falls toT1. Existing boss metadata, queue refresh persistence, final-win auto-settlement and ordinary two-crate budget remain intact.
- Parent level-price contract remains items-only `1+.05*(owner.lvl-1)` after original wave quote and existing multipliers, final ceil. No weapon/locked quote reprice or account-gold changes.

## UI and rendering

- Compact settings retains wallet56px + safe-area reservation; portrait HUD89→56px adds33px canvas. Controls and saved audio/language/shake preferences remain available. No page GTM loader, ad DOM or ad-provider request; central GTM/shared wallet/server settings are untouched. Cloudflare-managed analytics beacon can still be injected by the edge; it is not an ad or a source change.
- Ultimate is synchronously hidden outside combat, remains disabled after use/death, resets once per next wave. All15 character descriptions in Korean/English/Traditional Chinese describe actual radius, instant damage, durations and modifiers. New cosmetic geometry is immutable per-character, bounded to4 simultaneous casts, no new particle emitter/filter/shadow. Ghost veil follows owner; chill visuals do not imply repeated damage.
- Item presentation classifies benefits/penalties from mechanics rather than the numeric sign in prose: reducing enemy count is a benefit; increasing enemy HP or shop prices is a penalty. Mixed conditional effects are separated. Inventory groups duplicates, shows counts and exposes details by touch/keyboard; dialog ESC/focus restoration and tab wrapping are tested. Opening stats does not pause multiplayer host.
- Existing white hit-mask/gem caches, changed-only HUD and whole-world repaint from3886195 are retained. No per-frame new DOM rebuild or forced world draw skip.

## Reproducible validation

`node --test spudsquad/test/*.test.cjs`: original253 plus inherited/new scope tests →278 pass,0 skipped/failed. Existing tests were updated only for changed XP/tier/rarity contracts and extended tier coverage; none removed. Rarity tests use100k samples per wave/luck and owner-mean scenario; ordinary and boss rewards, old quotes, legacy saves, host/guest and resume cases remain covered.

Local browser regressions, screenshots0:

- `vnext-browser-smoke.mjs`:390×844 /844×390 /320×568, real T4→T5→T6 UI merge, locked19-price debit/reload, owned-item focus/count, actual W21 required boss/reward→W22→lethal sim damage/game-over UI and normal W20 win UI; all15 actual ult mechanics through JSON host/guest loopback; no page exceptions, missing T5/T6 requests or ads.
- `level-boss-ui-smoke.mjs`, `boss-reward-ui-smoke.mjs`: compact settings, audio restore, safe geometry, level synchronization, boss queue item choice stable through refresh/consumed once.
- `perf-ads-smoke.mjs`: title/wave/shop/result ad DOM/provider requests0; wallet clearance, resize/camera and ult hit target intact.
- `ult-smoke.mjs`: touch, used opacity.35, shop/dead block, old used save, next-wave reset, revive overlap, sender/duplicate authority.
- `pad-smoke.mjs`:−240→+35→+240 direction recovery, exceptions0. `audio-mix-smoke.mjs`: simultaneous mix peak.958398, RMS.115929.

Browser fixtures block non-GET HTTP writes and run debug-only; no screenshots, ad clicks or account rewards. Loopback is not a real relay claim. Production validation and its exact deployment SHA/Pages URL are recorded outside the deploy artifact in `tmp/spud-balance-vnext-deploy-result.md` after promotion.

## Controlled balance and performance evidence

Full same-policy20seed×15character growth comparison and idle-CPU paired replay results follow below. The historical kiting bot uses200px/s movement (not a human or real-device proxy); `growth-vnext.mjs` uses explicit legal merge/recycle purchases and actual boss floor, optional same-policy ultimate usage. Do not label its old basic9–14/all±40% heuristic as a user-approved acceptance requirement or a measured human success rate.

`mature-vnext.cjs` initially isolates fixed `boss_2` stress at every tested wave (even where the natural boss is `boss_1`; summons disabled equally,120s cap), six T6 ranged weapons,20 seeds per solo/4p/W18/20/21/25/30. Existing baseline4pW30 ordinary20/20 kills vs new20/20 deaths; extreme1000HP/200regen can still kill17/20 or censor3/20 atW30. Additional final-code W35/W40/W50 stress: extreme build censors20/20 atW35, W40 dies18/20 solo and15/20 4p, W50 dies20/20 both. Censor means still fighting at120s, **not immortality**, death or victory. No arbitrary regen nerf or forced-death rule is introduced. Fresh isolated-wave stress is not a complete natural endless run.

Real4-phone FPS, visual screenshot review, physical fullscreen/rotation acceptance and human balance acceptance are unverified. No60FPS or all-builds-dead-by-W30 promise.

### Final growth: 20 seeds ×15 characters ×2 versions

|Character|Base mean|Final mean|Change|Base clear%|Final clear%|
|---|---:|---:|---:|---:|---:|
|basic|10.70|7.85|-26.6%|20|10|
|muscle|6.95|5.50|-20.9%|5|0|
|science|13.30|9.20|-30.8%|30|10|
|lucky|9.85|8.70|-11.7%|10|15|
|gunslinger|12.50|6.80|-45.6%|30|10|
|berserker|8.45|7.50|-11.2%|5|0|
|vampire|16.80|12.45|-25.9%|70|40|
|bomber|8.45|8.85|+4.7%|0|5|
|cyclops|15.50|14.25|-8.1%|50|20|
|ghost|15.15|12.00|-20.8%|50|40|
|saver|9.65|5.55|-42.5%|20|0|
|thorn|6.80|6.70|-1.5%|5|5|
|soldier|6.30|5.35|-15.1%|0|0|
|loud|10.95|7.75|-29.2%|30|15|
|mutant|8.40|5.60|-33.3%|5|0|

Overall mean10.65→8.27 (−22.3%). Basic10.70→7.85 (−26.6%), not the initial more-than-halved warning. None of the15 mean reaches is halved under this same-policy fixture. Gunslinger−45.6% and Saver−42.5% remain the largest reductions;0 clears in20 trials for several characters are explicitly retained. **The legacy9–14/all±40%/each-boss heuristic fails for both versions**. These are balance risks and a human playtest limitation, not a claim that all characters satisfy that heuristic. Boss-floor correction supersedes preliminary basic8.55; its randomness also changes later item purchases. No bot-only buff or lowered simulation cap was used to manufacture a pass.

### Final identical-load rendering

Chromium software-headless, CPU4×, DPR2,844×390 viewport/canvas1688×676;4 players,150 enemies,90 fixed steps,1273FX,180 decoded sprites. Growth jobs finished before all sequential perf runs. Full authority/RNG, canvas, sprite count and FX count match exactly. No filters or forced whole-world skips are introduced.

|Metric|deployed3886195|parent4e5c052|final|
|---|---:|---:|---:|
|Frame interval p95(ms)|76.4|78.3|80.9|
|Draw p50(ms)|6.3|6.2|6.1|
|Draw p95(ms)|10.1|10.2|10.8|
|Draw skips|0|0|0|

Final frame p95 is modestly higher, not a performance improvement/zero-cost or60FPS claim. Separate actual four-character ultimate replay (vampire/ghost/science/gunslinger, same authority and1242FX) has parent→final framep95 84.3→86.4ms, drawp95 10.1→12.0ms; draw skips0 and runtime errors0. Longer-lived new visuals have bounded extra draw cost; this fixture is separate from the1273FX baseline and is not silently substituted.

### Seeded rarity observed frequencies

W10/luck0/100,000 draws: T1–T4 75.082%, 19.948%, 4.458%, 0.512% (target75/20/4.5/.5). Weapon mean1/100,000 draws: T2–T6 79.908%, 15.985%, 3.073%, 0.824%, 0.210%. Mean5 and mean6 both returnT6 in100,000/100,000 trials (cap exception). Wave gates, luck clamp, exhausted unique pools and boss floor additionally pass unit assertions.

### Natural-boss follow-up (300s cap, no universal termination promise)

The initial fixed-boss2 stress is intentionally heavier than natural W21/25/30/35. A final source fixture also supports `SPUD_NATURAL_BOSS=1 SPUD_MATURE_WAVES=25,30,35,40,50 SPUD_COMBAT_CAP=300`, matching actual boss1 except multiples of20. With20 seeds each and the same fixed builds, W30 ordinary solo dies20/20 but ordinary4p kills20/20 (mean33.08s); extreme1000HP/200regen kills20/20 atW35 (solo96.37s/4p73.40s), then dies20/20 at actual boss2W40 in both solo/4p. All these natural-policy rows have0 censors at300s. Thus the120s W35 stress censors are not evidence of a required-boss softlock. Full natural runs with continuing item/stat accumulation and every possible build remain unverified; do not claim all T6/regen builds die byW30. No extra damage/regen nerf was needed to manufacture this result.

### Production probe fixture clarification

The first live settings probe reached valid geometry/preferences but its old randomized quote fixture could generate four weapon offers and then dereference a nonexistent item offer (probability.35^4). The quote subcase now sets the world RNG to.99 before generating offers, making an actual item quote deterministic; it does not change gameplay RNG or skip an assertion. Existing local-only CDP smoke intentionally blocks every HTTPS URL and is not a production harness. Separate guarded production copies use the already established own-origin GET-only Fetch policy, retain WSS blocking for solo tests and never allow account/rank writes. Actual relay checks use a disposable room and explicitly leave both contexts.

The host-stats no-pause probe waits for an actual advanced simulation tick while the dialog remains open (3s bound), then asserts it. An immediate before/after click comparison could execute within the same30Hz tick and falsely fail; this timing fixture correction does not change gameplay or close the dialog before proving progress.
