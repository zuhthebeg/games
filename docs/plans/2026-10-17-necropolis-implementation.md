# Necropolis Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the approved four-map necropolis after S23 without changing existing encounters or simulation rules.

**Architecture:** Add S24–S27 to the ordinary stage/map/save/reward catalog. A standalone `necropolis_lord` is an authored undead boss using existing skeleton-warrior art and chief attacks, with ordinary bounded loot and skeleton escorts. Existing world/host authority, holy targeting and save schema remain unchanged.

**Tech Stack:** Static ES modules, Node test runner, Pixi atlases, isolated native Chromium input.

---

### Task 1: Data, gates and backwards compatibility

Files: `arpg/test/necropolis.test.js`; `arpg/js/content/{combat,balance,world-map,biomes,monsters,loot}.js`; `arpg/js/meta/progression.js`.

1. Add failing assertions for S24 매장지 → S25 구울 소굴 → S26 망령 회랑 → S27 망자의 성소. Require S20 + S23 even for forged new clear flags; sequential previous-map prerequisites. Snapshot base c7b1abe existing stages/maps/monsters, preserve S21–23 and living bats exactly.
2. Run `node --test arpg/test/necropolis.test.js` and retain RED evidence.
3. Add stage data only: low concurrency (3), modest HP/damage increase from S21/S22, T4 hunt pool, existing materials/gear budget. S27 one boss + skeleton escorts, no repeat-wave boss. Existing killAll/settleRound paths provide victory/unlock/replay.
4. Test missing-key historical saves, deterministic world/snapshot, actual combat/settlement and save/load, holy heal damage and strict boss turn cap. Run again for GREEN and commit.

### Task 2: Presentation and board

Files: `arpg/js/render/{atlas-state,atlas-visual}.js`, `arpg/js/content/monsters.js`, `arpg/js/solo/knight-presentation.js`, `arpg/js/audio-profile.js`, `arpg/js/ui/hub.js`.

1. Add failing tests for skeleton-warrior atlas reuse, boss identity and skeleton-player roster compatibility.
2. Add new atlas alias, bone audio, differentiated boss tint/name/crown marker without new assets; preserve original encounters. Place final map regions in separate columns to avoid overlap at 390px. Add necropolis completion counter alongside existing /20 and graveyard /3.
3. Run new tests + relevant holy, map, save, reward, equipment, coop and empty-wave regressions. Classify historical frozen snapshots against the unmodified base, never silently rewrite expectations.
4. Commit runtime/tests after GREEN.

### Task 3: Actual normal app native verification

Files: `arpg/test/necropolis.native.mjs`; report outside checkout `tmp/arpg-necropolis-implementation.md`.

1. Use isolated contexts only, seed a validated level/gear save before boot, enter actual `/arpg/` (not debug/lab), read-only `__arpg` inspection only. Support `ARPG_BASE_URL` for parent production run.
2. Native PC1280 keyboard/mouse and touch390 map selection/departure; all four encounters load, real inputs finish battle, ordinary receipt/reward/next unlock and reload persist. Verify region/quest controls unclipped, zero page exceptions, atlas asset/source hashes. No screenshots.
3. `git diff --check`; commit test harness and final evidence references; leave clean feat/arpg-necropolis. No HTML stamps, push, deploy, auth, deps or main edits. Parent owns independent review/release.
