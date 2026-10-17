import { comboDef } from '../js/sim/basic-combo.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, validateSave, SaveStore, SAVE_KEY, migrateStatScale } from '../js/meta/save.js';
import { STAT_KEYS, eff, cap, deriveMods, allocateStats, effectiveStats, statBudget } from '../js/meta/stats.js';
import { addXp } from '../js/meta/progression.js';
import { rollDrops } from '../js/meta/items.js';
import { enchantPreview } from '../js/meta/enchant.js';
import { createWorld, addPlayer, startStage, step, emptyInput, spawnMonster } from '../js/sim/world.js';
import { toOldScale } from './fixtures/old-scale.js';

const fresh = (answers = [0, 0, 0, 0, 0]) => createSave({ name: '스탯', answers, createdAt: 7 });
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
let seed = 5; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

test('10-12 scale: 6 new points = 1 old point, so every old effect is unchanged', () => {
  const oldEff = (v) => { const d = Math.max(0, v - 5); return d <= 4 ? d : 4 + (d - 4) * .5; };
  for (let v = 5; v <= 19; v++) near(eff(10 + 6 * (v - 5)), oldEff(v));
  assert.equal(cap(30), 100); assert.equal(statBudget(30), 36 + 8 * 29);
});

test('every legal v4 save (all levels, random allocations, unspent points) migrates exactly and stays valid', () => {
  for (let i = 0; i < 400; i++) {
    let modern = fresh([0, 1, 2, 3, 0].map(() => Math.floor(rnd() * 4)));
    modern = addXp(modern, Math.floor(rnd() * 60000));
    // Spend whole old points only (multiples of 6 within the old cap), leave some unspent.
    const oldCap = Math.min(19, 9 + Math.floor(modern.level / 3));
    for (const key of ['str', 'agi', 'int', 'wis', 'cha']) {
      const room = 10 + 6 * (oldCap - 5) - modern.stats[key];
      const n = 6 * Math.floor(rnd() * (Math.min(room, modern.statPoints - 2 * (modern.level - 1)) / 6 + 1));
      if (n > 0) modern = allocateStats(modern, { [key]: n });
    }
    const legacy = toOldScale(modern);
    const data = new Map([[SAVE_KEY, JSON.stringify(legacy)]]);
    const store = new SaveStore({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) });
    const loaded = store.load();
    assert.ok(loaded, `lost a level ${legacy.level} save`);
    assert.deepEqual(loaded.stats, modern.stats); assert.equal(loaded.statPoints, modern.statPoints); assert.equal(loaded.version, 5);
    assert.ok(validateSave(loaded)); assert.equal([...data.keys()].some((k) => k.includes('corrupt')), false);
    // The five original stats keep their derived effects exactly.
    const a = deriveMods(loaded), b = deriveMods(modern);
    for (const k of ['maxHp', 'maxMp', 'speedMult', 'dodgeCdMult', 'iframeBonusMs', 'potionHealMult', 'poiseMult', 'capacity', 'shopDiscount', 'attackSpeedBonus']) near(a[k], b[k]);
  }
  // Malformed legacy data is not "fixed" into something else: validation still backs it up.
  assert.equal(migrateStatScale({ version: 4, level: 3, statPoints: 99, stats: { str: 5, agi: 5, int: 5, wis: 5, cha: 5 } }).version, 4);
});

test('WIS increases level-based mana regen, CON sets HP regen (100 = 2.5/s); both keep rising past 100', () => {
  const at = (key, v) => deriveMods({ ...fresh(), stats: { ...fresh().stats, [key]: v } });
  near(at('wis', 10).mpRegen, .15); near(at('wis', 100).mpRegen, 1.95); near(at('wis', 150).mpRegen, 2.95);
  near(at('con', 10).hpRegen, .25); near(at('con', 100).hpRegen, 2.5);
  const world = createWorld({ seed: 1 });
  const p = addPlayer(world, { pid: 'p', mods: { hpRegen: 2.5, maxHp: 100 } }); startStage(world, 'S1');
  world.entities = [p]; p.hp = 50;
  for (let i = 0; i < 30; i++) step(world, { p: emptyInput() });
  near(p.hp, 52.5, 1e-6);
  for (let i = 0; i < 900; i++) step(world, { p: emptyInput() });
  assert.equal(p.hp, 100); // never above max
});

test('LUK: crit only above 0% (no RNG draw at 0), ~chance x 1.5 damage; more gear drops; better risky enhance', () => {
  const run = (critChance) => {
    const world = createWorld({ seed: 9 });
    addPlayer(world, { pid: 'p', mods: { critChance, maxHp: 1e6 } }); startStage(world, 'S1');
    world.entities = world.entities.filter((e) => e.kind === 'player'); world.round.pending = [];
    const dummy = spawnMonster(world, 'scarecrow', world.entities[0].x + 40, world.entities[0].y);
    const hits = [];
    for (let i = 0; i < 3000; i++) { hits.push(...step(world, { p: { ...emptyInput(), attack: true, aimX: 1 } }).filter((e) => e.type === 'hit' && e.dst === dummy.id)); }
    return { hits, rngState: JSON.stringify(world.rng ?? world.seed) };
  };
  const none = run(0), lucky = run(.25);
  assert.ok(none.hits.length > 50); assert.equal(none.hits.some((h) => h.crit), false);
  const crits = lucky.hits.filter((h) => h.crit), normal = lucky.hits.find((h) => !h.crit && h.step === crits[0].step);
  near(crits.length / lucky.hits.length, .25, .08);
  assert.equal(crits[0].dmg, Math.round(comboDef('slash', crits[0].step).damage * 1.5));
  assert.equal(normal.dmg, Math.round(comboDef('slash', normal.step).damage));
  const luck = (v) => deriveMods({ ...fresh(), stats: { ...fresh().stats, luk: v } });
  near(luck(100).critChance, .25); near(luck(100).dropLuck, .3); near(luck(100).enchantLuck, .08); assert.equal(luck(10).critChance, 0);
  // Only the random gear roll is luck-scaled (fixed material drops are not).
  const gear = (dropLuck) => Array.from({ length: 4000 }, (_, i) => rollDrops('wolf', i * 7919 + 1, { dropLuck }).items.filter((it) => it.uid.includes(':rolled:')).length).reduce((a, b) => a + b, 0);
  const base = gear(0), more = gear(.3);
  near(more / base, 1.3, .08);
  const s = { ...fresh(), stacks: { enhance_stone_1: 1 } }; s.items[0].enhance = 7;
  const lucky7 = { ...s, stats: { ...s.stats, luk: 100 } };
  near(enchantPreview(lucky7, s.items[0].uid, 'enhance_stone_1').chance - enchantPreview(s, s.items[0].uid, 'enhance_stone_1').chance, .08);
});

test('gear stat affixes push past 100; allocation itself stops at the cap', () => {
  let s = addXp(fresh(), 999999);
  s = allocateStats(s, { luk: 90 }); assert.equal(s.stats.luk, 100);
  assert.throws(() => allocateStats(s, { luk: 1 }));
  s.items[0].affixes = [{ k: 'luk_flat', v: 5 }]; s.items[1].affixes = [{ k: 'luk_flat', v: 4 }];
  assert.equal(effectiveStats(s).luk, 109); near(deriveMods(s).critChance, .25 * 99 / 90);
  assert.equal(STAT_KEYS.length, 7);
});
