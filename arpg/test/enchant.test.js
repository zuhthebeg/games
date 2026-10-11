import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, SaveStore, SAVE_KEY, validateSave } from '../js/meta/save.js';
import { instance, dismantle, rollDrops } from '../js/meta/items.js';
import { ENCHANT, enhanceMultiplier } from '../js/meta/economy.js';
import { enchant, enchantPreview, craftScroll, crackGreaterStone, scrollsFor } from '../js/meta/enchant.js';

const fresh = (createdAt = 7) => createSave({ name: '강화 시험', answers: [0, 0, 0, 0, 0], createdAt });
const W = 'scroll_enchant_weapon', A = 'scroll_enchant_armor', BW = 'scroll_blessed_weapon';
const withScrolls = (save, n = 100) => ({ ...save, stacks: { ...save.stacks, [W]: n, [A]: n, [BW]: n } });
const weaponAt = (save, level) => ({ ...save, items: save.items.map((item) => item.uid === 'starter:weapon' ? { ...item, enhance: level } : item) });

test('safe line: +0→+6 always succeeds, costs exactly one scroll and no gold', () => {
  let save = withScrolls(fresh());
  for (let level = 0; level < ENCHANT.safe; level++) {
    const { save: next, result } = enchant(save, 'starter:weapon', W);
    assert.equal(result.outcome, 'success'); assert.equal(result.from, level); assert.equal(result.to, level + 1);
    assert.equal(result.risky, false);
    assert.equal(next.stacks[W], save.stacks[W] - 1); assert.equal(next.gold, save.gold);
    assert.ok(validateSave(next));
    save = next;
  }
  assert.equal(enchantPreview(save, 'starter:weapon', W).risky, true);
});

test('scroll family must match the slot; no scroll or +10 refuses without spending', () => {
  const save = withScrolls(fresh());
  assert.throws(() => enchant(save, 'starter:weapon', A), /쓸 수 없는/);
  assert.throws(() => enchant(save, 'starter:armor', W), /쓸 수 없는/);
  assert.ok(enchant(save, 'starter:armor', A).save);
  assert.throws(() => enchant(fresh(), 'starter:weapon', W), /없습니다/);
  assert.throws(() => enchant(weaponAt(save, ENCHANT.max), 'starter:weapon', W), /최대/);
  assert.equal(scrollsFor(save.items[1]).normal, A);
});

test('risky rates over 4,000 accounts match 50/40/30/20 within ±3σ; failure destroys and refunds half the stones', () => {
  for (const [level, rate] of Object.entries(ENCHANT.rates).map(([l, r]) => [Number(l), r])) {
    let kept = 0;
    const n = 4000;
    for (let seed = 1; seed <= n; seed++) {
      const save = weaponAt(withScrolls(fresh(seed)), level);
      save.items.push(instance('spare', 'iron_sword', 1, []));
      const { save: next, result } = enchant(save, 'starter:weapon', W);
      assert.ok(validateSave(next), `valid after ${result.outcome}`);
      if (result.outcome === 'success') { kept++; assert.equal(result.to, level + 1); continue; }
      assert.equal(next.items.some((item) => item.uid === 'starter:weapon'), false);
      const refund = Math.floor(ENCHANT.dismantleStones[level] * ENCHANT.failRefund);
      assert.equal(next.stacks.enhance_stone_1 || 0, refund);
      assert.equal(next.stacks.enhance_stone_3 || 0, 0);
      assert.equal(next.equipped.weapon, 'spare');
    }
    const sd = Math.sqrt(n * rate * (1 - rate));
    assert.ok(Math.abs(kept - n * rate) <= 3 * sd, `+${level}: kept ${kept}/${n}, expected ${n * rate}`);
  }
});

test('destroying the only weapon re-issues the quiz starter weapon so the save stays launchable', () => {
  let destroyed = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const save = weaponAt(withScrolls(fresh(seed)), 9);
    const { save: next, result } = enchant(save, 'starter:weapon', W);
    if (result.outcome !== 'destroyed') continue;
    destroyed++;
    const weapon = next.items.find((item) => item.uid === next.equipped.weapon);
    assert.equal(weapon.id, save.items[0].id);
    assert.equal(weapon.enhance, 0); assert.notEqual(weapon.uid, 'starter:weapon');
    assert.ok(validateSave(next));
  }
  assert.ok(destroyed > 100);
});

test('outcome is fixed by the saved attempt counter: replaying the same save never rerolls', () => {
  const save = weaponAt(withScrolls(fresh(42)), 8);
  const first = enchant(save, 'starter:weapon', W);
  for (let i = 0; i < 5; i++) assert.deepEqual(enchant(save, 'starter:weapon', W), first);
  assert.equal(first.save.enchantCount, 1);
  // The committed save carries the outcome; a reload starts from it, not from before the attempt.
  const storage = new Map();
  const store = new SaveStore({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) });
  store.save(first.save);
  assert.deepEqual(store.load(), first.save);
});

test('blessed scroll: Lineage jumps inside the safe line, capped at +6; plain +1 above it', () => {
  for (let level = 0; level < ENCHANT.safe; level++) {
    const seen = new Set();
    for (let seed = 1; seed <= 300; seed++) {
      const { result } = enchant(weaponAt(withScrolls(fresh(seed)), level), 'starter:weapon', BW);
      assert.equal(result.outcome, 'success');
      seen.add(result.to - level);
      assert.ok(result.to <= ENCHANT.safe);
    }
    const expected = new Set((level <= 2 ? [1, 2, 3] : [1, 2]).map((step) => Math.min(level + step, ENCHANT.safe) - level));
    assert.deepEqual([...seen].sort(), [...expected].sort());
  }
  const risky = enchantPreview(weaponAt(withScrolls(fresh()), 7), 'starter:weapon', BW);
  assert.deepEqual(risky.outcomes, [8]); assert.equal(risky.chance, ENCHANT.rates[7]);
});

test('stones become scrolls: 5 → 1, greater stone → 5~10 seeded; never the other way', () => {
  const save = { ...fresh(), stacks: { ...fresh().stacks, enhance_stone_1: 12, enhance_stone_3: 1 } };
  const one = craftScroll(save, 'weapon');
  assert.equal(one.stacks.enhance_stone_1, 7); assert.equal(one.stacks[W], 1);
  assert.equal(craftScroll(save, 'armor', 2).stacks[A], 2);
  assert.throws(() => craftScroll(save, 'armor', 3), /강화석이 부족/);
  const counts = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const base = { ...fresh(seed), stacks: { ...fresh(seed).stacks, enhance_stone_3: 1 } };
    const { save: next, result } = crackGreaterStone(base, 'weapon');
    assert.ok(result.count >= 5 && result.count <= 10); counts.add(result.count);
    assert.equal(next.stacks.enhance_stone_3, 0); assert.equal(next.stacks[W], result.count);
    assert.deepEqual(crackGreaterStone(base, 'weapon').result, result);
    assert.ok(validateSave(next));
  }
  assert.equal(counts.size, 6);
  assert.throws(() => crackGreaterStone(fresh(), 'weapon'), /상급/);
});

test('dismantle refund scales with enhance; +7 and above also give the greater stone', () => {
  const base = fresh();
  for (let level = 0; level <= ENCHANT.max; level++) {
    const save = structuredClone(base);
    save.items.push({ ...instance('spare', 'iron_sword', 1, []), enhance: level });
    const next = dismantle(save, 'spare');
    assert.equal(next.stacks.enhance_stone_1 || 0, ENCHANT.dismantleStones[level]);
    assert.equal(next.stacks.enhance_stone_3 || 0, ENCHANT.dismantleGreater[level]);
    assert.equal((next.stacks.enhance_stone_3 || 0) > 0, level >= 7);
    assert.ok(validateSave(next));
  }
  // Monotone, and a destroyed item always leaves less than dismantling it would have.
  for (let level = 1; level <= ENCHANT.max; level++) assert.ok(ENCHANT.dismantleStones[level] >= ENCHANT.dismantleStones[level - 1]);
  for (let level = ENCHANT.safe; level < ENCHANT.max; level++) assert.ok(Math.floor(ENCHANT.dismantleStones[level] * ENCHANT.failRefund) < ENCHANT.dismantleStones[level]);
});

test('risky levels hit harder; legacy mid stones convert on load; drops never emit the mid stone', () => {
  assert.ok(Math.abs(enhanceMultiplier(5) - 1.25) < 1e-9);
  assert.ok(enhanceMultiplier(7) - enhanceMultiplier(6) > enhanceMultiplier(6) - enhanceMultiplier(5));
  const legacy = { ...fresh(), stacks: { ...fresh().stacks, enhance_stone_1: 3, enhance_stone_2: 4 } };
  const storage = new Map([[SAVE_KEY, JSON.stringify(legacy)]]);
  const store = new SaveStore({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) });
  const loaded = store.load();
  assert.equal(loaded.stacks.enhance_stone_1, 11); assert.equal(loaded.stacks.enhance_stone_2, undefined);
  let blessed = 0;
  for (let seed = 0; seed < 20000; seed++) {
    const loot = rollDrops('goblin_chief', seed, {});
    assert.equal(loot.stacks.enhance_stone_2, undefined);
    blessed += (loot.stacks.scroll_blessed_weapon || 0) + (loot.stacks.scroll_blessed_armor || 0);
  }
  assert.ok(Math.abs(blessed / 20000 - ENCHANT.blessedChance.boss) < 0.015, `boss blessed ${blessed}`);
});

test('forge renders risky odds, danger button and a one-shot result line for success/destroyed', async () => {
  const { HubUI } = await import('../js/ui/hub.js');
  const hub = Object.create(HubUI.prototype);
  hub.save = weaponAt(withScrolls(fresh()), 7);
  hub.selectedUid = 'starter:weapon';
  hub.showInnPanel = (_title, html, _panel, footer) => { hub.html = html; hub.footer = footer; };
  hub.showForge();
  assert.match(hub.html, /성공 40% · 실패 시 장비 파괴/); assert.match(hub.footer, /danger/); assert.match(hub.footer, /성공 40%/);
  hub.forgeNotice = { outcome: 'destroyed', id: 'training_sword', from: 7, to: null, refund: { enhance_stone_1: 5 } };
  hub.showForge();
  assert.match(hub.html, /산산조각.*강화석 5개/);
  hub.showForge();
  assert.doesNotMatch(hub.html, /산산조각/);
  assert.doesNotMatch(hub.html + hub.footer, /undefined|NaN/);
});
