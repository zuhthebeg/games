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
