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
