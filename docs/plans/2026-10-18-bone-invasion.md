# Bone Invasion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Ship approved five-part bone progression, once-per-sortie skeleton revival, consent-only hostile skeleton rooms and unbanked-loot-only death drops.
**Architecture:** Host-authoritative deterministic sim and session ledger; persistent account inventory changes only through validated idempotent run settlement. Keep existing solo/default coop contracts unchanged.
**Tech Stack:** Existing vanilla ES modules, node:test, existing Playwright and transport harnesses.

## Task 1: map boundaries and define tests before code
Inspect arpg/js/meta/{items,enchant,run,save,stats,recipe-discovery}.js, arpg/js/content/*, arpg/js/sim/{world,ai}.js and arpg/js/net/{lobby,session,protocol}.js, main.js, ui/hub.js and relevant tests. Record exact current functions and add minimal tests failing for approved behavior. Audit hostile hit/player targeting, death/quest success and current run tracker ownership before implementation.
## Task 2: bone materials and equipment
Tests arpg/test/bone-equipment.test.js: five parts/craft/discovery/insufficient cost/no mutation on failure/save roundtrip/first attempt destruction/blessing cannot bypass/old nonbone enhancement unchanged. Implement existing content and meta paths minimally. Run node --test arpg/test/bone-equipment.test.js plus existing crafting/save/enchant tests, compare failures to base. Commit local.
## Task 3: revival and undead neutrality
Tests arpg/test/bone-revival.test.js: 30% revive before death event, exactly once sortie, no recharge reconnect or equipment toggles, no permanent slot lineage edit, first true death normal, normal undead nonaggro until attacked, boss and hostile players attack, ranged/support target semantics. Implement sim fields and snapshot/profile propagation with validated limits. Run focused world/net regressions. Commit local.
## Task 4: opt-in opposing player rooms
Tests arpg/test/invasion-session.test.js use actual CoopSession host+guest loopback: ordinary rooms reject hostile roles; consent checked by host, invalid lineage/team/config rejected; damage/projectiles/heal/team correct; hostile participant does not grant stage victory/rewards. Implement lobby explicit consent and role UI with DOM labels, session role authority and protocol validation. No relay edits. Commit local.
## Task 5: death drops and exactly-once settlement
Tests arpg/test/invasion-loot.test.js: pre-run owned inventory byte preserved, current unbanked loot drops after true death only, host generated unique drop IDs, range/live/team rules, duplicate claims/event replay/reconnect settle cannot duplicate gold/items/stacks; victim loses transfer once, looter receives once, host loss no fallback grant. Integrate run tracker and host ledger, never trust client payload values. Commit local.
## Task 6: actual journeys and review package
Fresh native contexts PC1280/touch390, ordinary entry UI craft/enhance/gear slots, sortie revival then death, ordinary coop unchanged, opt-in room two clients roles/hostile combat/drop pickup/return/reload. ARPG_BASE_URL supported and output bound source hashes. No screenshots/private sessions/forced user worlds. Unit tests may inject sim state; report fixtures honestly separately from native UI. Include full focused results and base comparisons for unrelated failures. Parent independent review and production release remain. Commit code/docs only under task scope; no push.
