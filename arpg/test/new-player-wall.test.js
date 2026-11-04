import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, measure, aggregate } from '../tools/balance/new-player-wall.mjs';
import { validateSave } from '../js/meta/save.js';
import { BALANCE } from '../js/content/balance.js';

for (const weapon of ['blade','bow','focus']) {
  test('new-player wall: '+weapon+' starter fixtures preserve gear and three potions',()=>{
    const a=fixture(1,weapon), b=fixture(2,weapon);
    assert.ok(validateSave(a)); assert.ok(validateSave(b));
    assert.deepEqual(a.items,b.items); assert.deepEqual(a.equipped,b.equipped);
    assert.equal(a.stacks.potion,3); assert.equal(b.stacks.potion,3);
    assert.equal(b.statPoints,0); assert.equal(b.level,2);
    assert.deepEqual(measure('S1',weapon,1,1),measure('S1',weapon,1,1));
    assert.equal(measure('S1',weapon,2,1).clear,true);
  });
  test('new-player wall: '+weapon+' S2 never regresses from hp4 baseline; Lv2 blade/bow clear at least 60%',()=>{
    // Focus is a casting weapon: this no-skill/no-dodge bot underestimates human performance.
    for (const level of [1,2]) {
      const runs=Array.from({length:10},(_,i)=>measure('S2',weapon,level,i+1));
      const row=aggregate(runs);
      // Captured hp4 starter baseline, seeds1~10: Lv2 blade10%, all other cases0%.
      const before=weapon==='blade'&&level===2?.1:0;
      assert.ok(row.clearRate>=before,JSON.stringify({weapon,level,before,...row}));
      if (level===2 && weapon!=='focus') assert.ok(row.clearRate>=.6,JSON.stringify(row));
      assert.ok(row.potions<=3);
    }
  });
}
test('new-player wall: S2 retains authored spawn count and damage budget',()=>{
  assert.equal(BALANCE.stages.S2.damage,1.28);
  assert.equal(BALANCE.stages.S2.waves,10);
  assert.equal(BALANCE.stages.S2.waveMs,15000);
  assert.equal(BALANCE.stages.S2.concurrent,4);
  assert.equal(BALANCE.stages.S2.eliteChance,.08);
});
