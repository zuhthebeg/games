import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ITEMS,RECIPES,instance,craft,equip,rollDrops} from '../js/meta/items.js';
import {createSave,validateSave,SaveStore} from '../js/meta/save.js';
import {trained} from './fixtures/trained.js';
import {deriveMods} from '../js/meta/stats.js';
import {rng} from '../js/meta/economy.js';
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
test('C silver ingot drops only undead T3+, independent exact seeded rolls, threat multiplier and boss 1-2',()=>{
 const rows=[];
 for(const [rank,flags,chance]of [['normal',{},.008],['elite',{elite:true},.08],['boss',{boss:true},1]]){
  let total=0;for(let seed=1;seed<=24000;seed++){
   const loot=rollDrops('ghoul',seed,{huntTier:3,...flags}),r=rng(seed^0x5117e201),count=loot.stacks.silver_ingot||0;
   const expected=rank==='boss'?1+Math.floor(r()*2):r()<chance?1:0;assert.equal(count,expected);if(count)total++;
   if(seed<=1000)for(const [monster,tier]of [['goblin_grunt',4],['ghoul',2],['throne_dragon',4]])assert.equal(rollDrops(monster,seed,{huntTier:tier,stageId:'S27',...flags}).stacks.silver_ingot,undefined);
   assert.ok(loot.items.every(i=>!ITEMS[i.id].silverWeapon));
  }assert.ok(Math.abs(total/24000-chance)<.008);rows.push({rank,total,n:24000});
 }
 for(let seed=1;seed<=1000;seed++){const r=rng(seed^0x5117e201);assert.equal(rollDrops('ghoul',seed,{huntTier:4,elite:true,threat:3}).stacks.silver_ingot||0,r()<.08*1.9?1:0);}
 console.log('C ingot cohorts',JSON.stringify(rows));
});
test('C silver rolls cannot reroll any old loot bytes (gold/gear/material/stones historical projection)',()=>{
 const rows=[];for(const [monster,ctx]of [['goblin_grunt',{}],['ghoul',{huntTier:3,elite:true,stageId:'S21',threat:2}],['necropolis_lord',{huntTier:4,boss:true,stageId:'S27',threat:3}]]){
  const output=[];for(let seed=1;seed<=1000;seed++){const l=rollDrops(monster,seed,ctx);delete l.stacks.silver_ingot;output.push(l);}rows.push(createHash('sha256').update(JSON.stringify(output)).digest('hex'));
 }console.log('C historical loot hashes',JSON.stringify(rows));
 assert.deepEqual(rows,HISTORICAL);
});
const HISTORICAL=['e1f25c8c7aca729ffa644ad0fa0b2e29eee241fb1bdcf1c0499b97af469c9c15','4c2cd60c134d00be58c7caffab536ba4dd937102977d3f39bfe37a56f86f8ceb','8e3508fb3367d2ea0159e2150aa67e5f8ffba26f1085488817b650de6dcbd307'];

test('C authored undead boss guarantees ingots through actual tracker without a synthetic ctx.boss flag',async()=>{
 const {createTracker,trackRound}=await import('../js/meta/run.js');
 for(let seed=1;seed<=1000;seed++){
  const s=createSave({name:'보스 재료',answers:[0,0,0,0,0],createdAt:1});
  const {tracker}=trackRound(s,createTracker(seed),[{type:'kill',id:55,monster:'necropolis_lord',stageId:'S27',threat:1,elite:false,xp:0}]);
  assert.ok([1,2].includes(tracker.tempLoot.stacks.silver_ingot),`seed ${seed}`);
 }
});
