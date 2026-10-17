# Approved shield / two-handed implementation plan

**Goal:** sustained frontal guard, one perfect-contact rush, round attached shield, two-handed weapon metadata and single-path double damage.
**Architecture:** deterministic host world owns contacts/damage; shared movement handles held guard; newest network held state bypasses queued edges; item metadata derives into snapshots. Existing sword/blunt kits and exact loadouts remain.
**Tech:** native ES modules, Node test runner, Pixi Graphics, isolated Chromium/Playwright (no screenshots).

## 1. RED/GREEN held guard + network
Files: `arpg/js/input.js`, `sim/movement.js`, `sim/world.js`, `sim/dodge-lag.js`, `net/player-prediction.js`, `net/protocol.js`; test `arpg/test/shield-twohand.test.js`.
Run `node --test arpg/test/shield-twohand.test.js`: fail sustained hold, release, 70%, perfect 0/rush. Implement persistent guard with edge-only perfect window and existing dodge cooldown. Short rush uses existing dash machinery plus swept body collision; no iframe; one act hit set. Latest held packet wins, reorder ignored, expiry at existing 1000ms. Queue cap30 unchanged.

## 2. RED/GREEN two-handed equipment
Files: `meta/items.js`, `meta/stats.js`, `meta/save.js`, `meta/compare.js`, `content/combat.js`, `ui/gear-view.js`, `ui/hub.js`, protocol/world.
Add handedness2 to old warden_blade/warden_maul and T2/T4 greatsword/warhammer (six tier/form bases including old T3). Same tier power as one-hand, runtime multiplier2 only for direct weapon attacks, compose silver once. Test equip/autoclear/reject/compare/craft/rare/snapshot/save repair. Save migration clears only invalid offhand binding, retains owned item; no reset.

## 3. Round shield render
Files: `render/physical-shield.js`, gear portrait. Lightweight shaded round Graphics with bevel/thickness, rim, boss/rivets, reverse wood and grip; 8-direction attachment/depth, guard/bash pose, shadow and explicit cleanup. Node pose/cleanup tests and private offline contact-sheet inspection if useful.

## 4. Verification
Focused tests plus named regression files; compare any failure against exact 74f4fa1 base rather than whole-green claim. Ordinary `/arpg/` isolated valid save fixture at PC1280 and touch390: actual >=10s hold, release/cancel/blur, perfect contact/rush once and held subsequent attacks, twohand warning/reject/craft/attack. Native harness supports `ARPG_BASE_URL` and `ARPG_SHIELD_EVIDENCE` for parent replay; no live world writes/private saves/screenshots. Record source hashes, logs and limitations in workspace tmp implementation report. Local commits only; no stamp/push/release.

Tuning: reuse perfect window and dodge cooldown; rush distance85 / active200ms matches existing bash range and dodge duration, body pad8. No stamina or extra parry system.

## Implemented tuning / review notes
- Runtime-only ×2: source power/affixes/enhancement remain unscaled; one direct-hit multiplier composes handedness + silver. Ordinary/silver onehand combat trace SHA remains historical.
- Reclassified existing bases: `warden_blade`, `warden_maul` (all rarity variants). Added `rune_greatsword`, `revenant_greatsword`, `rune_warhammer`, `ossuary_warhammer`; generated rarity variants and recipes use existing catalogs and drop gates.
- Perfect rush is 85px/200ms with bodyPad8 and collision sweep, no iframe; earned rush survives ordinary button release, but real incoming damage interrupts it. Existing dodge cooldown gates a fresh perfect press, not sustained guarding.
- Shield is lightweight shaded round geometry with front metal boss/rivets, backside strap/grip, depth, left-hand forearm connector and shadow; no assets/dependencies/leases added. Offline actual-atlas contact sheet exposed and fixed handedness.
- Guest own-pawn visual predicts held/release only, never contact reward/damage. Remote host InputQueue uses newest held level, retains original edge timestamps and existing cap30 / 1000ms disconnect timeout.
- Native browser keyboard/touch input is real. This headless Chromium does not deliver OS tab-focus blur (attempted), so blur is handler-event injection and is explicitly disclosed. No screenshots/private contexts/live-world writes.
- Whole-suite GREEN is not claimed. Exact 74f4fa1 comparison is recorded in workspace tmp; release stamps intentionally remain parent-owned. The old TD1 XP/minute policy fixture uses reclassified warden twohand and is separately measured, never silently retuned.

## Final edge cases and replay
- Successful hostile projectile guard still rushes toward recorded incoming origin when its shooter is dead/absent; first windup tick uses the same facing for rendered shield and authoritative block.
- Valid legacy shield capacity affix can support a nearly full supply bag. Removing that shield now moves only necessary excess consumables into the existing stash, preserves all quantities/items/currency, and visibly explains it. Original stored bytes remain untouched until ordinary persistence.
- Focused verification command: `node --test arpg/test/shield-twohand.test.js arpg/test/shield-render.test.js arpg/test/input.test.js arpg/test/shield-weapon-counter.test.js arpg/test/net-player-prediction.test.js arpg/test/generous-dodge.test.js arpg/test/input-overflow.test.js arpg/test/silver-damage.test.js arpg/test/weapon-loadout-ui.test.js arpg/test/i1-tier4-items.test.js arpg/test/necropolis.test.js arpg/test/silver-items.test.js arpg/test/stone-drops.test.js` (133 tests).
- Local native: `node arpg/test/shield-twohand.native.mjs`. Production replay owned by parent: `ARPG_BASE_URL=https://game.cocy.io ARPG_EVIDENCE=/absolute/private/result.json node arpg/test/shield-twohand.native.mjs` (`ARPG_SHIELD_EVIDENCE` also accepted). Isolated context and valid fixture only, no live world writes.
