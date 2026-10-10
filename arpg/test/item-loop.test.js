import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSave, validateSave, SaveStore, SAVE_KEY } from '../js/meta/save.js';
import { ITEMS, instance, rollDrops, equip, carriedWeight, capacity, craft, dismantle, enhance, RECIPES } from '../js/meta/items.js';
import { deriveMods } from '../js/meta/stats.js';
import { rollAffixes, affixTotals, DEFERRED_AFFIXES, validAffixes } from '../js/meta/affixes.js';
import { SLOTS, ECONOMY, AFFIX_RANGES, ENHANCE_GOLD } from '../js/meta/economy.js';
import { shopStock, gearPrice, buyGear, sellItem, refreshShop, refreshPrice } from '../js/meta/shop.js';
import { compareItems } from '../js/meta/compare.js';
import { settleRound, trackRound, createTracker } from '../js/meta/run.js';
import { HubUI } from '../js/ui/hub.js';
import { createWorld, addPlayer } from '../js/sim/world.js';
import { buildRoundMods } from '../js/meta/run.js';

const fresh = () => createSave({ name: 'P1', answers: [0, 0, 0, 0, 0], createdAt: 123 });
const freeze = (value) => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const legacy = () => JSON.parse(readFileSync(new URL('./fixtures/save-v1-s4.json', import.meta.url)));
const storeWith = (raw) => {
  const values = new Map([[SAVE_KEY, raw]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  return { values, storage, store: new SaveStore(storage) };
};

test('old v1/v2 saves reset after corrupt backup; fresh v3 roundtrips without migration', () => {
  for (const version of [1,2]) {
    const old = { ...legacy(), version }, raw = JSON.stringify(old);
    const { values, storage } = storeWith(raw);
    const store = new SaveStore(storage, () => 1);
    assert.equal(store.load(), null); assert.equal(values.get(`${SAVE_KEY}.corrupt.1`), raw);
    assert.equal(values.has(SAVE_KEY), false);
    const current = fresh(); assert.equal(current.version, 3); store.save(current);
    assert.deepEqual(store.load(), current);
  }
});

test('corrupt backup or removal failure never overwrites original old save', () => {
  const raw = JSON.stringify(legacy());
  for (const failAt of [1,2]) {
    const { storage, values } = storeWith(raw); let calls=0;
    const store = new SaveStore({ ...storage,
      setItem: (key,value) => { if (++calls===failAt) throw new Error('quota'); storage.setItem(key,value); },
      removeItem: key => { if (++calls===failAt) throw new Error('quota'); storage.removeItem(key); } });
    assert.throws(() => store.load(), /quota/); assert.equal(values.get(SAVE_KEY), raw);
  }
  const {store,values}=storeWith(JSON.stringify({...legacy(),gold:-1}));
  assert.equal(store.load(),null);assert.equal(values.has(SAVE_KEY),false);
});

test('five slots: empty defaults preserve Lv1 numbers, all pieces/affixes/enhancement affect supported mods and weight', () => {
  const save = fresh();
  const base = deriveMods(freeze(save));
  assert.equal(base.maxHp, 108);
  assert.equal(base.dmgMult.blade, 1);
  assert.equal(base.family, 'blade');
  assert.equal(base.maxMp, 108);
  assert.equal(base.capacity, 106);
  assert.equal(carriedWeight(save), 17);
  const five = structuredClone(save);
  for (const slot of ['head', 'hands', 'feet']) {
    const item = instance(slot, `${slot}_heavy_common_t1`, 1, []);
    item.enhance = 5;
    five.items.push(item); five.equipped[slot] = item.uid;
  }
  const hp = ['head', 'hands', 'feet'].reduce((sum, slot) => sum + ITEMS[`${slot}_heavy_common_t1`].hp * 1.25, 0);
  close(deriveMods(five).maxHp, 108 + hp);
  assert.equal(carriedWeight(five), 27);
  for (const [key, field] of Object.entries({ hp_flat: 'maxHp', speed_pct: 'speedMult', dodge_pct: 'dodgeCdMult', potion_pct: 'potionHealMult', mana_pct: 'mpRegen', capacity_flat: 'capacity', gold_pct: 'goldBonus', material_pct: 'materialBonus' })) {
    const changed = structuredClone(save);
    changed.items[1].affixes = [{ k: key, v: 4 }];
    assert.notEqual(deriveMods(changed)[field], base[field], key);
  }
  const attack = structuredClone(save); attack.items[0].affixes = [{ k: 'atk_pct', v: 6 }];
  close(deriveMods(attack).dmgMult.blade, 1.06);
  const empty = structuredClone(save); empty.equipped = Object.fromEntries(SLOTS.map((slot) => [slot, null]));
  assert.equal(deriveMods(empty).maxHp, 108); assert.equal(carriedWeight(empty), 5);
  assert.equal(capacity(five), deriveMods(five).capacity);
  const savedFive = SLOTS.slice(1).reduce((next, slot) => equip(next, next.equipped[slot]), five);
  assert.ok(validateSave(savedFive));
  assert.deepEqual(storeWith(JSON.stringify(savedFive)).store.load(), savedFive);
  const modded = structuredClone(five);
  modded.items[0].affixes = [{ k: 'atk_pct', v: 6 }];
  modded.items[1].affixes = [{ k: 'mana_pct', v: 8 }, { k: 'potion_pct', v: 8 }];
  modded.items[2].affixes = [{ k: 'speed_pct', v: 4 }, { k: 'dodge_pct', v: 6 }];
  const mods = buildRoundMods(modded);
  const world = createWorld({ seed: 1 });
  const player = addPlayer(world, { pid: 'P1', mods });
  assert.equal(player.maxHp, mods.maxHp); assert.equal(player.mpRegen, mods.mpRegen);
  assert.equal(player.dmgMult.blade, mods.dmgMult.blade); assert.equal(player.dodgeCdMult, mods.dodgeCdMult);
  assert.equal(player.potionHealMult, mods.potionHealMult);
  assert.ok(player.speed > addPlayer(createWorld({ seed: 1 }), { pid: 'base', mods: buildRoundMods(save) }).speed);
  for (const slot of ['head', 'hands', 'feet']) for (const armorClass of ['light', 'medium', 'heavy']) {
    for (const [rarity, tier] of [['common', 1], ['fine', 1], ['fine', 2]]) {
      const item = ITEMS[`${slot}_${armorClass}_${rarity}_t${tier}`];
      assert.equal(item.slot, slot); assert.equal(item.armorClass, armorClass);
      assert.equal(item.requiredLevel, tier === 2 ? 5 : rarity === 'fine' ? 2 : 1);
    }
  }
});

test('affixes: 10,000 seeds deterministic counts, positive-only no cancellation/duplicates, global drop cap, unsupported options excluded', () => {
  assert.deepEqual(DEFERRED_AFFIXES, ['crit_chance', 'crit_damage', 'poise_resist']);
  for (let seed = 0; seed < 10000; seed++) for (const rarity of ['common', 'fine', 'rare', 'epic']) {
    const affixes = rollAffixes(rarity, 3, seed);
    assert.deepEqual(affixes, rollAffixes(rarity, 3, seed));
    assert.equal(affixes.length, ECONOMY.affixCount[rarity]);
    assert.equal(new Set(affixes.map(({ k }) => k)).size, affixes.length);
    assert.ok(affixes.every(({ k, v }) => Object.hasOwn(AFFIX_RANGES, k) && v >= 0));
    assert.ok(affixes.filter(({ k }) => ['gold_pct', 'material_pct'].includes(k)).reduce((s, { v }) => s + v, 0) <= 15);
  }
  const totals = affixTotals([{ affixes: [{ k: 'gold_pct', v: 14 }, { k: 'material_pct', v: 14 }] }, { affixes: [{ k: 'gold_pct', v: 14 }] }]);
  close(totals.gold_pct + totals.material_pct, 15);
  assert.equal(validAffixes({ affixes: [{ k: 'atk_pct', v: 2 }, { k: 'atk_pct', v: 3 }] }, { rarity: 'rare', huntTier: 1 }), false);
  assert.equal(validAffixes({ affixes: [{ k: 'crit_chance', v: 3 }] }, { rarity: 'fine', huntTier: 1 }), false);
});

const sigma = (count, n, p, label) => {
  const expected = n * p, tolerance = 2 * Math.sqrt(n * p * (1 - p));
  assert.ok(Math.abs(count - expected) <= tolerance, `${label}: ${count}/${n}, expected ${expected} ±${tolerance}`);
};

test('10,000 seeded kills: additive equipment rates, normal/boss rarity, stones and tier mix within ±2σ; legacy tables retained', () => {
  for (const [monster, ctx, gearP, stoneP] of [
    ['goblin_slinger', {}, 0.1, 0.125], ['goblin_slinger', { elite: true }, 0.35, 0.4],
    ['goblin_chief', {}, 1, 1],
  ]) {
    let gearKills = 0, stoneKills = 0, bossExtra = 0;
    const rarities = { common: 0, fine: 0, rare: 0, epic: 0 };
    const stoneTypes = [0, 0, 0];
    for (let seed = 0; seed < 10000; seed++) {
      const loot = rollDrops(monster, seed, ctx);
      assert.deepEqual(loot, rollDrops(monster, seed, ctx));
      const rolled = loot.items.filter((item) => item.uid.includes(':rolled:'));
      if (rolled.length) gearKills++;
      if (rolled.length === 2) bossExtra++;
      for (const item of rolled) rarities[ITEMS[item.id].rarity]++;
      const stones = stoneTypes.map((_, i) => loot.stacks[`enhance_stone_${i + 1}`] || 0);
      if (stones.some(Boolean)) stoneKills++;
      stones.forEach((count, i) => stoneTypes[i] += count);
      if (monster === 'goblin_chief') assert.equal(loot.stacks.scrap, 3);
    }
    sigma(gearKills, 10000, gearP, `${monster} gear`); sigma(stoneKills, 10000, stoneP, `${monster} stones`);
    if (gearP === 1) sigma(bossExtra, 10000, 0.5, 'boss 2 gear');
    const total = Object.values(rarities).reduce((a, b) => a + b, 0);
    const weights = gearP === 1 ? ECONOMY.bossRarity : ECONOMY.normalRarity;
    for (const [rarity, weight] of Object.entries(weights)) sigma(rarities[rarity], total, weight / 100, `${monster} ${rarity}`);
    const stoneTotal = stoneTypes.reduce((a, b) => a + b, 0);
    stoneTypes.forEach((count, i) => sigma(count, stoneTotal, ECONOMY.stoneWeights[1][i] / 100, `${monster} stone ${i + 1}`));
    console.log(`P1 distribution ${monster} elite=${ctx.elite || false}: gear=${gearKills}, stones=${stoneKills}, rarity=${JSON.stringify(rarities)}, stoneTypes=${stoneTypes}`);
  }
  const mixes = [];
  for (const tier of [1, 2, 3]) {
    const types = [0, 0, 0];
    for (let seed = 0; seed < 10000; seed++) {
      const drop = rollDrops('goblin_chief', seed, { huntTier: tier });
      types.forEach((_, i) => types[i] += drop.stacks[`enhance_stone_${i + 1}`] || 0);
    }
    const total = types.reduce((a, b) => a + b, 0);
    types.forEach((count, i) => sigma(count, total, ECONOMY.stoneWeights[tier][i] / 100, `tier ${tier} stone ${i + 1}`));
    mixes.push(types[2] / total);
  }
  assert.ok(mixes[0] < mixes[1] && mixes[1] < mixes[2]);
});

test('monster themes bias slots rather than force them; spirit weapons are focus', () => {
  for (const monster of ['wolf', 'rune_guardian', 'spirit']) {
    const slots = Object.fromEntries(SLOTS.map((slot) => [slot, 0]));
    for (let seed = 0; seed < 10000; seed++) {
      for (const item of rollDrops(monster, seed, { boss: true }).items.filter((item) => item.uid.includes(':rolled:'))) {
        slots[ITEMS[item.id].slot]++;
        if (monster === 'spirit' && ITEMS[item.id].slot === 'weapon') assert.equal(ITEMS[item.id].family, 'focus');
      }
    }
    assert.ok(Object.values(slots).every((count) => count > 0));
    if (monster === 'wolf') assert.ok(slots.feet > slots.body * 3 && slots.hands > slots.body * 3);
    if (monster === 'rune_guardian') assert.ok(slots.body > slots.hands * 3 && slots.head > slots.hands * 3);
    if (monster === 'spirit') assert.ok(slots.weapon > slots.body * 3);
  }
});

test('pity survives saves, guarantees next boss rare+, resets on received rare and never promotes lost temporary gear', () => {
  let save = fresh(); save.flags.chiefPity = true;
  for (let i = 0; i < 6; i++) save = settleRound(save, { stageId: 'S2', terminal: 'clear' }).save;
  assert.equal(save.rarelessRounds, 6);
  const { store } = storeWith(JSON.stringify(save)); save = store.load();
  for (let seed = 0; seed < 100; seed++) {
    const loot = rollDrops('goblin_chief', seed, { rarelessRounds: save.rarelessRounds });
    const first = loot.items.find((item) => item.uid.includes(':rolled:'));
    assert.ok(['rare', 'epic'].includes(ITEMS[first.id].rarity));
  }
  const loot = rollDrops('goblin_chief', 1, { rarelessRounds: 6 });
  assert.equal(settleRound(save, { stageId: 'S4', terminal: 'clear', tempLoot: loot }).save.rarelessRounds, 0);
  assert.equal(settleRound(save, { stageId: 'S4', terminal: 'return_scroll', tempLoot: loot }).save.rarelessRounds, 0);
  const dead = settleRound(save, { stageId: 'S4', terminal: 'death', tempLoot: loot });
  assert.deepEqual(dead.save.items, save.items); assert.equal(dead.save.rarelessRounds, 6);
  const tracker = trackRound(save, createTracker(1), [{ type: 'kill', monster: 'goblin_chief', xp: 40 }]).tracker;
  assert.ok(tracker.tempLoot.items.some((item) => ['rare', 'epic'].includes(ITEMS[item.id].rarity)));
});

test('reward affixes apply only through meta, shared cap prevents inflation and original no-affix seed remains unchanged', () => {
  let goldGain = 0, extraMaterials = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const base = rollDrops('goblin_grunt', seed);
    const bonus = rollDrops('goblin_grunt', seed, { goldBonus: 100, materialBonus: 100 });
    assert.ok(bonus.gold >= base.gold && bonus.gold <= Math.ceil(base.gold * 1.075));
    goldGain += bonus.gold - base.gold;
    extraMaterials += (bonus.stacks.scrap || 0) - (base.stacks.scrap || 0);
    assert.deepEqual(rollDrops('goblin_grunt', seed, { elite: false, threat: 1 }), base);
  }
  assert.ok(goldGain > 0);
  // Small gold piles retain expected bonuses through seeded stochastic rounding.
  assert.ok(rollDrops('goblin_chief', 1, { goldBonus: 15 }).gold > rollDrops('goblin_chief', 1).gold);
  assert.ok(extraMaterials > 0);
});

test('shop determinism, unique 6~8 gear stock, fine maximum/midpoint, sold-out state and 3-clear/paid refresh persistence', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const stock = shopStock(seed, 2);
    assert.deepEqual(stock, shopStock(seed, 2)); assert.ok(stock.length >= 6 && stock.length <= 8);
    assert.equal(new Set(stock.map(({ id }) => id)).size, stock.length);
    const weapons = stock.filter((item) => ITEMS[item.id].slot === 'weapon').length;
    assert.ok(weapons >= 3 && weapons <= 4);
    assert.ok(stock.length - weapons >= 3 && stock.length - weapons <= 4);
    for (const item of stock) {
      assert.ok(['common', 'fine'].includes(ITEMS[item.id].rarity)); assert.ok(item.affixes.length <= 1);
      for (const { k, v } of item.affixes) {
        const [min, max] = AFFIX_RANGES[k];
        assert.ok(v <= Math.floor((min + max * ITEMS[item.id].huntTier) / 2));
      }
      assert.equal(item.price, gearPrice(item));
    }
  }
  let save = fresh(); save.gold = 10000;
  const stock = shopStock(save.createdAt, 0);
  save = buyGear(freeze(save), stock[0].uid);
  assert.throws(() => buyGear(save, stock[0].uid), /재고/);
  assert.throws(() => buyGear(save, 'fake'), /재고/);
  for (const expected of [20, 40, 80]) { assert.equal(refreshPrice(save), expected); save = refreshShop(save); }
  assert.equal(save.shopRefresh, 3);
  for (let i = 0; i < 3; i++) save = settleRound(save, { stageId: 'S1', terminal: 'clear' }).save;
  assert.equal(save.shopRefresh, 4); assert.equal(save.completedRounds, 3); assert.equal(save.paidRefreshes, 0);
  assert.equal(refreshPrice(save), 20); assert.deepEqual(save.shopBought, []); assert.ok(validateSave(save));
});

test('economy properties over 1,000 stocks: buy/sell, buy/dismantle/craft/sell and craft/enhance/sell cannot mint gold or refunded stones', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const save = fresh(); save.createdAt = seed; save.gold = 100000;
    save.stacks = { ...save.stacks, ...Object.fromEntries(Object.entries(ITEMS).filter(([, item]) => item.kind === 'material').map(([id]) => [id, 1000])) };
    const before = freeze(save);
    for (const stock of shopStock(seed, 0)) {
      const bought = buyGear(before, stock.uid);
      const item = bought.items.at(-1);
      const sold = sellItem(bought, item.uid);
      assert.ok(sold.gold < before.gold);
      assert.deepEqual(sold.items, before.items);
      assert.throws(() => sellItem(sold, item.uid));
      const salvage = dismantle(bought, item.uid);
      for (const id of Object.keys(RECIPES)) {
        const crafted = craft(salvage, id); const craftItem = crafted.items.at(-1);
        assert.ok(sellItem(crafted, craftItem.uid).gold < before.gold);
      }
    }
    for (const id of Object.keys(RECIPES)) {
      let made = craft(before, id); const item = made.items.at(-1);
      const sellBefore = gearPrice(item);
      for (let level = 0; level < 5; level++) made = enhance(made, item.uid);
      assert.equal(gearPrice(made.items.at(-1)), sellBefore);
      assert.equal(made.gold, before.gold - RECIPES[id].gold - ENHANCE_GOLD.reduce((a, b) => a + b, 0));
      const salvaged = dismantle(made, item.uid);
      for (const stone of ['enhance_stone_1', 'enhance_stone_2', 'enhance_stone_3']) assert.equal(salvaged.stacks[stone], made.stacks[stone]);
      assert.ok(salvaged.stacks.scrap < before.stacks.scrap);
      assert.ok(sellItem(made, item.uid).gold < before.gold);
    }
  }
  assert.throws(() => sellItem(fresh(), fresh().equipped.weapon), /장착/);
});

test('compare contract: exact attack/HP/weight/affix deltas, empty slot, same-slot only, required-level and candidate capacity locks', () => {
  const save = fresh();
  const old = save.items[0];
  const candidate = instance('candidate', 'iron_sword', 1, [{ k: 'atk_pct', v: 6 }]); candidate.enhance = 5;
  const compare = compareItems(freeze(old), freeze(candidate), freeze(save));
  close(compare.lines.find(({ key }) => key === 'attack').to, 1.15 * 1.25 * 1.06);
  assert.equal(compare.lines.find(({ key }) => key === 'weight').delta, 4);
  assert.equal(compare.lines.find(({ key }) => key === 'weight').good, false);
  assert.equal(compare.weightAfter, 21); assert.equal(compare.weightLimit, 106);
  assert.equal(compare.locked, true); assert.match(compare.lockReason, /Lv2/);
  assert.equal(compare.lines.find(({ key }) => key === 'atk_pct').delta, 6);
  const head = instance('head', 'head_light_common_t1', 1, []);
  const empty = compareItems(null, head, save);
  assert.equal(empty.lines.find(({ key }) => key === 'maxHp').delta, 4);
  assert.equal(empty.locked, false); assert.equal(empty.weightAfter, 19);
  assert.throws(() => compareItems(old, head, save), /동일/);
  const loaded = structuredClone(save); loaded.stacks.potion = 112;
  const blocked = compareItems(null, instance('h', 'head_heavy_common_t1', 0, []), loaded);
  assert.equal(blocked.locked, true); assert.match(blocked.lockReason, /120%/);
  const capacityHead = instance('h', 'head_heavy_common_t1', 0, [{ k: 'capacity_flat', v: 6 }]);
  const allowed = compareItems(null, capacityHead, loaded);
  assert.equal(allowed.weightLimit, 112); assert.equal(allowed.locked, false);
});

test('temporary hub wiring renders five slots, comparison, stock, stone costs and item receipt without new design', () => {
  const hub = Object.create(HubUI.prototype);
  hub.save = fresh(); hub.save.gold = 10000;
  hub.selectedUid = hub.save.equipped.weapon;
  hub.showInnPanel = (_title, html) => { hub.html = html; };
  hub.showForge();
  for (const slot of SLOTS) assert.match(hub.html, new RegExp(slot));
  assert.match(hub.html, /하급 강화석 1/);
  assert.match(hub.gearShopHtml(), /refresh-shop/);
  assert.match(hub.gearShopHtml(), /공격력/);
  const receipt = settleRound(hub.save, { stageId: 'S2', terminal: 'clear', tempLoot: { gold: 1, stacks: {}, items: [instance('drop', 'iron_sword', 1)] } }).receipt;
  assert.match(hub.receiptHtml(receipt), /철검/); assert.match(hub.receiptHtml(receipt), /▲/);
  assert.doesNotMatch(hub.html, /undefined|NaN/);
});
