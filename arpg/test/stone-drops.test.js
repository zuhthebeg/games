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
test('new stone streams preserve exact previous gold, gear, materials and ordinary stone rolls',()=>{
 for(const [monster,ctx,expected] of [
 ['goblin_grunt',{},'cba2393c6fa4f9861306871782f1cf064f20ddd6b815a9f7656193df5747900c'],
 ['ghost',{elite:true,huntTier:3,stageId:'S21',threat:2},'be7e04571ac8bd371cffe6c93c4bef933836b251d4b3c6c23aa508ce48e05862'],
 ['necropolis_lord',{boss:true,huntTier:4,stageId:'S27',threat:3},'fd4ad56a585383e29702f287cc8e1ea1489ad5019c4af6a4bf1ccc8451debb72']]) {
  const out=[];for(let seed=1;seed<=500;seed++){const loot=rollDrops(monster,seed,ctx);delete loot.stacks[blessed];delete loot.stacks[cursed];out.push(loot);}
  assert.equal(createHash('sha256').update(JSON.stringify(out)).digest('hex'),expected);
 }
});
