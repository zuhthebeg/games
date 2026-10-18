# Knight and Archer Skills Implementation Plan

**Goal:** Ship the user's knight status effects and exactly two additional archer skills.
**Architecture:** Reuse deterministic world ticks, existing abilities, save/book/slot validation and multiplayer world snapshots. Keep unrelated game behavior and saved profiles intact.
**Tech Stack:** Native JavaScript modules, Node test runner, Pixi browser runtime.

## Design
- Keep lunge ID/save compatibility, rename display to 돌진 공격.
- Ground slam slows hit enemies by 35% for 3 seconds; refresh duration, never compound speed loss. Existing blunt restriction stays.
- Armor break retains its existing 5-second +15% incoming damage sunder, clearly described as defense weakening. Verify real subsequent damage and expiry rather than duplicating mechanics.
- Triple arrow: three aimed arrows in quick temporal succession (~100ms apart), not a three-arrow spread. One MP/cooldown payment per cast, interrupt cancels outstanding arrows.
- Evasion shot: actual dodge movement/invulnerability plus aimed arrow during dodge; use existing dodge machinery and perfect-dodge interaction without fabricating perfect-dodge rewards. No second dodge while unavailable. Preserve normal dodge and counters.
- Register the two bow skills in academy, book learning, icons, grades, descriptions, slots/save reload, combat/HUD, snapshot authority.

## Execution
1. Baseline relevant tests. Add failing behavioral tests for slow/expiry, sunder/expiry, 3 distinct shot times/cost/interruption, dodge-shot movement/iframe/constraints, book/slots/save.
2. Minimal ability/world/meta/UI/snapshot changes to pass tests. No new dependencies. No unrelated refactors.
3. Browser PC and 390px learn/equip/save/reload and actual casts; real two-player host/guest state checks where applicable. No screenshots.
4. Independent spec review then code-quality review. Resolve important findings.
5. Parent refreshes main/lab import stamps, commits, merges/pushes, verifies live files and live browser behavior. Existing main dirty configuration files remain untouched.

## Four-skill mastery correction — bounded handoff

- [x] Canonical `content/skill-growth.js`: Lv1/5/10/15/20/25/30 real meteor
  1–7, rain 4–10, spin 12–24, wall 4–7 seconds/8–14 pulses.
- [x] Meteor repeats at the initially locked point, every 0.3s after the first
  0.7s delay, using one zone slot; no instantaneous sevenfold damage.
- [x] Host pawn receives solo/host/guest save levels, clamps known integer inputs,
  preserves levels on stage reset, and freezes growth per cast. Profiles are not
  an anti-cheat authority upgrade. Existing thresholds/saves remain untouched.
- [x] Card and detail show current and next milestone; finite duration, payment,
  per-hit scaling, team ownership and prediction/rewind regressions are tested.
- [ ] Parent independent review, import stamps/main+lab release, deployment, and
  production rerun with `ARPG_BASE_URL=https://game.cocy.io`.

Every future skill addition must explicitly address actual level progression,
canonical UI values, authoritative scheduling, one-cast accounting, bounded
lifetime/caps and solo/host/guest native verification. Existing skills outside
this four-skill correction are not rebalanced here.
