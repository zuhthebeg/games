import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSave, validateSave, SaveStore } from '../js/meta/save.js';
import { grantGear, grantSet, setLevel, mutateSave, previewDrops, registerDebugAction, debugActions } from '../js/debug/actions.js';
import { createCombatController, queueVisibleKills, requestClear } from '../js/debug/combat.js';
import { createWorld, addPlayer, spawnMonster, startStage, step } from '../js/sim/world.js';
import { createTracker, trackRound, settleRound } from '../js/meta/run.js';
import { ITEMS } from '../js/meta/items.js';
import { SLOTS } from '../js/meta/economy.js';

const fixture = () => createSave({ name: '디버그', answers: [0, 0, 0, 0, 0], weapon: 'blade', createdAt: 1 });
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
test('disabled debug does not import; explicit URL overrides persisted state; denied storage', async () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.equal(main.includes("from './debug/"), false);
  const source = main.slice(main.indexOf('  const debugQuery'), main.indexOf('  const inputs'))
    .replace("await import('./debug/index.js')", 'await importer()');
  const boot = new (Object.getPrototypeOf(async function(){}).constructor)('location', 'localStorage', 'importer', 'hub', 'store', 'renderer', 'input', `let debug, world, running, tracker; ${source}; return debug;`);
  const local = storage(); let loads = 0;
  const importer = async () => { loads++; return { mountDebug: () => ({ loaded: true }) }; };
  const run = (search, store = local) => boot({ search }, store, importer, {}, {}, {}, {});
  assert.equal(await run(''), undefined); assert.equal(loads, 0);
  assert.ok(await run('?debug=1')); assert.equal(local.getItem('arpg.debug'), '1');
  assert.ok(await run('')); assert.equal(loads, 2);
  assert.equal(await run('?debug=0'), undefined); assert.equal(local.getItem('arpg.debug'), '0');
  assert.equal(await run(''), undefined); assert.equal(loads, 2);
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.ok(await run('?debug=1', denied)); assert.equal(await run('?debug=0', denied), undefined);
});
test('gear all slots/rarities/tiers uses P1 rolls and persists valid save', () => {
  let save = fixture();
  for (const slot of [...SLOTS, 'random']) for (const rarity of ['common','fine','rare','epic']) for (const huntTier of [1,2,3]) {
    save = grantGear(save, { slot, rarity, huntTier, seed: save.items.length });
    assert.equal(validateSave(save), true);
    const item = save.items.at(-1); assert.equal(ITEMS[item.id].rarity, rarity);
    if (slot !== 'random') assert.equal(ITEMS[item.id].slot, slot);
    assert.equal(ITEMS[item.id].huntTier, Math.min(huntTier, 2));
    assert.equal(item.affixes.length, {common:0,fine:1,rare:2,epic:3}[rarity]);
  }
  const full = grantSet(save, 3, 42); assert.equal(full.items.length, save.items.length + 20);
  const store = new SaveStore(storage()); store.save(full); assert.deepEqual(store.load(), full);
});
test('save cheats preserve level/point invariant and valid resource/progress state', () => {
  let save = fixture();
  for (const action of ['gold:1000','gold:10000','stones','materials','potions','unlock','reroll','refresh-reset','pity','progress-reset']) {
    save = mutateSave(save, action); assert.equal(validateSave(save), true, action);
  }
  save = setLevel(save, 30); assert.equal(save.statPoints, 87); assert.equal(validateSave(save), true);
  save = setLevel(save, 1); assert.equal(save.statPoints, 0); assert.equal(validateSave(save), true);
  assert.throws(() => setLevel(save, 31));
});
test('preview deterministic, read-only, forwards elite/threat/boss/tier and uses seeds 0..N-1', () => {
  const ctx = {elite:true,threat:3,boss:false,huntTier:3}; const before = structuredClone(ctx);
  assert.deepEqual(previewDrops('goblin_grunt', 1000, ctx), previewDrops('goblin_grunt', 1000, ctx));
  assert.deepEqual(ctx, before);
  let calls = 0;
  const result = previewDrops('goblin_grunt', 100, ctx, (monster, seed, passed) => {
    assert.equal(monster, 'goblin_grunt'); assert.equal(seed, calls++); assert.equal(passed, ctx);
    return {gold:seed,stacks:{enhance_stone_1:1},items:[]};
  });
  assert.equal(calls, 100); assert.equal(result.goldAverage, 49.5); assert.equal(result.stones[1], 100);
  assert.throws(() => previewDrops('goblin_grunt', 99));
});
test('queued visible kill uses real sim events and normal drop/settlement reducer; invulnerability and oneHit restore', () => {
  const world = createWorld(); addPlayer(world, {pid:'local'}); startStage(world, 'S2');
  const monster = spawnMonster(world, 'goblin_grunt', 100, 100);
  const offscreen = spawnMonster(world, 'iron_boar', 900, 100);
  const renderer = {scale:1,root:{x:0,y:0},app:{screen:{width:390,height:844}}};
  const control = createCombatController(); control.state.god = true; control.state.oneHit = true; control.state.mana = true;
  world.entities[0].hp = 1; world.entities[0].mp = 0;
  control.enqueue(queueVisibleKills); control.beforeTick(world, renderer);
  assert.equal(world.entities[0].hp, world.entities[0].maxHp); assert.equal(world.entities[0].mp, world.entities[0].maxMp);
  assert.equal(world.entities[0].dmgMult.blade, 100);
  const events = step(world); assert.ok(monster.dead); assert.equal(offscreen.dead, false);
  assert.equal(events.filter(event => event.type === 'kill').length, 1);
  const tracked = trackRound(fixture(), createTracker(11), events);
  assert.ok(tracked.tracker.tempLoot.gold > 0); assert.equal(tracked.tracker.killIndex, 1);
  control.state.oneHit = false; control.beforeTick(world, renderer); assert.equal(world.entities[0].dmgMult.blade, 1);
  requestClear(world); step(world); assert.equal(world.entities[0].terminal, 'clear');
  const result = settleRound(fixture(), {stageId:'S2', terminal:'clear', tempLoot:tracked.tracker.tempLoot, depositedXp:tracked.tracker.depositedXp});
  assert.equal(result.receipt.goldGained, tracked.tracker.tempLoot.gold); assert.equal(validateSave(result.save), true);
});
test('registry supports later registration and unsubscribe without touching core', () => {
  const before = debugActions.length; const run = () => 1;
  const remove = registerDebugAction({group:'P3',label:'위협',run});
  assert.equal(debugActions.at(-1).run(), 1); remove(); assert.equal(debugActions.length, before);
});
