# Monster and Knight Skill Expansion Implementation Plan
> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.
**Goal:** Five actually growing skills plus one-handed wand+shield in solo and ordinary mixed multiplayer.
**Architecture:** Existing content/meta/sim/net/render/UI layers; shared canonical growth and restrictions, host-authoritative effects and snapshot presentation. No new backend.
**Tech Stack:** Buildless JavaScript ES modules, Node test runner, native Playwright controls, deployed WebSocket relay.
---
### Task1 Access and growth contracts
Files arpg/js/content/combat.js, content/skill-growth.js, meta/skills.js, meta/skill-mastery.js, test/monster-knight-skills.test.js.
1 Write failing tests for five IDs, skeletal-only access, sword/twohand restrictions, seven mastery milestones/current-next labels.
2 node --test arpg/test/monster-knight-skills.test.js must FAIL before implementation.
3 Add minimal canonical definitions and bounded defaults; preserve old thresholds and unknown skill rejection.
4 Rerun tests PASS; local commit.
### Task2 Real effects
Files arpg/js/sim/world.js, spell-zones.js and existing projectile/combat/status/target helpers as actually needed.
1 RED real finite poison/curse multipliers/stealth target acquisition and break rules/wave unique piercing/berserk outgoing+incoming+speed+swap cleanup.
2 Implement existing primitives rather than alternate sim. Reject ineligible skill before MP/CD mutation; one cast one mastery; snapshot growth. Add zone cap/overlap/expiration and clean state on death/return.
3 node --test arpg/test/monster-knight-skills.test.js PASS; local commit.
### Task3 Wand shield
Files meta/items.js, meta/run.js, sim shield/input gates and equipment/HUD render as needed; tests wand-shield.test.js.
1 RED actual wand+shield equip/guard/perfect + focus attack, twohand shield reject, reload and failure atomicity.
2 Reuse existing wand IDs and shield lifecycle, no new family/new save schema.
3 node --test arpg/test/wand-shield.test.js PASS; commit.
### Task4 Multiplayer and presentation
Files net/session.js, protocol.js, prediction/presentation, render/hud/status/UI shop skills only necessary paths.
1 RED host+guest lineage/form rejection, status reset, incoming/outgoing damage and stealth target/render nonleak.
2 Propagate verified lineage and authoritative effects, preserve ff759e3 strict party negotiation. Natural UI keys/touch controls; no skill accessible only through debug. Renderer draws clear skill shapes, readable curse/berserk states and owner-only ghost stealth.
3 node --test arpg/test/monster-knight-skills.test.js arpg/test/wand-shield.test.js plus existing skill/net/loot/growth suites PASS.
### Task5 Native and full regression
Create arpg/test/monster-knight.native.mjs supporting ARPG_BASE_URL and evidence override. Preboot valid fixtures only, actual learning/equip/cast PC1280touch390 solo + actual deployedrelay bothcasterroles, growth1/30 and restrictions/wandguard/invisibility victimview. Source hash binding, no screenshots/world writes. Compare full node --test arpg/test/*.test.js arpg/test/*.test.mjs to /tmp/arpg-handshake-parent-full.log (1548/1484pass64oldfail); stamp failure expected parent-only. Report exact failures and all local commits.
### Task6 Parent release ONLY
Parent independent diff + tests + actualrelay verification, main/lab stamps, commit then mainFF/push, exactSHA CI success and moduleCSS exactdelivery, repeat production native, finalreport. No child push/deploy/stamp.

## Implemented defaults and paths (stage, not release)
All numbers below are conservative implementation defaults, not exact user-specified balance. Milestones remain **1/5/10/15/20/25/30**, mastery XP anchors unchanged. Every five-skill cast freezes its growth at start; MP once at start, cooldown once at act end, mastery once at successful release (not per target/pulse).

| Skill | Lv1 → Lv30, seven milestones | Access / cost |
| --- | --- | --- |
| `poison_field` | radius 80/90/100/110/120/130/140 px; duration 3/3.5/4/4.5/5/5.5/6 s; 6..12 real 500ms pulses, damage 8 × held weapon power | skeletal lineage, any lineage-legal held weapon; STR30, 280G, 20MP, 8s CD |
| `curse` | duration 4..7s (+0.5s); outgoing reduction 10/12/14/16/18/20/22%; armor reduction 15/18/21/24/27/30/33% | skeletal lineage, STR30, 280G, 18MP, 9s CD |
| `invisibility` | duration 2/2.5/3/3.5/4/4.5/5s | skeletal lineage, STR30, 300G, 18MP, 12s CD |
| `sword_wave` | real projectile range 300/350/400/450/500/550/600 px; 2..8 unique targets; damage 36 | one/two-handed sword only, both human/skeletal; STR45, 300G, 20MP, 6s CD |
| `berserk` | duration 4..7s (+0.5s); damage/attack-rate multipliers 1.15/1.175/1.20/1.225/1.25/1.275/1.30; incoming damage ×1.20 throughout | two-handed blade sword/blunt only, both human/skeletal; STR45, 300G, 24MP, 15s CD |

Curse uses actual player AC in the armor mitigation equation; monsters have no authored AC, so their defense weakening is an explicit +15..33% damage vulnerability. Same curse slot uses strongest magnitude and refreshed finite expiry, never multiplicative stacking or permanent stat mutation. Berserk does not heal and drops on incompatible equipment/death/return/round reset.

Runtime additions stay in existing `world.js` status/zone/projectile pipelines. `spell-zones.js` validates poison's finite geometry/pulse bounds and shared cap32. Optional status/lineage fields live in existing snapshots with bounded decode checks. Verified local-save profiles rebuild held weapon/mods, never granting skeletal access from team or transient bone revival. Existing strict sender/mode negotiation is preserved.

`render/visibility.js` filters non-owner invisible pawns out of the renderer's entity/telegraph inputs (names/markers/shadows/attached VFX included), without removing them from simulation/collision snapshots. Owner visual alpha is 0.32. Autoaim/basic-autoattack and monster sticky selection exclude invisible targets; owner autoattack pauses; explicit attack, other successful skill, real damage, expiry clear stealth. Already-fired/projectile/area collisions still hit.

Existing one-handed wand item IDs/stats/handedness and staff metadata are unchanged. Shield eligibility now recognizes actual `focus:wand`; equip, reload, compare, derived mods, host/prediction, physical graphics and perfect-guard rush use existing shield pipeline. A shielded wand receives shield rush, not unshielded focus blink/reset. Gear captions label one-handed wand/shield access.

Focused RED evidence: `/tmp/arpg-monster-knight-red.log`, `/tmp/arpg-monster-presentation-red.log`, `/tmp/arpg-wand-shield-red.log`, `/tmp/arpg-wand-perfect-red.log`, `/tmp/arpg-monster-status-red.log`. Final verification/native/regression numbers are recorded in the stage report.

## Stage verification completed
- Coupled focused suites: **281/281 PASS** (`/tmp/arpg-monster-knight-focused.log`). Additional finite-pulse/piercing tests execute all seven canonical milestones, not merely growth labels.
- Exact full comparison: **1599 tests, 1534 pass, 65 fail**; original 64 failure names unchanged, plus only the parent-owned asset-stamp test. **New feature regressions: 0.** Full suite is not all-green. Evidence: `/tmp/arpg-monster-knight-full-final.log` and `tmp/arpg-monster-knight-regression-delta.json` in the main workspace.
- Natural native evidence: **38 PASS groups**, PC1280 / CDP-touch390, Lv1/Lv30, solo and real deployed-relay host/guest caster roles. 68 five-skill learning/equip/casts + four natural goblin-target-loss/stealth-expiration cases; **108 actual poison hits**, every expected six/twelve pulse confirmed. Four solo human-knight groups included. Six wand cases verify actual held mitigation, zero-damage perfect/rush, focus basic and spell after release (both relay roles too).
- `arpg/test/monster-knight.native.mjs` supports `ARPG_BASE_URL`, `ARPG_MONSTER_EVIDENCE`, `ARPG_MONSTER_WIDTHS`, `ARPG_MONSTER_LEVELS`, `ARPG_MONSTER_KITS`, `ARPG_MONSTER_MODES`, `ARPG_HTTP_PORT`. Default replays all 38 groups. Isolated valid saves are seeded before boot only; actual learning/equip/casts use controls, observers/logpoints are read-only; screenshots/world writes=0. Touch emulates a device in Chromium, not a physical phone.
- Runtime source bound at `b263838393d862e237344b1c08d936a1d6c6b5c7`: all 24 changed runtime files included among 25 served-module bindings. Final later validation commit changes tests/docs only. Evidence audit: `tmp/arpg-monster-knight-native-audit.json`; full inputs: `tmp/arpg-monster-knight-core-native.json`, `tmp/arpg-stealth-aggro-native.json`, `tmp/arpg-wand-shield-native.json` (main workspace).
- Parent remains owner of independent review/follow-ups, main/lab stamps, integration, publication and exact-SHA production replay. No child push/deploy/stamp/shared-library/server changes.
