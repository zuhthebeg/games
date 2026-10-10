import test from 'node:test';
import assert from 'node:assert/strict';
import { STAT_KEYS, eff, cap, deriveMods, allocateStats } from '../js/meta/stats.js';
import { xpSpan, addXp, deathLoss, stageXp } from '../js/meta/progression.js';
import {
  ITEMS, RECIPES, ENHANCE_GOLD, enhanceMultiplier, rollDrops, dropSeed,
  equip, craft, dismantle, dismantleRefund, enhance, buy, shopPrice, carriedWeight, capacity,
} from '../js/meta/items.js';
import { resolve } from '../js/meta/quiz.js';
import { createSave, SaveStore, SAVE_KEY, validateSave } from '../js/meta/save.js';
import {
  emptyLoot, buildRoundMods, createTracker, trackRound, settleRound, usedConsumables, currentLoad,
} from '../js/meta/run.js';
import { createWorld, addPlayer, startStage, step, setLoad, emptyInput, getTelegraphs } from '../js/sim/world.js';
import { shapeHitsCircle } from '../js/sim/core.js';

const fresh = () => createSave({ name: '용사', answers: [0, 0, 0, 0, 0], createdAt: 123 });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
};

// Every externally-facing transformation is checked against frozen inputs below.
test('stats: effective points, cap, all derived formulas and allocation are pure', () => {
  assert.equal(eff(4), 0);
  assert.equal(eff(15), 10);
  assert.equal(eff(25), 17);
  assert.equal(cap(1), 20);
  assert.equal(cap(20), 30);
  assert.equal(cap(40), 40);
  const save = fresh();
  save.level = 10;
  save.stats = { str: 25, agi: 40, int: 25, wis: 40, cha: 40 };
  save.items[0] = { uid: 'starter:weapon', id: 'ember_wand', enhance: 5 };
  save.items[1] = { uid: 'starter:armor', id: 'boar_hide_armor', enhance: 5 };
  const mods = deriveMods(freeze(save));
  near(mods.maxHp, 223.75);
  near(mods.maxMp, 168);
  near(mods.mpRegen, 5 * (1 + 0.03 * 27.5));
  near(mods.speedMult, 1.1);
  near(mods.dodgeCdMult, 0.8 / 1.15);
  near(mods.iframeBonusMs, 60);
  near(mods.potionHealMult, 1.25);
  near(mods.poiseMult, 1.34);
  near(mods.dmgMult.focus, 1.15 * 1.25 * 1.27 * 1.34);
  assert.equal(mods.dmgMult.blade, 1);
  assert.equal(mods.dmgMult.bow, 1);
  assert.equal(mods.capacity, 120);
  assert.equal(mods.shopDiscount, 0.1);
  const base = addXp(fresh(), 50);
  freeze(base);
  const next = allocateStats(base, { agi: 3 });
  assert.equal(next.stats.agi, base.stats.agi + 3);
  assert.equal(next.statPoints, 0);
  assert.throws(() => allocateStats(base, { agi: 4 }));
  assert.throws(() => allocateStats(base, { str: -1 }));
  assert.throws(() => allocateStats(base, { nope: 1 }));
  const capped = { ...base, stats: { ...base.stats, str: 20 } };
  assert.throws(() => allocateStats(capped, { str: 1 }));
});

test('progression: multi-level, maximum, course loss factors and never level down', () => {
  assert.equal(xpSpan(1), 50);
  assert.equal(xpSpan(2), 141);
  const base = freeze(fresh());
  const multi = addXp(base, 50 + 141 + 25);
  assert.equal(multi.level, 3);
  assert.equal(multi.xp, 25);
  assert.equal(multi.statPoints, 6);
  const max = addXp(base, 999999);
  assert.equal(max.level, 30);
  assert.equal(max.xp, 0);
  assert.equal(max.statPoints, 87);
  assert.deepEqual(addXp(max, 1000), max);
  const cappedReward = settleRound(max, { stageId: 'S4', terminal: 'clear', depositedXp: 40 });
  assert.equal(cappedReward.receipt.xpGained, 0);
  assert.equal(cappedReward.receipt.xpDiscarded, 300);
  assert.equal(cappedReward.save.xp, 0);
  assert.equal(validateSave(cappedReward.save), true);
  for (const stageId of ['S1', 'S2', 'S3']) assert.equal(deathLoss(multi, stageId), 0);
  assert.equal(deathLoss(multi, 'S4'), 25);
  const enoughXp = { ...multi, xp: 100 };
  assert.equal(deathLoss(enoughXp, 'S4'), 26);
  const fractional = { ...multi, level: 6, xp: 100 };
  assert.equal(deathLoss(fractional, 'S4'), 73.5);
  for (const stageId of ['S1', 'S2', 'S3', 'S4']) {
    const result = settleRound(multi, { stageId, terminal: 'death' });
    assert.equal(result.save.level, 3);
    assert.ok(result.save.xp >= 0);
  }
  assert.equal(stageXp(base, 'S1'), 50);
  assert.equal(stageXp({ ...base, cleared: { ...base.cleared, S1: true } }, 'S1'), 13);
});

test('quiz: exhaust all 4^5 choices, bounded six points, deterministic and Q5 ties', () => {
  const weapons = new Set();
  for (let combination = 0; combination < 1024; combination++) {
    const answers = Array.from({ length: 5 }, (_, index) => (combination >> (2 * index)) & 3);
    const result = resolve(answers);
    assert.deepEqual(resolve(answers), result);
    const points = STAT_KEYS.map((key) => result.points[key]);
    assert.equal(points.reduce((sum, value) => sum + value, 0), 6);
    assert.ok(points.every((value) => Number.isInteger(value) && value >= 0 && value <= 3));
    weapons.add(result.weapon);
    const max = Math.max(...result.weaponScores);
    const q5Family = ['blade', 'bow', 'focus', 'blade'][answers[4]];
    if (result.weaponScores[['blade', 'bow', 'focus'].indexOf(q5Family)] === max) {
      assert.equal(result.weapon, q5Family);
    }
  }
  assert.equal(weapons.size, 3);
  const override = createSave({ name: '별', answers: [0, 0, 0, 0, 0], weapon: 'focus', createdAt: 1 });
  assert.equal(override.quiz.overridden, true);
  assert.deepEqual(override.stats, fresh().stats);
  assert.throws(() => resolve([4, 0, 0, 0, 0]));
  assert.throws(() => resolve([0]));
});

test('drops: deterministic, table ranges and probabilities over seeded population', () => {
  for (const monster of ['goblin_grunt', 'goblin_slinger', 'iron_boar', 'goblin_chief', 'scarecrow']) {
    for (let seed = 0; seed < 100; seed++) assert.deepEqual(rollDrops(monster, seed), rollDrops(monster, seed));
  }
  assert.deepEqual(rollDrops('scarecrow', 1), emptyLoot());
  assert.notEqual(dropSeed(1, 0), dropSeed(1, 1));
  let cleavers = 0;
  let mauls = 0;
  for (let seed = 0; seed < 10000; seed++) {
    const grunt = rollDrops('goblin_grunt', seed);
    const chief = rollDrops('goblin_chief', seed);
    assert.ok(grunt.gold >= 3 && grunt.gold <= 6);
    assert.ok(chief.gold >= 25 && chief.gold <= 40);
    assert.equal(chief.stacks.scrap, 3);
    assert.equal(chief.stacks.fang, 2);
    cleavers += grunt.items.filter((item) => !item.uid.includes(':rolled:')).length;
    mauls += chief.items.filter((item) => !item.uid.includes(':rolled:')).length;
    const boar = rollDrops('iron_boar', seed);
    assert.equal(boar.stacks.hide, 2);
    assert.ok(boar.stacks.scrap >= 1 && boar.stacks.scrap <= 2);
  }
  assert.ok(cleavers > 500 && cleavers < 700, `cleavers: ${cleavers}`);
  assert.ok(mauls > 2300 && mauls < 2700, `mauls: ${mauls}`);
});

test('economy: every craft/dismantle cycle loses resources; enhance never refunds', () => {
  for (const [id, recipe] of Object.entries(RECIPES)) {
    const base = fresh();
    base.gold = 10000;
    base.stacks = { ...base.stacks, ...Object.fromEntries(Object.entries(ITEMS)
      .filter(([, item]) => item.kind === 'material').map(([material]) => [material, 100])) };
    freeze(base);
    const crafted = craft(base, id);
    const item = crafted.items.at(-1);
    assert.ok(item.uid.startsWith('craft:'));
    assert.equal(dismantleRefund(item), Math.floor(recipe.scrap / 4));
    const cycle = dismantle(crafted, item.uid);
    assert.ok(cycle.gold < base.gold);
    assert.ok(cycle.stacks.scrap < base.stacks.scrap);
    assert.deepEqual(cycle.items, base.items);
    for (const material of Object.keys(recipe).filter((key) => key !== 'gold')) {
      assert.ok(cycle.stacks[material] <= base.stacks[material]);
    }
    assert.throws(() => dismantle(cycle, item.uid));
    let upgraded = crafted;
    for (let level = 0; level < 5; level++) upgraded = enhance(upgraded, item.uid);
    assert.equal(upgraded.items.at(-1).enhance, 5);
    assert.equal(upgraded.gold, crafted.gold - ENHANCE_GOLD.reduce((sum, value) => sum + value, 0));
    assert.equal(upgraded.stacks.scrap, crafted.stacks.scrap);
    assert.equal(upgraded.stacks.enhance_stone_1, 98);
    assert.equal(upgraded.stacks.enhance_stone_2, 97);
    assert.equal(upgraded.stacks.enhance_stone_3, 98);
    near(enhanceMultiplier(5), 1.25);
    const refund = dismantle(upgraded, item.uid);
    assert.equal(refund.stacks.scrap - upgraded.stacks.scrap, dismantleRefund(item));
    assert.equal(refund.gold, upgraded.gold);
    assert.throws(() => enhance(upgraded, item.uid));
    const again = craft(crafted, id);
    assert.notEqual(again.items.at(-1).uid, item.uid);
  }
  const poor = freeze(fresh());
  assert.throws(() => craft(poor, 'iron_sword'));
  assert.throws(() => enhance(poor, poor.equipped.weapon));
  assert.throws(() => dismantle(poor, poor.equipped.weapon));
  assert.throws(() => dismantle(poor, poor.equipped.body));
});

test('equipment, shop, storage weight, carry limit and no creation on failure', () => {
  const base = fresh();
  const weight = carriedWeight(base);
  base.items.push({ uid: 'loot', id: 'chief_maul', enhance: 0, affixes: [], rolledAt: 0 });
  base.stacks.scrap = 5000;
  assert.equal(carriedWeight(base), weight);
  assert.throws(() => equip(base, 'loot'));
  const leveled = addXp(base, 1000);
  const changed = equip(leveled, 'loot');
  assert.equal(carriedWeight(changed), weight + 10);
  assert.equal(dismantleRefund({ uid: 'drop:1', id: 'chief_maul', enhance: 5 }), 12);
  const bought = buy(freeze(base), 'potion', 2);
  assert.equal(bought.gold, 10);
  assert.equal(bought.stacks.potion, 5);
  assert.equal(carriedWeight(bought), weight + 2);
  assert.throws(() => buy(base, 'potion', 4));
  assert.throws(() => buy(base, 'potion', -1));
  assert.throws(() => buy(base, 'return_scroll', 2));
  assert.throws(() => buy(base, 'scrap'));
  assert.equal(shopPrice({ ...base, stats: { ...base.stats, cha: 40 } }, 'potion'), 9);
  assert.equal(shopPrice({ ...base, stats: { ...base.stats, cha: 6 } }, 'mana_potion'), 12);
  assert.equal(base.gold, 30);
  assert.equal(base.stacks.potion, 3);
});

const loot = () => ({
  gold: 10, stacks: { scrap: 2, hide: 1, potion: 1 },
  items: [{ uid: 'drop:123', id: 'goblin_cleaver', enhance: 0, affixes: [], rolledAt: 0 }],
});

test('settlement clear promotes loot and XP, first/replay rewards and pity only once', () => {
  const base = freeze(fresh());
  const first = settleRound(base, {
    stageId: 'S1', terminal: 'clear', depositedXp: 0, tempLoot: loot(), used: { potions: 2, scrolls: 1 },
  });
  assert.equal(first.save.level, 2);
  assert.equal(first.save.statPoints, 3);
  assert.equal(first.save.gold, 40);
  assert.equal(first.save.stacks.potion, 2);
  assert.equal(first.save.stacks.return_scroll, 0);
  assert.equal(first.save.items.length, 3);
  assert.equal(first.save.cleared.S1, true);
  assert.equal(first.receipt.xpGained, 50);
  assert.equal(first.receipt.levelsGained, 1);
  assert.equal(first.receipt.used.potion, 2);
  assert.ok(validateSave(first.save));
  assert.deepEqual(first.save.lastReceipt, first.receipt);
  const replay = settleRound(first.save, { stageId: 'S1', terminal: 'clear', depositedXp: 8 });
  assert.equal(replay.receipt.stageXp, 13);
  assert.equal(replay.receipt.xpGained, 21);
  assert.equal(replay.save.xp, 21);
  const pity = settleRound(first.save, { stageId: 'S4', terminal: 'clear' });
  assert.equal(pity.save.items.filter((item) => item.id === 'chief_maul').length, 1);
  assert.equal(pity.save.flags.chiefPity, true);
  assert.equal(pity.receipt.pityGranted, true);
  const second = settleRound(pity.save, { stageId: 'S4', terminal: 'clear' });
  assert.equal(second.save.items.filter((item) => item.id === 'chief_maul').length, 1);
  const natural = loot();
  natural.items = [{ uid: 'drop:chief', id: 'chief_maul', enhance: 0, affixes: [], rolledAt: 0 }];
  const rolled = settleRound(first.save, { stageId: 'S4', terminal: 'clear', tempLoot: natural });
  assert.equal(rolled.save.items.filter((item) => item.id === 'chief_maul').length, 1);
  assert.equal(rolled.receipt.pityGranted, false);
});

test('return keeps loot but forfeits XP, death loses both, starter restored once', () => {
  const base = freeze(addXp(fresh(), 60));
  const returned = settleRound(base, {
    stageId: 'S2', terminal: 'return_scroll', depositedXp: 20, tempLoot: loot(), used: { scrolls: 1 },
  });
  assert.equal(returned.save.xp, 10);
  assert.equal(returned.save.gold, 40);
  assert.equal(returned.save.cleared.S2, false);
  assert.equal(returned.receipt.xpForfeited, 20);
  assert.equal(returned.save.stacks.return_scroll, 0);
  const died = settleRound(base, {
    stageId: 'S2', terminal: 'death', depositedXp: 20, tempLoot: loot(),
    used: { potions: 3, manaPotions: 1, scrolls: 1 },
  });
  assert.equal(died.save.gold, 30);
  assert.equal(died.save.xp, 10);
  assert.equal(died.save.items.length, 2);
  assert.equal(died.save.flags.starterRestoreUsed, true);
  assert.deepEqual(died.receipt.restored, { potion: 3, mana_potion: 1, return_scroll: 1 });
  assert.deepEqual(died.receipt.lootLost, loot());
  const twice = settleRound(died.save, { stageId: 'S2', terminal: 'death', used: { potions: 3 } });
  assert.equal(twice.save.stacks.potion, 0);
  assert.deepEqual(twice.receipt.restored, {});
  const elite = settleRound(base, { stageId: 'S4', terminal: 'death' });
  assert.equal(elite.save.level, base.level);
  assert.equal(elite.save.xp, 0);
  assert.equal(elite.receipt.xpLost, 10);
  assert.throws(() => settleRound(base, { stageId: 'S2', terminal: 'death', used: { potions: 4 } }));
});

test('round reducer: deposits XP, deterministic drops, rejects weight overflow, subtracts consumption', () => {
  const base = fresh();
  const event = { type: 'kill', monster: 'goblin_chief', xp: 40, x: 1, y: 2 };
  const tracker = freeze(createTracker(1));
  const result = trackRound(freeze(base), tracker, [event]);
  assert.deepEqual(result, trackRound(base, tracker, [event]));
  assert.equal(result.tracker.depositedXp, 40);
  assert.equal(result.tracker.killIndex, 1);
  assert.equal(tracker.depositedXp, 0);
  assert.equal(result.fx[0].type, 'drop');
  const full = structuredClone(base);
  full.stacks.potion = Math.floor(capacity(full) * 1.2) - 12 - 2;
  const heavy = trackRound(full, createTracker(1), [event]);
  assert.ok(heavy.tracker.skipped > 0);
  assert.ok(heavy.load.ratio <= 1.2);
  assert.equal(heavy.fx[0].rejected, true);
  const lighter = currentLoad(base, createTracker(1), { potions: 1, manaPotions: 1 });
  assert.equal(lighter.weight, carriedWeight(base) - 2);
  const mods = buildRoundMods(base);
  const world = createWorld({ seed: 1 });
  const player = addPlayer(world, { pid: 'local', weapon: 'blade', mods });
  player.mp = 0;
  step(world, { local: { ...emptyInput(), manaEdge: true } });
  assert.equal(usedConsumables(base, player).manaPotions, 1);
  setLoad(world, 'local', lighter.ratio);
  assert.equal(player.loadRatio, lighter.ratio);
});

test('save adapter: roundtrip, reset, corrupt/unknown versions back up before fresh start', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const store = new SaveStore(storage, () => 999);
  assert.equal(store.load(), null);
  store.save(fresh());
  assert.deepEqual(store.load(), fresh());
  const settled = settleRound(fresh(), { stageId: 'S1', terminal: 'clear' });
  store.save(settled.save);
  assert.deepEqual(store.load().lastReceipt, settled.receipt);
  store.save(fresh());
  const copy = store.load();
  copy.gold = 0;
  assert.equal(store.load().gold, 30);
  store.reset();
  assert.equal(store.load(), null);
  for (const raw of ['{broken', '{"version":42}', JSON.stringify({ ...fresh(), gold: -1 })]) {
    storage.setItem(SAVE_KEY, raw);
    assert.equal(store.load(), null);
    assert.equal(storage.getItem(`${SAVE_KEY}.corrupt.999`), raw);
    assert.equal(storage.getItem(SAVE_KEY), null);
  }
  for (const mutate of [
    (save) => save.items[0].enhance = 9,
    (save) => save.equipped.weapon = 'missing',
    (save) => save.stacks.return_scroll = 3,
    (save) => save.stats.str = 99,
    (save) => save.quiz.answers = [0],
    (save) => save.items.push({ ...save.items[0] }),
    (save) => save.lastReceipt = { stageId: 'S4', lootKept: null },
  ]) {
    const invalid = fresh();
    mutate(invalid);
    assert.equal(validateSave(invalid), false);
    assert.throws(() => store.save(invalid));
  }
  const blocked = new SaveStore({
    ...storage,
    setItem: () => { throw new Error('quota'); },
  });
  storage.setItem(SAVE_KEY, '{bad');
  assert.throws(() => blocked.load());
  assert.equal(storage.getItem(SAVE_KEY), '{bad');
});

test('integration: S1 timed clear reaches Lv2 using real sim API and settles valid save', () => {
  const save = fresh();
  const world = createWorld({ seed: 3 });
  const player = addPlayer(world, { pid: 'local', weapon: 'blade', mods: buildRoundMods(save) });
  startStage(world, 'S1');
  let tracker = createTracker(3);
  for (let tick = 0; tick < 900; tick++) {
    const events = step(world);
    const result = trackRound(save, tracker, events, usedConsumables(save, player));
    tracker = result.tracker;
    setLoad(world, 'local', result.load.ratio);
  }
  assert.equal(player.terminal, 'clear');
  const result = settleRound(save, { stageId: 'S1', terminal: player.terminal, ...tracker });
  assert.equal(result.save.level, 2);
  assert.equal(result.save.statPoints, 3);
  assert.equal(validateSave(result.save), true);
});

test('integration: input-driven S1 → S2 → S3 → S4 loop unlocks rare gear and persists valid receipts', () => {
  let save = settleRound(fresh(), { stageId: 'S1', terminal: 'clear' }).save;
  save = allocateStats(save, { agi: 3 });
  const receipts = [];
  for (const stageId of ['S2', 'S3', 'S4']) {
    const seed = 11;
    const world = createWorld({ seed });
    const player = addPlayer(world, {
      pid: 'local', weapon: ITEMS[equippedItemForTest(save).id].family, mods: buildRoundMods(save),
    });
    startStage(world, stageId);
    let tracker = createTracker(seed);
    for (let tick = 0; tick < 7200 && world.round.state === 'running'; tick++) {
      const threats = getTelegraphs(world);
      const danger = threats.find((telegraph) =>
        (telegraph.phase === 'lock' || telegraph.progress > 0.7)
        && shapeHitsCircle(telegraph.shape, telegraph.ox, telegraph.oy,
          telegraph.facing, player.x, player.y, player.r + 12));
      const targets = world.entities.filter((entity) =>
        entity.kind === 'monster' && !entity.dead && !entity.spawnLeft);
      targets.sort((left, right) => Math.hypot(left.x - player.x, left.y - player.y)
        - Math.hypot(right.x - player.x, right.y - player.y));
      const target = targets[0];
      const input = emptyInput();
      input.potionEdge = player.hp < player.maxHp * 0.45;
      if (danger) {
        input.mx = -Math.sin(danger.facing);
        input.my = Math.cos(danger.facing);
        input.dodgeEdge = true;
      } else if (target) {
        const deltaX = target.x - player.x;
        const deltaY = target.y - player.y;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        input.mx = distance > 70 ? deltaX / distance : 0;
        input.my = distance > 70 ? deltaY / distance : 0;
        input.attack = distance < 110;
        input.skillEdge = distance < 160;
      }
      const events = step(world, { local: input });
      const result = trackRound(save, tracker, events, usedConsumables(save, player));
      tracker = result.tracker;
      setLoad(world, 'local', result.load.ratio);
    }
    assert.equal(player.terminal, 'clear', `${stageId} failed, hp=${player.hp}`);
    const result = settleRound(save, {
      stageId, terminal: player.terminal, depositedXp: tracker.depositedXp,
      tempLoot: tracker.tempLoot, used: usedConsumables(save, player),
    });
    save = result.save;
    receipts.push(result.receipt);
    assert.ok(validateSave(save));
    if (save.statPoints) save = allocateStats(save, { agi: save.statPoints });
  }
  assert.equal(save.level, 4);
  assert.ok(save.cleared.S4);
  assert.ok(save.flags.chiefPity);
  assert.ok(save.items.some((item) => item.id === 'chief_maul'));
  assert.deepEqual(receipts.map((receipt) => receipt.depositedXp), [23, 24, 55]);
  assert.deepEqual(receipts.map((receipt) => receipt.stageXp), [100, 180, 260]);
});

function equippedItemForTest(save) {
  return save.items.find((item) => item.uid === save.equipped.weapon);
}
