# Level price / boss gem / compact settings — local-only evidence

Base: `3886195b452984f6a2fb1fbb2c5cbea62720cfce` (clean original main).
Branch: `feature/spudsquad-level-boss-ui-20261003`.
Worktree: `/home/cocy/.openclaw/workspace/tmp/worktrees/spudsquad-level-boss-ui-20261003`.
No merge of `6fc95ff`/`f44581e`; no push, merge or deployment. One writer, screenshots0.

## Implementation decisions

### Quoted item prices

- Existing wave quote is `ceil(base * (1 + .1 * (wave - 1)))`.
- Items only multiply by `1 + .05 * (owner.lvl - 1)`; lv1=1, lv2=1.05, lv3=1.10, not compound5%.
- Existing character/item `priceMult` factors still multiply, with one final `ceil`. Mutant1.5 and crown1.2 remain markups, not new discounts. Existing multiplicative/legacy duplicate-item semantics are preserved.
- No new gameplay level cap. Actual XP growth is integer; quote defensively floors finite levels and uses minimum1. Saved levels must be positive safe integers; missing legacy level defaults1.
- `sim.shop` creates frozen `offer.price`. Display and `sim.buy` use this same number. Locked offers, old saved quotes and currently open offers are **not repriced** on level/owned-item changes. New unlocked reroll offers use the then-current owner level/multipliers.
- Weapon quotes, wave progression, reroll/free-refill rules, weapon resale, crate recycle value and shared-account gold rules are unchanged.
- Guest shop remains existing local-owner authority; WAVE_END now synchronizes authoritative lvl/xp as well as mats/stats before quoting. READY keeps host's XP progression.

### Boss reward

- Each actual `boss_1`/`boss_2` death creates one `{bossReward:true,minTier:2,owner}` crate; ordinary crateCount2 cap and normal probability hooks remain independent. Removal from enemies precedes hooks, so duplicate kills cannot issue another reward. Endless bosses use the same path.
- The large gem **is the item reward crate**, not multiplied currency. Original boss material/XP blue drops and gold probabilities remain unchanged.
- Kill owner is the initial reward owner, matching existing owned-crate semantics. Only that living player picks it up; an unowned gem may go to the first living picker. At successful wave end, missed boss gems go to their living owner, or round-robin survivors if the owner died/disconnected. Ordinary missed crates retain their old behavior. This is one item opportunity per boss, not one item per party member.
- Pickup and settlement queue preserve reward id/flag/floor. Snapshot boss row is `[id,x,y,1,owner,2]`; ordinary rows stay3 fields. WAVE_END sends crateRewards with the legacy numeric count. Old ordinary numeric queue entries still work.
- Reward rarity still rolls the wave/luck tier, then floors it atT2. Capped unique/max items are excluded; an exhausted selected tier falls back within eligibleT2+ pools, neverT1. Real data includes uncappedT2 items, so a valid boss item remains available. Normal shop floor is unchanged.
- The next shop keeps existing take/recycle choice. Selected itemId is saved in the queue, so language refresh/reload cannot reroll it; each choice shifts exactly one entry. On normal W20 final victory, which has no shop, pending boss rewards are auto-granted, with host-issued IDs sent to guests. All-dead loss grants no consolation item.
- SOLO save validates optional new metadata and keeps legacy absent fields/numeric entries compatible. No protocol/authority rewrite.

### Gem rendering and settings

- Boss vector gem has26px square blue core vs normal12px, gold30px border and60px halo inside one immutable72×72 canvas. Cached once, then drawImage; no new per-body filters, shadows or particle emitter. Existing white hit-mask caching/world repaint/HUD changed-only behavior from3886195 remains intact.
- Existing lang/music/sound/shake/volume IDs and preferences stay in a44px-toggle non-modal settings dialog. Fullscreen/landscape reuses the existing title action and fallback. ESC restores focus, outside pointer closes, aria-expanded/aria-pressed track state. Opening clears held input; range keyboard arrows are not consumed by movement shortcuts. Settings never pause host simulation.
- HP/wave/timer/money/stats HUD stays visible. Wallet reservation remains56px plus safe area. Inventory, pad, revive and ultimate remain available.
- Only changed JS script cache keys advance to`20261003levelboss1`. Data/FX/audio/shared modules unchanged.

## Tests and actual local results

Baseline `node --test spudsquad/test/*.test.cjs`:238/238.
Final same command:253/253, no skipped tests.
RED logs: `tmp/spud-level-red.log` (six missing pricing/reward assertions), `spud-level-ui-red.log` (missing settings), `spud-level-red-metadata.log`, `spud-level-render-red.log` (baseline cache missing), `spud-level-settings-state-red.log`, `spud-level-cache-red.log`.
Existing lightweight DOM fixtures gain only setAttribute support for new active-state accessibility attributes.

With local HTTP server on127.0.0.1:8772:

```sh
node spudsquad/test/level-boss-ui-smoke.mjs
node spudsquad/test/boss-reward-ui-smoke.mjs
node spudsquad/test/perf-ads-smoke.mjs http://127.0.0.1:8772/spudsquad/
node spudsquad/test/ult-smoke.mjs http://127.0.0.1:8772/spudsquad/
```

- Three viewport settings smoke: controls hidden when closed,44px button, all controls visible when opened, volume61→62 by ArrowRight, mute/music/lang/shake interactions and audio preferences survive reload, ESC/outside click work, simulation advances while settings open. Actual guest main WAVE_END handler uses lvl7/xp12 instead of stale lvl1 before displaying prices.
- Boss browser smoke: two missed boss gems become twoT2 item selections; two intervening refreshes retain selected item and queue count; both actual items granted; queue/remaining count zero without duplication. All non-GET requests blocked; debug run only.
- Existing perf/ads smoke: title/combat/shop/result no ad request or ad DOM, wallet clearance preserved, ultimate remains hit-testable and usable.
- Existing ultimate smoke: touch, dead/shop blocks, save used flag, next-wave reset, revive non-overlap, simulated local host/guest sender authority and duplicate rejection; runtimeExceptions0. External HTTPS/WSS blocked.
- Existing pad smoke run from a temporary copy with external HTTPS/WSS blocked and debug URL: left velocity−240; reverse80px +35; reverse140px +240; errors0. No production rank/gold write.
- JSON host/guest unit transport validates owner lvl/xp, boss queue metadata, actual eligibleT2 item grant and READY loadout. This is not a real relay/phone test.

### DOM geometry (no screenshots)

| Viewport | HUD height before→after | Canvas height before→after |
|---|---:|---:|
|390×844|89→56|699→732|
|844×390|44→44|334→334|
|320×568|89→56|423→456|

Landscape HUD width624→784, replacing four44px top controls with one44px affordance. All viewports reserve wallet56px, horizontal overflow0. Fullscreen API denial/orientation-lock fallback is stub-tested; actual OS fullscreen/rotation permission is **not claimed**.

### Identical-load perf replay

Actual Canvas/FX/sim encode replay, Chromium software-headless, CPU4×, DPR2, fixed canvas1688×676,4 players,150 enemies,90 fixed steps,1273FX,180 ready sprites. The temporary runner loads baseline files using `git show3886195`, never prior unapproved branches. Art/render canvas and simulation/cosmetic RNG seeds are fixed.

|Metric|3886195|feature|
|---|---:|---:|
|frame interval p95|83.1ms|79.5ms|
|draw p50|6.2ms|6.2ms|
|draw p95|10.0ms|14.3ms|
|draw skips|0|0|

Full authority state, RNG end state,FX count and packet-size distribution match exactly. The isolated draw tail is noisier/higher in the final run; this is not a zero-cost or real-phoneFPS claim. The earlier paired run had framep95 83.1→83.7ms and drawp95 10.0→10.7ms. No cache/filter/whole-world-freeze regression is observed; unit tests explicitly assert cache identity and no new filter/shadow.

Evidence artifacts: `/home/cocy/.openclaw/workspace/tmp/spud-level-*` (unit/RED logs, UI before/after JSON, boss-browser JSON, perfads/pad/ult logs, fixed-before/after JSON and replay script). Final parent-readable report: `tmp/spud-level-boss-ui-result.md`.

## Remaining approval / limits

- Local branch only. Parent/user must review and explicitly approve before push/merge/deploy.
- No production validation was attempted because deployment is prohibited.
- Real phones, real relay distribution, screenshot visual review and actual fullscreen/rotation acceptance remain unverified. Use explicit future approval for those checks.
