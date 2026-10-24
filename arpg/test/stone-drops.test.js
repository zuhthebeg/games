// Shield catalogue extension: offhand identity hashes updated; nonshield gear, gold,
// all material/stone streams independently byte-compared with 127a17e (new-shields report).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {rollDrops,ITEMS} from '../js/meta/items.js';
import {rng} from '../js/meta/economy.js';
import {threatMultipliers} from '../js/content/balance.js';
const blessed='enhance_stone_blessed',cursed='enhance_stone_cursed';
test('shared stones replace all four scroll definitions',()=>{
 for(const id of ['scroll_enchant_weapon','scroll_enchant_armor','scroll_blessed_weapon','scroll_blessed_armor'])assert.equal(ITEMS[id],undefined);
 assert.equal(ITEMS[blessed]?.kind,'material');assert.equal(ITEMS[cursed]?.kind,'material');
});
test('special stones use exact tier chances, threat multiplier and independent streams; cursed only undead or S21~27',()=>{
 for(const [monster,stage,eligible] of [['goblin_grunt','S1',false],['goblin_grunt','S20',false],['goblin_grunt','S21',true],['goblin_grunt','S27',true],['goblin_grunt','S28',false],['ghost','S1',true],['skeleton_warrior','S1',true],['bat','S1',false]])
 for(const [kind,flags,bp,cp] of [['normal',{},.002,.006],['elite',{elite:true},.03,.06],['boss',{boss:true},.15,.25]])
 for(const threat of [1,2,3]) {
  let b=0,c=0,n=3000;
  for(let seed=1;seed<=n;seed++){
   const loot=rollDrops(monster,seed,{...flags,stageId:stage,threat}),scale=threatMultipliers(threat).drop;
   const be=rng(seed^0x5b1e55ed)()<bp*scale?1:0,ce=eligible&&rng(seed^0xc075ed01)()<cp*scale?1:0;
   assert.equal(loot.stacks[blessed]||0,be,`${monster} ${kind} blessed`);assert.equal(loot.stacks[cursed]||0,ce,`${monster} ${stage} ${kind} cursed`);b+=be;c+=ce;
   assert.ok(!Object.keys(loot.stacks).some(id=>id.startsWith('scroll_')));
  }
  assert.ok(b>0);assert.equal(c>0,eligible);
 }
});
// Section B deliberately replaces the gear/basic/premium material fingerprint.
// craft-loot.test and C1 separately retain exact PRE-B gold/consumable/all-stone bytes.
// Approved twohand T4 bases extend the gear pool fingerprint; non-gear projection remains exact.
// C adds silver on its own stream; exclude only that new field from this historical B projection.
// Necropolis fingerprint alone changes for the approved rare boss floor.
test('B tuned loot fingerprints include safe random enhancement and crafting materials',()=>{
 for(const [monster,ctx,expected] of [
 ['goblin_grunt',{},'41ea7909508e55bd34916c34b00c1037c4df4fba38e124e0be0ae1f868018527'],
 ['ghost',{elite:true,huntTier:3,stageId:'S21',threat:2},'3155942a8047e7de7740fe2211cd64b0bdc0e2f387c41755a8a2b24d47f86cba'],
 ['necropolis_lord',{boss:true,huntTier:4,stageId:'S27',threat:3},'87f5d8fb7cd20983f82910e19185ae2b972997c055ccbea64f16582777979dcd']]) {
  const out=[];for(let seed=1;seed<=500;seed++){const loot=rollDrops(monster,seed,ctx);delete loot.stacks[blessed];delete loot.stacks[cursed];delete loot.stacks.silver_ingot;delete loot.stacks.undead_bone;out.push(loot);}
  assert.equal(createHash('sha256').update(JSON.stringify(out)).digest('hex'),expected);
 }
});
