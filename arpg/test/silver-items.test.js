import {isBossType} from '../js/content/boss-tuning.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ITEMS,RECIPES,instance,craft,equip,rollDrops} from '../js/meta/items.js';
import {createSave,validateSave,SaveStore} from '../js/meta/save.js';
import {trained} from './fixtures/trained.js';
import {deriveMods} from '../js/meta/stats.js';
import {rng} from '../js/meta/economy.js';
import {MONSTER_VARIANTS} from '../js/content/monsters.js';
import {STAGES} from '../js/content/combat.js';
import {BALANCE,threatMultipliers} from '../js/content/balance.js';
export const SILVER_PAIRS=[['silver_blade','revenant_blade','은 장검'],['silver_maul','ossuary_maul','은 철퇴'],['silver_bow','bone_bow','은촉 장궁'],['silver_wand','soulfire_wand','은장 완드'],['silver_staff','gravekeeper_staff','은장 지팡이']];
test('C five craft-only silver weapons match T4 bases, including rarity/enhance/requirements and real save/craft/equip',()=>{
 assert.equal(ITEMS.silver_ingot?.kind,'material');
 for(const [id,base,name]of SILVER_PAIRS)for(const suffix of ['','_common','_rare','_epic']){
  const def=ITEMS[id+suffix],other=ITEMS[base+suffix];assert.ok(def,id+suffix);assert.equal(def.name,name);assert.equal(def.craftOnly,true);assert.equal(def.silverWeapon,true);assert.equal(def.dropOnly,undefined);
  for(const key of ['power','weight','requiredLevel','requiredStr','family','form','affinity','huntTier','rarity'])assert.equal(def[key],other[key],`${id}${suffix}/${key}`);
  const recipe=RECIPES[id+suffix];assert.ok(recipe.silver_ingot>=6);assert.equal(recipe.gold,RECIPES[base+suffix].gold);
  let s=trained(createSave({name:'은 제작',weapon:def.family,answers:[0,0,0,0,0],createdAt:1}),30);s.stats.str=100;s.statPoints-=55;s.gold=10000;
  for(const [k,n]of Object.entries(recipe))if(k!=='gold')s.stacks[k]=n;
  s=craft(s,id+suffix);const it=s.items.at(-1);s=equip(s,it.uid);assert.equal(deriveMods(s).silverWeapon,true);assert.equal(validateSave(s),true);
  const mem=new Map(),store=new SaveStore({getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)});store.save(s);assert.deepEqual(store.load(),s);
 }
});
test('C silver ingots drop only combat constructs T2+, with exact normal/elite/boss and threat rolls',()=>{
 const constructs=Object.entries(MONSTER_VARIANTS).filter(([id,d])=>d.lifeState==='construct'&&!d.speciesTags.includes('trainingDummy')).map(([id])=>id);
 assert.deepEqual(constructs,['goleling','gargoyle','rune_guardian']);
 const rows=[];
 for(const monster of constructs)for(const [rank,flags,chance]of [['normal',{},.03],['elite',{elite:true},.12],['boss',{boss:true},1]]){
  let total=0;for(let seed=1;seed<=24000;seed++){
   const loot=rollDrops(monster,seed,{huntTier:2,...flags}),r=rng(seed^0x5117e201),count=loot.stacks.silver_ingot||0;
   const expected=rank==='boss'||isBossType(monster)?1+Math.floor(r()*2):r()<chance?1:0;assert.equal(count,expected,`${monster} ${rank} ${seed}`);if(count)total++;
   assert.ok(loot.items.every(i=>!ITEMS[i.id].silverWeapon));
  }assert.ok(Math.abs(total/24000-(isBossType(monster)?1:chance))<.008);rows.push({monster,rank,total,n:24000});
 }
 for(const monster of constructs)for(const huntTier of [2,3,4])for(const threat of [1,2,3])for(const elite of [false,true])for(let seed=1;seed<=300;seed++){
  const expected=isBossType(monster)?1+Math.floor(rng(seed^0x5117e201)()*2):rng(seed^0x5117e201)()<(elite?.12:.03)*threatMultipliers(threat).drop?1:0;
  assert.equal(rollDrops(monster,seed,{huntTier,threat,elite}).stacks.silver_ingot||0,expected);
 }
 // Life-state, not region, is authoritative: no undead boss, living, spirit or training dummy path.
 // Human lab and training dragon have no drop tables and cannot award kill loot.
 const excluded=Object.keys(MONSTER_VARIANTS).filter(id=>!constructs.includes(id)&&!['undead_lab_human_melee','training_dragon'].includes(id));
 for(const monster of excluded)for(const flags of [{},{elite:true},{boss:true}])for(let seed=1;seed<=300;seed++)assert.equal(rollDrops(monster,seed,{huntTier:4,stageId:'S27',...flags}).stacks.silver_ingot,undefined,monster);
 for(const monster of constructs)for(let seed=1;seed<=300;seed++)assert.equal(rollDrops(monster,seed,{huntTier:1,boss:true}).stacks.silver_ingot,undefined);
 console.log('C construct ingot cohorts',JSON.stringify(rows));
});
// Approved four T2/T4 twohand bases extend gear pools. Only gear identity fingerprints change;
// i1-tier4-items still differentially checks 22,000 exact old gold/consumable/all-stone projections.
test('C silver rolls retain approved catalog loot fingerprint (gold/gear/material/stones projection)',()=>{
 const rows=[];for(const [monster,ctx]of [['goblin_grunt',{}],['ghoul',{huntTier:3,elite:true,stageId:'S21',threat:2}],['necropolis_lord',{huntTier:4,boss:true,stageId:'S27',threat:3}]]){
  const output=[];for(let seed=1;seed<=1000;seed++){const l=rollDrops(monster,seed,ctx);delete l.stacks.silver_ingot;delete l.stacks.undead_bone;output.push(l);}rows.push(createHash('sha256').update(JSON.stringify(output)).digest('hex'));
 }console.log('C historical loot hashes',JSON.stringify(rows));
 assert.deepEqual(rows,HISTORICAL);
});
// Boss entries reflect the approved rare floor; both nonboss historical hashes remain unchanged.
const HISTORICAL=['e1f25c8c7aca729ffa644ad0fa0b2e29eee241fb1bdcf1c0499b97af469c9c15','4c2cd60c134d00be58c7caffab536ba4dd937102977d3f39bfe37a56f86f8ceb','c7c421eafa5278126de8e74b07a42c7cbc2cd12917b6d1f1aaaca484ef9a02d7'];

test('C real T2/T3 construct stages award ingots through tracker/settlement; necropolis boss never does',async()=>{
 const {createTracker,trackRound,settleRound}=await import('../js/meta/run.js');
 for(const stageId of ['S9','S12','S14','S17','S19','M_THRONE_GARGOYLE']){
  const monster=STAGES[stageId].spawns.find(s=>MONSTER_VARIANTS[s.monster]?.lifeState==='construct').monster;
  assert.ok(BALANCE.stages[stageId].huntTier>=2);
  let total=0;
  for(let seed=1;seed<=300;seed++){
   const s=createSave({name:'석상 재료',answers:[0,0,0,0,0],createdAt:1});s.stacks.return_scroll=1;
   const {tracker}=trackRound(s,createTracker(seed),[{type:'kill',id:55,monster,stageId,threat:1,elite:false,xp:0}]);
   const count=tracker.tempLoot.stacks.silver_ingot||0;total+=count;
   const result=settleRound(s,{stageId,terminal:'return_scroll',...tracker,used:{scrolls:1}});
   assert.equal(result.save.stacks.silver_ingot||0,count);assert.equal(result.receipt.lootKept.stacks.silver_ingot||0,count);assert.ok(validateSave(result.save));
  }
  assert.ok(total>0,stageId);
 }
 for(let seed=1;seed<=1000;seed++){
  const s=createSave({name:'보스 재료',answers:[0,0,0,0,0],createdAt:1});
  const {tracker}=trackRound(s,createTracker(seed),[{type:'kill',id:55,monster:'necropolis_lord',stageId:'S27',threat:1,elite:false,xp:0}]);
  assert.equal(tracker.tempLoot.stacks.silver_ingot,undefined,`seed ${seed}`);
 }
});
test('C authored construct boss identity guarantees 1-2 without ctx.boss; non-boss guardians do not',()=>{
 // No construct is tagged boss in current content. Exercise the metadata contract without changing content.
 const tags=MONSTER_VARIANTS.rune_guardian.speciesTags;
 try{
  MONSTER_VARIANTS.rune_guardian.speciesTags=[...tags,'boss'];
  for(let seed=1;seed<=1000;seed++)assert.equal(rollDrops('rune_guardian',seed,{huntTier:2}).stacks.silver_ingot,1+Math.floor(rng(seed^0x5117e201)()*2));
 }finally{MONSTER_VARIANTS.rune_guardian.speciesTags=tags;}
});
test('C construct non-silver loot retains approved catalog fingerprint, including all special stones',()=>{
 for(const[monster,ctx,hash]of[
  ['goleling',{huntTier:3,stageId:'S12'},'f3401799d5b56e16a012304ceea9feed8267e70f3374affbceed7d9d18cbb233'],
  ['rune_guardian',{huntTier:2,stageId:'S9',elite:true,threat:2},'2de7cd396e4f1944c2af672e6d2a3c562b886adb7fa79cc3d89a53a87c9d6348'],
  ['gargoyle',{huntTier:3,stageId:'M_THRONE_GARGOYLE',boss:true,threat:3},'961c048cfa97ca311eeadf5c7acc41b83b17b28fbd4cee6cc55d2e0fae577572'],
  ['scarecrow',{huntTier:4,boss:true},'ff461329715346518d112f0b0180ba61d46671d9a5363dca3ff8f58d90208e6e']]){
  const rows=[];for(let seed=1;seed<=1000;seed++){const loot=rollDrops(monster,seed,ctx);delete loot.stacks.silver_ingot;rows.push(loot);}
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),hash,monster);
 }
});
