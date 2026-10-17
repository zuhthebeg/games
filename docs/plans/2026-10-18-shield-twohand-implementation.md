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
