import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, validateSave, SaveStore } from '../js/meta/save.js';
import { settleRound, createTracker, trackRound } from '../js/meta/run.js';
import { equip, instance } from '../js/meta/items.js';
import { HubUI } from '../js/ui/hub.js';

const fresh = () => settleRound(createSave({name:'UID', answers:[0,0,0,0,0], weapon:'blade', createdAt:1}), {stageId:'S1', terminal:'clear'}).save;
const loot = items => ({gold:0, stacks:{}, items});
const drop = save => trackRound(save, createTracker(22), [{type:'kill', monster:'goblin_grunt', stageId:'S2', xp:0, x:0, y:0}]).tracker.tempLoot;
const html = result => Object.assign(Object.create(HubUI.prototype), {save:result.save, revealed:result.receipt.lootKept.items.length, lootState:{}}).revealHtml(result.receipt);
function checked(save, tempLoot, options = {}) {
  const before = structuredClone({save, tempLoot});
  const result = settleRound(save, {stageId:'S2', terminal:'return_scroll', tempLoot, ...options});
  assert.deepEqual({save, tempLoot}, before, 'inputs unchanged');
  assert.deepEqual(result.save.items.slice(0, save.items.length), save.items, 'existing equipment unchanged');
  assert.deepEqual(result.save.equipped, save.equipped);
  assert.equal(validateSave(result.save), true);
  assert.deepEqual(result.save.lastReceipt, result.receipt);
  const values = new Map();
  const store = new SaveStore({getItem:k=>values.get(k)??null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k)});
  store.save(result.save);
  assert.deepEqual(store.load(), result.save, 'save adapter roundtrip');
  for (const item of result.receipt.lootKept.items) {
    assert.deepEqual(result.save.items.find(i=>i.uid===item.uid), item, 'receipt resolves exact promoted item');
  }
  return result;
}
function actions(result, uid) {
  const rendered = html(result);
  for (const action of ['loot-equip', 'loot-sell', 'dismantle']) {
    assert.ok(rendered.includes('data-action="'+action+'" data-uid="'+uid+'"'), action+' targets new equipment');
  }
  assert.doesNotMatch(rendered, /착용 중/);
}

test('RU1 seed22 replay synchronizes receipt and persisted receipt to the new equipment UID', () => {
  const opened = fresh();
  const first = checked(opened, drop(opened));
  const original = first.save.items.at(-1);
  assert.equal(original.id, 'goblin_cleaver');
  assert.equal(first.receipt.lootKept.items[0].uid, original.uid);
  actions(first, original.uid);
  const worn = equip(first.save, original.uid);
  const second = checked(worn, drop(worn));
  const acquired = second.save.items.at(-1);
  assert.equal(acquired.uid, original.uid+':1');
  assert.equal(second.receipt.lootKept.items[0].uid, acquired.uid);
  assert.equal(second.save.lastReceipt.lootKept.items[0].uid, acquired.uid);
  actions(second, acquired.uid);
});

test('RU1 collision skips occupied :1 and preserves uniqueUid order within one loot array', () => {
  const first = checked(fresh(), drop(fresh()));
  const original = first.save.items.at(-1);
  const worn = equip(first.save, original.uid);
  worn.items.push({...original, uid:original.uid+':1'});
  const result = checked(worn, loot([original, original]));
  assert.deepEqual(result.save.items.slice(-2).map(i=>i.uid), [original.uid+':2', original.uid+':3']);
  assert.deepEqual(result.receipt.lootKept.items.map(i=>i.uid), [original.uid+':2', original.uid+':3']);
  actions(result, original.uid+':2');
  actions(result, original.uid+':3');
});

for (const terminal of ['clear', 'return_scroll', 'death']) test('RU1 '+terminal+' respects promotion boundary', () => {
  const save = fresh();
  const item = {...save.items[0]};
  const result = checked(save, loot([item]), {terminal});
  if (terminal === 'death') {
    assert.deepEqual(result.save.items, save.items);
    assert.deepEqual(result.receipt.lootKept.items, []);
    assert.deepEqual(result.receipt.lootLost.items, [item]);
  } else {
    assert.equal(result.save.items.at(-1).uid, item.uid+':1');
    assert.equal(result.receipt.lootKept.items[0].uid, item.uid+':1');
  }
});

for (const weakIndex of [0,1]) test('RU1 S4 pity replaces weakest index '+weakIndex+' after collision synchronization', () => {
  const save = fresh();
  const weak = instance('repeat:weak', 'goblin_cleaver', 1);
  const strong = instance('repeat:strong', 'dragon_scale_armor', 1);
  const pair = weakIndex === 0 ? [weak,strong] : [strong,weak];
  save.items.push(...structuredClone(pair));
  const result = checked(save, loot(pair), {stageId:'S4', terminal:'clear'});
  const kept = result.receipt.lootKept.items;
  assert.equal(kept.length, 2);
  assert.equal(result.receipt.pityGranted, true);
  assert.equal(kept[0].uid, strong.uid+':1');
  assert.equal(kept[1].id, 'chief_maul');
  assert.equal(result.save.items.length, save.items.length+2);
  assert.ok(!result.save.items.some(i=>i.uid===weak.uid+':1'));
});

test('RU1 S4 natural chief guarantee marker retains collision index mapping without extra pity', () => {
  const save = fresh();
  const item = instance('drop:fixed:chief-pity', 'chief_maul', 1);
  save.items.push(structuredClone(item));
  const result = checked(save, {...loot([item]), chiefAwarded:true}, {stageId:'S4', terminal:'clear'});
  assert.equal(result.receipt.lootKept.items.length, 1);
  assert.equal(result.receipt.lootKept.items[0].uid, item.uid+':1');
  assert.equal(result.receipt.pityGranted, true);
});
