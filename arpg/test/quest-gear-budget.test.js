import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, rollDrops, dropSeed, instance } from '../js/meta/items.js';
import { createTracker, trackRound, settleRound, currentLoad } from '../js/meta/run.js';
import { validateSave, SaveStore } from '../js/meta/save.js';
import { questEvents, rewardSave } from './fixtures/quest-rewards.js';
import { CoopSession } from '../js/net/session.js';
import { createMemoryTransport } from '../js/net/loopback.js';
import { emptyInput } from '../js/sim/world.js';

const settle = (save, tracker, stageId, terminal = 'clear') => settleRound(save, { stageId, terminal, ...tracker });

test('seeded budget counts awards, not bag contents; batching/JSON reload and UID replay stable', () => {
  const save = rewardSave('S20');
  const events = questEvents('S20', 15, 1, true);
  const start = createTracker(15);
  const all = trackRound(save, start, events).tracker;
  let chunks = start;
  for (const event of events) chunks = JSON.parse(JSON.stringify(trackRound(save, chunks, [event]).tracker));
  assert.deepEqual(chunks, all);
  assert.deepEqual(all, trackRound(save, createTracker(15), events).tracker);
  assert.ok(all.gearAwarded <= 2);
  const savedCount = all.gearAwarded;
  chunks.tempLoot.items = []; // sale/stash cannot refund spent gear slots
  chunks = trackRound(save, chunks, events).tracker;
  assert.equal(chunks.gearAwarded, savedCount);
  assert.equal(chunks.tempLoot.items.length, 0);
  assert.equal(new Set(all.tempLoot.items.map(i => i.uid)).size, all.tempLoot.items.length);
  const reentry = trackRound(settle(save, all, 'S20').save, createTracker(15), events).tracker;
  const twice = settle(settle(save, all, 'S20').save, reentry, 'S20');
  assert.equal(new Set(twice.save.items.map(i => i.uid)).size, twice.save.items.length);
  assert.ok(validateSave(twice.save));
  twice.save.learned = ['heavy_cleave']; twice.save.skills.blade = 'heavy_cleave';
  const data = new Map();
  const store = new SaveStore({ getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  store.save(twice.save);
  assert.deepEqual(store.load(), twice.save); // stats/equipment/learned and receipts survive reload
});

test('boss-last reserved award includes rareless and first-chief guarantees without inflating quality', () => {
  for (const stageId of ['S4', 'S10', 'S20']) for (let seed = 1; seed <= 100; seed++) {
    const save = rewardSave(stageId, 3, stageId === 'S4', 6);
    const events = questEvents(stageId, seed, 3, true);
    const tracker = trackRound(save, createTracker(seed), events).tracker;
    const result = settle(save, tracker, stageId);
    assert.ok(result.receipt.lootKept.items.length <= tracker.gearBudget);
    assert.ok(result.receipt.lootKept.items.some(i => ['rare','epic'].includes(ITEMS[i.id].rarity)));
    if (stageId === 'S4') assert.ok(result.receipt.lootKept.items.some(i => i.id === 'chief_maul'));
    else {
      const bossIndex = events.findIndex(e => e.monster === 'goblin_chief');
      const original = rollDrops('goblin_chief', dropSeed(seed, bossIndex), { threat: 3, stageId,
        huntTier: stageId === 'S20' ? 3 : 2, rarelessRounds: 6 });
      assert.ok(tracker.tempLoot.items.some(i => i.uid === original.items.find(i => i.uid.includes(':rolled:0:')).uid));
    }
  }
});

test('gear filtering leaves raw gold/material/consumable/scroll rolls byte-identical', () => {
  for (const stageId of ['S2','S4','S10','S20']) for (const threat of [1,2,3]) {
    const save = rewardSave(stageId, threat);
    for (let seed = 1; seed <= 20; seed++) {
      const events = questEvents(stageId, seed, threat);
      const tracker = trackRound(save, createTracker(seed), events).tracker;
      let gold = 0; const stacks = {};
      events.forEach((e, index) => {
        const drop = rollDrops(e.monster, dropSeed(seed, index), { elite: e.elite, threat,
          stageId, huntTier: { S10: 2, S20: 3 }[stageId], rarelessRounds: 0 });
        gold += drop.gold;
        for (const [id, count] of Object.entries(drop.stacks)) stacks[id] = (stacks[id] || 0) + count;
      });
      assert.equal(tracker.tempLoot.gold, gold);
      assert.deepEqual(tracker.tempLoot.stacks, stacks); // representative bags never overflow
      assert.ok(currentLoad(save, tracker).weight > currentLoad(save, createTracker(seed)).weight);
    }
  }
});

test('weight overflow spends slots once; training/empty abort grant no gear and existing saves survive', () => {
  const save = rewardSave('S20');
  const full = structuredClone(save); full.stacks.potion = 1000;
  const events = questEvents('S20', 15, 1, true);
  const tracker = trackRound(full, createTracker(15), events).tracker;
  assert.equal(tracker.tempLoot.items.length, 0);
  assert.ok(tracker.gearAwarded > 0);
  const retry = trackRound(save, tracker, events).tracker;
  assert.equal(retry.tempLoot.items.length, 0);
  for (const terminal of ['clear','return_scroll','death']) {
    const training = trackRound(save, createTracker(15), questEvents('S1', 15)).tracker;
    assert.equal(settle(save, training, 'S1', terminal).receipt.lootKept.items.length, 0);
  }
  for (const terminal of ['return_scroll','death']) {
    const result = settle(save, createTracker(15), 'S20', terminal);
    assert.equal(result.receipt.lootKept.items.length, 0);
    assert.deepEqual(result.save.items, save.items);
    assert.deepEqual(result.save.stats, save.stats);
    assert.deepEqual(result.save.equipped, save.equipped);
    assert.deepEqual(result.save.learned, save.learned);
  }
});

test('selling/storing already-awarded chief cannot mint a third gear at clear settlement', () => {
  const save = rewardSave('S4', 3, true);
  const seed = Array.from({ length: 100 }, (_, i) => i + 1).find(i => createTracker(i).gearBudget === 2);
  const tracker = trackRound(save, createTracker(seed), questEvents('S4', seed, 3, true)).tracker;
  assert.equal(tracker.gearAwarded, 2);
  assert.equal(tracker.tempLoot.chiefAwarded, true);
  tracker.tempLoot.items = []; // both already-awarded items sold/stored, not a fresh budget
  const result = settle(save, JSON.parse(JSON.stringify(tracker)), 'S4');
  assert.equal(result.receipt.lootKept.items.length, 0);
  assert.deepEqual(result.save.items, save.items);
  assert.equal(result.save.flags.chiefPity, true);
  assert.ok(validateSave(result.save));
});

test('settlement boundary includes chief fallback in hard cap, replaces weaker gear only', () => {
  const save = rewardSave('S4', 1, true);
  const items = [instance('a','iron_sword'), instance('b','seal_staff_epic'), instance('c','cloth_tunic')];
  const result = settleRound(save, { stageId: 'S4', terminal: 'clear', tempLoot: { gold: 12, stacks: { scrap: 3 }, items } });
  assert.equal(result.receipt.lootKept.items.length, 2);
  assert.deepEqual(result.receipt.lootKept.items.map(i => i.id), ['seal_staff_epic','chief_maul']);
  assert.equal(result.receipt.goldGained, 12);
  assert.equal(result.receipt.lootKept.stacks.scrap, 3);
  assert.ok(validateSave(result.save));
});

for (const size of [2,4]) test(`${size}-player real loopback journal/settlement: personal caps, duplicates, terminal isolation`, () => {
  const network = createMemoryTransport(), sessions = {}, trackers = {}, results = {}, saves = {};
  const players = Array.from({ length: size }, (_, i) => `p${i}`);
  for (const [i, uid] of players.entries()) {
    saves[uid] = rewardSave('S20', 3, false, 6); trackers[uid] = createTracker(101 + i);
    const transport = network.connect(uid, (from, p) => p.t === 'action' ? sessions[uid].action(p.action) : sessions[uid].rt(from, p));
    sessions[uid] = new CoopSession({ uid, host: 'p0', players,
      profile: { name: uid, level: 20, weapon: 'blade', mods: {}, threats: { S20: 3 } },
      config: { stageId: 'S20', threat: 3, seed: 15 }, ...transport,
      onFrame: (view, events) => {
        if (results[uid]) return;
        trackers[uid] = trackRound(saves[uid], trackers[uid], events).tracker;
        if (view.entities[0].terminal) results[uid] = settle(saves[uid], trackers[uid], 'S20', view.entities[0].terminal);
      } });
  }
  for (const uid of players.slice(1)) sessions[uid].update(34, emptyInput());
  const host = sessions.p0;
  const events = questEvents('S20', 15, 3, true);
  for (const event of events) host.journal.push({ seq: ++host.eventSeq, event, participants: players });
  host.onFrame(host.view(), events);
  host.world.tick++; host.broadcast(); host.broadcast();
  for (const uid of players) assert.equal(trackers[uid].killIndex, events.length);
  for (const player of host.world.entities.filter(e => e.kind === 'player')) player.terminal = 'clear';
  host.onFrame(host.view(), []); host.world.tick++; host.broadcast(); host.broadcast();
  for (const uid of players) {
    assert.ok(results[uid], uid);
    assert.equal(results[uid].receipt.lootKept.items.length, trackers[uid].gearAwarded);
    assert.ok(results[uid].receipt.lootKept.items.length >= 1);
    assert.ok(results[uid].receipt.lootKept.items.length <= 2);
    assert.ok(validateSave(results[uid].save));
  }
  assert.ok(Object.values(results).reduce((n, r) => n + r.receipt.lootKept.items.length, 0) >= size);
});
