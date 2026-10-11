# Untitled — local browser shell (M1.5 P1)

No bundler or network dependencies. From the games repository:

```sh
python3 -m http.server 8731
# Open http://localhost:8731/arpg/
node --test arpg/test/*.test.js
node arpg/test/browser-smoke.mjs
```

Stop the server with Ctrl-C. Smoke uses `/home/cocy/bin/chromium`, raw CDP on
19097, and a unique temporary Chromium profile (cleaned on completion).
The browser smoke takes about two minutes: it waits for real simulation time,
including natural S2 death and the complete 30-second S1 timer.

## Boundaries

- `js/main.js`: sole caller of `step`; 30Hz accumulator, maximum five steps per
  frame, discarded backlog, visibility pause and fresh input on resume.
- `js/input.js`: independent held states and latched press edges; release never
  clears an edge before the next tick. Touch attack and J use simulation auto-aim.
- `js/render/renderer.js`: owns interpolation snapshots, camera, pools, feedback;
  never writes simulation state. Telegraphs use exact current simulation origins,
  shapes and facing, rather than interpolated/animated character transforms.
- `js/render/shapes.js`: circle offsets, rectangle offsets, cone radians and
  full-sized boundary pattern. Windup fill grows inside a full-sized outline;
  lock/active are red, with stronger/extra boundary markings.
- `js/render/visual-provider.js`: register a player-weapon or monster-type factory
  with `register(key, factory)`. Factory receives `(entity, {color})` and returns
  `{container, update(entityState, animState, dt), destroy()}`. Renderer continues
  to own sorting, positions, shadows and effects; an atlas factory can replace
  procedural art without changing combat or the renderer core. Palette overrides
  are accepted by the provider constructor.
- `js/ui/hud.js`: Korean DOM menus, cooldown/resource displays, end/death screens.
- `window.__arpg.world`: live, recursively read-only debugging proxy.

## Verification and limits

The Node suite keeps all 11 simulation tests and adds two input regressions for
short taps, mouse-button chords, touch auto-aim and reset.

Smoke checks real keyboard/touch input, a brief dodge press, blade hits, bow/focus
hits, focus mana spend, viewport containment/nonoverlap, readonly debugging,
natural death/cause display, return progress/terminal display, exact S1 tick 900,
and visibilitychange pause/resume. The visibility test injects the browser's
hidden-state property/event; it does not simulate OS background throttling.

S1 is a safe 30-second timer against an immortal scarecrow; no action is needed
for clear, and attacks train aiming. S2 idle death leads to the recorded ability
and monster name, not a guessed cause. Return requires a free act slot and a safe
2-second window; hit interrupts without consuming the scroll, dodge cancels,
and successful channel completion triggers the round's returned screen.

This remains local single-player, not relay/network co-op or server-authoritative
currency. The M1.5 item economy below extends the existing art/audio shell without
changing simulation or rendering. Mid-Android 60fps, thermal behavior, real-device
touch and OS backgrounding remain hardware checks. No portal registration,
analytics, ads or deployment is part of P1.

## Cache busting (required after any js/css change)

game.cocy.io caches JS for 4h but HTML for 10min, so a new `index.html` can boot
against stale modules. `node arpg/tools/stamp-assets.mjs` rewrites the import map
and entry/stylesheet URLs with per-file content hashes. `test/stamp.test.js`
fails when the stamps are stale.

## M1.5 P1 — local item loop

- Save schema `version: 2`, storage key still `arpg.save.v1`: `SaveStore.load()`
  migrates v1 on a clone, backs up the original as `arpg.save.v1.migration.v1`,
  then persists v2. Invalid migration or quota failure throws without deleting the
  original. IDs, UIDs, enhancements, resources, progress and receipt loot survive.
- Five slots: `weapon/head/body/hands/feet`. Weapon remains required at the save
  boundary (the launcher consumes its kit); armor slots can be `null`. `deriveMods`
  and weight calculations tolerate empty slots. Existing armor IDs now use body.
  Gear instances are `{uid,id,enhance,affixes:[{k,v}],rolledAt}`.
- `meta/economy.js` holds the proposed reward/price/forge constants and recipes.
  `meta/affixes.js` exports deterministic `rollAffixes(rarity,huntTier,seed)`.
  Nine supported options affect attack/HP/speed/dodge/potion/mana/capacity/rewards.
  Critical chance/damage and knockback resistance are explicitly deferred: sim
  has no critical-hit consumer, and its `poiseMult` increases outgoing stagger
  damage, not resistance. No inert or mislabeled option is rolled.
- `items.rollDrops(monsterType,seed,ctx={})` keeps old fixed tables and adds an
  independent equipment/stone stream. `ctx` supports `huntTier`, `elite` (false),
  `threat` (1; accepted but not rebalanced until P3), `rarelessRounds`, `goldBonus`,
  `materialBonus`, and an optional boss flag. Default boss is goblin_chief. The
  added gear rate is 10%/35%/100%, so legacy fixed gear can add to the total rate.
  Hunt tier defaults to 2 for the S5–S7 tables and 1 otherwise. Templates currently
  cover tiers 1–2; stone tier weights cover 1–3. Training dummies give no rewards.
- A completed PvE round without received rare/epic increments `rarelessRounds`
  (S1 excluded); six such clears guarantee the next boss's first added gear is
  rare+. Lost gear on death is not promoted. Existing first-chief guarantee stays.
- `meta/shop.js`: `shopStock(accountSeed,refreshIndex)`, `buyGear(save,stockUid)`,
  `sellItem(save,uid)`, `refreshShop(save)`. Account seed is `createdAt >>> 0`.
  Stock is 3–4 weapons and 3–4 armor, common/fine, at most one midpoint-capped
  affix. Gear purchases go to storage; level/weight locks apply to equipping.
  Purchased stock UIDs persist as sold out. Three clears refresh stock/reset paid
  refresh escalation; manual refresh costs 20/40/80… G. Sales return 25% of
  unenhanced option-adjusted purchase value; equipped items cannot be sold.
- Forge uses stones: +1/+2 lower ×1 each, +3 middle ×1, +4 middle ×2, +5 upper ×2;
  gold 45/71/101/138/180. No scrap enhancement cost, failure, breakage or refund.
- `meta/compare.js`: `compareItems(equipped,candidate,save)` accepts only a
  same-slot pair and returns attack/HP/weight/affix delta lines plus post-equip
  weight/capacity and level/weight lock reason. Hub shop, forge and receipts render
  this shared contract using existing classes; this is not the P2 approved design.
- Tests preserve the original suite and add v2 migration/failure safety, all-slot
  regression, 10,000-seed affix and reward distributions (±2σ), pity persistence,
  shop/refresh/compare, and 1,000-stock economic-cycle property checks. Browser
  smoke also covers gear purchase/sold-out/sale/refresh persistence and stone forge.

### P3 headless balance / threat

- `node arpg/tools/balance/botsim.mjs --n=200 --out=/tmp/balance.json` runs S1~S7 without a DOM. JSON contains every seed and aggregate clear/death/timeout rates, mean/median clear ticks/minutes, consumed HP potions, kills, retained gold, equipment by rarity, three stone tiers and net liquid value. Terminal summary table goes to stderr. Example single kit: `--stage=S6 --threat=2 --level=8 --stats=agile --rarity=rare --enhance=5 --weapon=bow --seed=1 --n=200`.
- Default comparable preset: levels **1/2/3/4/5/5/6**, blade, balanced stat allocation, full five-slot fine+0 equipment (starter for S1). Affixes are empty to avoid favorable affix selection. `stats=agile` prioritizes AGI/STR/WIS. Invalid level/gear requirements reject. Seed range is consecutive from `--seed` (default 1). The 200ms bot reads only world/telegraphs, sends ordinary movement/attack/skill/dodge/potion inputs, maintains bow/focus distance and drinks below 35% HP; it never overwrites sim state. The runner uses meta reducers and `setLoad` exactly as gameplay does.
- Rewards/value cover kill drops, excluding XP and the one-time first-S4 chief pity (repeat-hunt valuation). Net value = retained gold + equipment vendor value − consumed HP potion replacement cost. Materials/stone gold prices do **not** exist; their separate counts are not invented gold equivalents. Clear time is conditional on success; potions/rewards/value average **all attempts**, with death/timeout loot valued at zero. `skipped` exposes capacity-rejected drops. It is not a human difficulty guarantee: exact warning geometry/target positions and deterministic reactions are optimistic, even with a 200ms cadence.
- `tools/balance/baseline.json`: 200 seeds per stage before balance changes (game source `2930689`). `tuned.json`: same policy/presets/seeds after tuning. `holdout.json` repeats 200 unseen seeds 1001~1200; `threat2.json` uses Lv8 rare+5, `threat3.json` uses Lv12 epic+5 (200 seeds each), so those stronger-gear threat rows are not same-gear A/B comparisons. Final source commit and SHA256 source fingerprints are recorded for reproducibility. S1 stays invulnerable/timed 30 seconds: a 5% death / 3~6 minute goal would contradict its onboarding contract.
- All new proposal constants live in **`js/content/balance.js`**. Stage content expands original spawn data into waves; chief appears once. HP/damage multiply at spawning, not in the action machine; phases/telegraphs/AI/physics stay unchanged. Normal gold ×2.5 and stage curve `1.3^(stage−1)` apply to kill loot; a boss retains its original base gold before curve/threat. Both legacy and additive gear streams get threat chance scaling; higher threats shift additive rarity weights upward. Existing economy sinks/refunds remain unchanged.
- Save stays v2/key `arpg.save.v1`. Optional `threat` is selected run tier; optional `stageThreat` stores **highest cleared** tier per stage (0=uncleared, 1~3=completed). Missing historical entries count as tier1 **only if that stage is already cleared**; otherwise selection starts at tier1. Next tier requires current-tier clear, capped at 3. Death/return never unlock it. Persisted selection goes through `buildRoundMods → addPlayer → startStage`; the frozen `world.round.threat` and kill event `threat/stageId/elite` reach `trackRound → rollDrops`. No `main.js` change is needed. S1 has no selectable higher threat; unimplemented PK/echo content receives no P3 encounters/rewards.
- `MONSTERS[type].elite` remains the legacy archetype rank used by content validation. Random stronger spawns are explicitly **`entity.eliteVariant`** (HP×2.2, damage×1.3); their kill event uses `elite:true` for the drop contract. Purple tint/visual scale×1.15 distinguish them in both existing atlas and procedural paths, without changing collision radius or adding an aura/render system. S7 keeps sequential appearances to protect the first poison pattern.
- Guaranteed-clear regression fixtures now use legal Lv12 epic+5 equipment, while idle/death, actual kills/XP/settlement, S1 timer, economy property tests and combat phase/shape assertions are retained. Fine+0 first-challenge clear rates are measured separately, not asserted to be 100%.

## Developer debug mode (local testing only)

- Open `/arpg/?debug=1`. The flag persists as `localStorage['arpg.debug']='1'`.
  `/arpg/?debug=0` disables it persistently. With debug off, **no debug module is
  imported**, no debug DOM/CSS or combat mutation is installed. Existing readonly
  `window.__arpg` remains unchanged; no writable global is exposed.
- Phone: tap the 48×44px **DBG** button at the bottom right (above combat controls).
  The scrollable panel has ≥44px controls. PC: DBG or **backtick (`)** toggles it;
  typing in panel fields does not control the game. The rest of the canvas remains
  playable while the panel is open. Close it before normal HUD interaction.
- Inn: gold +1,000/+10,000; lower/middle/upper stones +10 each; every material +20;
  HP/MP potions +5; slot × rarity × hunt tier gear, or a 20-item set (all five slots
  × all four rarities). Gear uses P1 `instance`/`rollAffixes` and goes to storage,
  never auto-equips. Current content has no T3 gear templates: T3 falls back to T2
  **including affix ranges**, not an invented T3 item ID.
- Level setting 1–30 grants the valid level's remaining stat points. “포인트 회수”
  resets stats to 5 and returns all points available at that level. Arbitrary extra
  points would violate `validateSave` and are intentionally not issued. Lowering
  level removes level-locked equipment (and supplies a valid starter weapon).
- Unlock stages; reset clear/progression flags; free shop reroll; reset paid refresh
  and completed-round counters; prepare the *next boss's* pity roll. P1 tests the
  incoming counter `>= ECONOMY.pityRounds`, so preparation uses that threshold,
  not threshold minus one. All inn edits use `SaveStore.save` then `hub.showInn`;
  validation failures (including carry capacity) leave the previous save intact.
- Save reset asks once. JSON copy writes the clipboard when available and always
  fills the textarea (manual-copy fallback). Paste/import validates with SaveStore.
  Save mutation/import/reset is blocked during combat to prevent settlement
  overwriting edits. Only the current save key is reset; debug flag/backups remain.
- Combat: invulnerability restores HP before each tick, blocks ordinary hits and
  removes poison; one-hit multiplies the original player's damage by 100 (no
  compounding, reversible, carried into new runs); infinite MP restores each tick.
  Visible-monster wipe uses real simulation projectile collision/kill events and
  the usual trackRound drop reducer, never fabricated loot. It ignores immortal
  scarecrows and offscreen monsters; repeat after later spawns appear. Instant clear
  uses the normal next-tick terminal/settlement path, but bypasses stage objectives
  and grants normal clear rewards. Existing `?dev=1` weapon-override runs still do
  **not** persist rewards; test economy with a normal board sortie.
- Speed 0.5/1/2/4 scales accumulator ticks; the existing five-tick-per-frame safety
  cap remains (very slow rendering can prevent the full requested acceleration).
  Info overlay: frame FPS, tick, living-monster count, HP/MP, accumulated picked-up
  gold/gear by rarity/stones (capacity-rejected loot is not counted as received).
- Drop preview: monster, normal/elite/boss, 100/1000 seeds (0..N−1), hunt tier and
  threat. It calls pure `rollDrops` with `elite`, `boss`, `threat`, `huntTier` context,
  shows totals and average gold, and does not alter save/world. P3 owns rebalance.
- This is a cheat/testing surface, not anti-cheat or an authoritative economy.
  Debug runs break normal determinism and write real local progression.

### P3 extension registry

Register after debug has been enabled (do **not** statically import the debug
module into normal gameplay). Late registration updates the open panel; return
value unregisters the action. `run(ctx)` gets live world/save/tracker/running
getters, hub/store/renderer/input and `enqueue`/`persistSave` helpers. Queue combat state
writes for the next tick. Save helpers validate and reject combat-time changes.

```js
if (new URLSearchParams(location.search).get('debug') === '1') {
  const { registerDebugAction } = await import('./debug/index.js');
  registerDebugAction({ group: 'P3', label: '위협도 확인', run(ctx) {
    // Read the current P3 state, not a stale world captured at registration time.
    console.info(ctx.world?.round);
  } });
}
```

Verification (isolated debug ports):

```sh
node arpg/tools/stamp-assets.mjs
node --test arpg/test/*.test.js
ARPG_HTTP_PORT=8791 ARPG_CDP_PORT=9361 node arpg/test/browser-smoke.mjs
```

Smoke retains all prior cases, checks a disabled session's absence of DBG/debug
requests, and adds phone layout/touch-sized controls, gold/set grants, a normal
S2 sortie, invulnerability/visible wipe with real drops, clear settlement, live
registry, persisted activation/explicit disable, and desktop backtick toggling.

## Perfect-dodge counter and DEX/weight attack speed (engine proposal)

This user-requested combat extension supersedes design-v6 §8.1's old “AGI does
not affect attack speed” restriction. DEX is the existing `agi` / 민첩 stat;
no stat key or save-schema migration was added. Constants are proposals in
`content/balance.js`, not difficulty/economy retuning.

### Counter contract

- Only a real non-periodic enemy hit avoided by existing dodge invulnerability
  within the existing perfect window pays `dodge.perfectPaid`. An empty dodge,
  late ordinary iframe dodge, poison pulse or a counter hit cannot trigger it.
- `perfectDodge` includes `id`, `pid`, `attackerId`/`srcId`, `dodgeTick`, and the
  incoming `ability`. Projectile and explosion source IDs are their `ownerId`,
  never the projectile ID or a nearest-enemy guess. The first eligible hit pays
  once; overlapping hits cannot queue multiple counters for the same dodge.
- Each actor owns one pending counter. On the first free tick after BOTH dodge
  movement and invulnerability finish, it starts the current weapon's actual
  `slash` / `arrow` / `focus_pulse`. Damage ×1.35 and outgoing poise ×1.5 apply
  only to that counter (also snapshotted on its projectiles). Focus basic costs
  no mana. Existing exposure bonuses and gear modifiers still apply normally.
- The original attacker must still be alive, targetable, hostile and in basic
  range: blade uses its real shape facing that attacker; bow/focus use their
  620/520px projectile ranges measured center-to-center. Failure consumes the
  pending counter without selecting a substitute. No teleport, range extension,
  forced hit, or projectile-blocking bypass. Facing locks at action start;
  ordinary windup/shape/sweep mechanics can still miss or hit an intervening body.
- A valid pending counter takes precedence over held basic attack on the first
  free post-dodge tick. Held basic waits through any remaining iframe tail, then
  resumes normally after the counter; no duplicate basic starts alongside it.
  Explicit skill edges, scroll edges and buffered dodges retain priority. A
  counter never cancels an existing act, changes input, or forces movement.
  Its basic action retains ordinary movement slowdown and cancellation rules.
  Death, terminal state, return channel and a newly started dodge discard it.
  Expiry is `dodgeTick + max(dashTicks, iframeTicks) + ticks(300ms)`;
  after that tick no deferred counter starts. Invalid sources consume pending
  and allow held basic normally. HUD only shows “완벽 회피 · 반격 준비” and “자동 반격”; no render edits.

### Attack-rate formula and phase snapshot

Let `E = eff(save.stats.agi)` (existing soft knee), `W` be equipped weapon
weight clamped to [0,24], and `L` be actual carrying-load ratio (equipped gear,
remaining supplies and accumulated loot divided by current capacity):

```
A = clamp(0.02 * E, 0, 0.20)
rate = clamp((1 + A) / (1 + 0.0125*(W - 8)
                         + 0.5*max(0, min(L, 1.2) - 0.8)), 0.70, 1.20)
phaseTicks = max(1, round(phaseMs / rate / (1000/30)))
```

Zero-duration phases remain zero except active, which is at least one tick.
Player basic and current weapon skill alone use the rate; monster acts use 1.
The action captures `rate` and all four `phaseTicks` at start: later loot/consumption
or `setLoad` affects only the next action, never stretches an active action.
`buildRoundMods` carries capped AGI bonus and equipped weight; `setLoad` supplies
live carrying ratio. Direct sim callers without meta mods retain weight=8/bonus=0.

Base AGI 5, starter blade weight8, load≤80% retains exact previous timings.
Starter bow/focus rates are ~1.0256/~1.0526 (before 30Hz rounding). AGI bonus
caps at +20%; final rate caps at 1.20, floor .70. Weapon weight and overload can
only reduce rate; lighter gear and AGI cannot inflate it beyond the cap.
Rounding means small stat changes do not necessarily cross a phase-tick boundary.

Cooldown duration (started at act completion), dodge, potions, monster telegraphs,
projectile speed/range and normal damage/poise per hit are unchanged. Skill dash
step is distance/actual-active-ticks, preserving total dash distance (unless
ordinary arena bounds/collision/interruption stop it). Faster skills therefore
finish earlier and enter their unchanged cooldown earlier, not shorten that CD.

Verification: `node --test arpg/test/counter-speed.test.js` exercises multi-hit,
melee/projectile provenance, all families, exclusions, original-source validity,
co-op actor identity, blocking, input priority/expiry/cancel, monotonic caps,
meta/load plumbing, exact phase ticks, frozen load mutations, dash distance,
projectile speed, unchanged CDs/telegraphs and same-seed replay. Existing full
Node suite and isolated raw-CDP browser smoke remain required. Networking,
parent-owned visual feedback/gear rate UI and human feel/balance tuning are not
implemented by this engine patch.

## Personal quest equipment budget (10-11)

Equipment frequency is controlled in the existing reward reducer, independently
for each player's tracker (solo or co-op); it is **not** a shared party cap.
`createTracker(seed)` chooses `B = 1 + [mulberry32(seed XOR 0x71b0d6e3) < 0.10]`:
90% of quests have one equipment slot, 10% have two, never more than two. S1
training awards zero. The budget is an upper limit, not a completion-time mint:
non-boss quests still need actual successful equipment rolls from killed monsters.
Empty aborted quests award nothing; returning after an earned kill keeps only
that kill's accepted rewards, and death loses the existing temporary loot.

Every original `rollDrops` call still executes unchanged. Only its equipment
candidates are filtered; gold, materials, consumables, enhancement stones and
blessed/enchant scroll streams/probabilities are not retuned. A non-boss uses the
first original candidate(s) until its allowed slots are spent. On chief stages,
one slot is reserved until the chief is killed. The chief uses its original first
rolled item (including the existing rareless guarantee), **not** the highest
rarity from multiple discarded candidates. Threat still uses the original rarity
tables and elite/drop probabilities, but cannot increase the quest slot budget.

The first S4 chief still grants the existing fixed rare `chief_maul`; it occupies
the reserved boss slot instead of adding another item after a full bag of gear.
The existing clear-settlement chief fallback remains for direct/legacy callers;
if their two slots are full it replaces the weaker awarded item instead of adding
a third. Settlement also defensively clamps equipment to two (zero for training),
without truncating stacks. Natural item IDs, drop seeds, affixes and UIDs are
retained, with the existing deterministic collision recovery on re-entry.

`gearAwarded` is spent before pickup: weight overflow does not refund/reroll a
slot. Selling, storage or clearing `tempLoot.items` cannot reset it. Staged loot
continues to count in carrying weight; existing pickup/120%-load rules and death
loss are unchanged. Rareless boss gear, like ordinary gear, remains subject to
those existing weight/death rules. Trackers are round-local, not a new save
schema: serialized tracker continuation is deterministic, but the current main
module does not persist/resume an active round across a full page reload.
Saved stats, equipped gear, learned skills and receipts retain their format.

Verification:
- `node --test arpg/test/*.test.js`
- `node arpg/tools/stamp-assets.mjs --check`
- `node arpg/tools/balance/quest-gear.mjs 1000`

The diagnostic uses complete production encounter rosters (S2=30, S4=19,
S10=25, S20=33 kills), stage-rate seeded elite variants and threats 1–3. It is a
reward simulation assuming all monsters are killed, not a combat-success/AI
simulation. 1,000 seeds per scenario yield mean 1.087–1.096 equipment, absolute
maximum two; only S2/threat1 has zero drops in 5/1,000 completed rosters. It also
checks 900 first-chief/rareless scenarios and 100 training runs. Regression tests
exercise boss-last ordering, overflow, empty aborts, JSON tracker continuation,
SaveStore reload, repeated-seed UID collisions, unchanged non-gear rolls and
actual 2/4-player loopback event-journal settlement/duplicate delivery.
No parent main hook, networking authority or save migration is required.

An optional round-loot `chiefAwarded` marker travels through the unchanged main
settlement API. It records a successfully accepted S4 chief maul even if its
item is subsequently sold/stored, preventing the clear fallback from minting a
third piece. It adds no required save fields or schema version; persisted receipt
validation accepts optional loot metadata. The budget counter remains on the
tracker, and never uses the currently carried item count to refill slots.

## Active skill damage / mana / healing (combat-only handoff)

Nine damaging skills use doubled **content base damage**, not a global multiplier:
`lunge 52`, `volley 18` per projectile, `ember_bolt 60`, `whirl 44`,
`heavy_cleave 96`, `pierce_shot 48`, `blast_arrow 52`, `frost_lance 48`,
`flame_ring 68`. Basics, counter multipliers, monsters, geometry, projectile
blocking, phases and existing cooldowns are unchanged.

Every accepted skill cast pays MP once up front: blade `16/20/26`, bow
`16/18/24`, focus damage skills `14/12/18` (default / first / second book).
Insufficient MP does not cancel the current act, start an act or set a cooldown.
Existing cancellation consumes the paid MP without refund and starts the normal
completion/interruption cooldown. AUTO casts basics only, never these skills.

`healing_light` / **회복의 빛** is a 200 G focus magic book, first focus book
in catalog order, using the existing one-slot-per-family learning/equip/save path.
MP 28, cooldown 10s from completion/cancellation (existing `cdMult` applies).
Base phases are 500/100/100/300ms (windup/lock/active/recovery); normal attack-rate
snapshot applies. Windup/recovery can be dodge-canceled, like basic casting;
lock/active are committed. Existing lethal damage also cancels the action;
nonlethal damage does not interrupt player actions in this engine.
On the first active tick only, the caster and living, non-terminal same-team
players at center distance ≤160px gain `round(their own maxHp * .30)`, capped to
missing HP. No enemy/monster/dead healing, resurrection or periodic ticks.
Healing ignores damage/poise/potion multipliers and costs no extra MP per target.

The shape is a normal circle with `damage:0` and `heal:{radius,maxHpFrac}`;
`doActive` takes the heal path *instead of* damage. This preserves existing
shape-type helpers. Host-only sim emits `healCast` once, plus `heal` per positive
HP change. Existing snapshots already include every player's HP/MP/CD; the
existing acknowledged event journal deduplicates feedback, so no net/save schema
changes are required. A display-only module adds one green cast ring and green
`+actualHeal` numbers without hit-stop, shake, or combat mutation.

Parent integration: trainer/catalog detail should render **회복 30% 최대 HP ·
자신/160px 내 아군** instead of **피해 0**, and mark this first focus book **숙련**
when the shared grade helper lands. Add `healing_light:200` to the old exhaustive
price expectation in `inn-restructure.test.js`; that parent-owned UI test was
intentionally left unchanged here. Do not overwrite other parent book additions.

Damage rounding remains unchanged: explosion splash is 60% base, rounded once
at hit delivery. Ember splash is 18→36; blast-arrow splash is 16→31
(unrounded 15.6→31.2). Thus base damage is exactly doubled, while strict ≥2×
*displayed integer damage* is not guaranteed for every rounded splash/gear case.
Changing that requires a separate rounding policy decision, not silently raising
52 to 54 or retuning the shared damage path.

```sh
node --test arpg/test/skill-mana-heal.test.js
node arpg/tools/stamp-assets.mjs --check
ARPG_HTTP_PORT=8798 ARPG_CDP_PORT=9368 node arpg/test/skill-mana-heal-browser-smoke.mjs
```

The dedicated smoke uses the actual index, persisted focus book, existing manual
K input, real phases, healing ring/numbers, and two actual app documents over the
existing local BroadcastChannel co-op adapter. Only its host debug fixture seeds
missing HP and stationary enemies; healing itself travels through normal input,
host simulation, snapshots, journal and personal HUD. No screenshots or external
relay writes are needed. Existing full unit and general browser/co-op smokes are
still required before parent deployment.
