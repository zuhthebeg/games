import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {rollDrops,ITEMS} from '../js/meta/items.js';
import {ECONOMY,rng,weighted} from '../js/meta/economy.js';
import {BALANCE} from '../js/content/balance.js';
const n=24000;
const rolled=l=>l.items.filter(i=>i.uid.includes(':rolled:'));
test('B gear gates reduce normal/elite by tier; boss retains guarantee with quarter extra',()=>{
 assert.equal(ECONOMY.gearChance,.04);assert.equal(ECONOMY.eliteGearChance,.16);assert.equal(ECONOMY.bossExtraChance,.25);
 const rows=[];
 for(const [rank,flags,chance] of [['normal',{},.04],['elite',{elite:true},.16],['boss',{boss:true},1]])for(const [tier,mult] of [[1,1],[2,.85],[3,.7],[4,.55]]){
  let gear=0,extra=0,oldGear=0;
  for(let seed=1;seed<=n;seed++){
   const old=rng(seed^0xa521d937);if(old()<(rank==='normal'?.1:rank==='elite'?.35:1))oldGear++;
   const items=rolled(rollDrops('skeleton_minion',seed,{...flags,huntTier:tier}));
   if(rank==='boss'){assert.ok(items.length>=1);extra+=items.length-1;}else gear+=items.length;
  }
  const actual=(rank==='boss'?extra:gear)/n,expected=rank==='boss'?.25:chance*mult;
  assert.ok(Math.abs(actual-expected)<.012,`${rank} T${tier} ${actual} expected ${expected}`);rows.push({rank,tier,actual,expected,...(rank==='boss'?{}:{oldRate:oldGear/n,reduction:1-gear/oldGear})});
 }
 console.log('B deterministic gear rates',JSON.stringify(rows));
});
test('B rare/epic weights are discounted for normal and boss while keeping pity',()=>{
 for(const boss of [false,true])for(let seed=1;seed<=1000;seed++){
  const ctx={boss,huntTier:3,threat:3},r=rng(seed^0xa521d937),chance=boss?1:.04*.7*1.9;
  if(r()>=chance)continue;if(boss)r();
  const base=boss?BALANCE.threats[2].bossRarity:BALANCE.threats[2].rarity;
  const rarity=weighted(Object.entries(base).map(([k,w])=>[k,w*(k==='rare'?.7:k==='epic'?.5:1)]),r);
  assert.equal(ITEMS[rolled(rollDrops('skeleton_minion',seed,ctx))[0].id].rarity,rarity);
 }
 for(let seed=1;seed<=1000;seed++)assert.notEqual(ITEMS[rolled(rollDrops('goblin_chief',seed,{rarelessRounds:6}))[0].id].rarity,'fine');
});
test('B every dropped gear uses exact independent safe enhancement weights, including side/exclusive drops',()=>{
 const weights={normal:[50,25,12,7,4,2,0],elite:[20,25,22,17,10,5,1],boss:[5,15,20,25,20,10,5]};
 const rows=[];
 for(const [rank,flags] of [['normal',{}],['elite',{elite:true}],['boss',{boss:true}]]){
  const bins=Array(7).fill(0);
  for(let seed=1;seed<=n;seed++)for(const item of rollDrops('throne_dragon',seed,{...flags,huntTier:4}).items){
   const expected=Number(weighted(weights[rank].map((w,i)=>[i,w]),rng(item.rolledAt^0xd09e6a31)));
   assert.equal(item.enhance,expected);assert.ok(item.enhance>=0&&item.enhance<=6);bins[item.enhance]++;
  }
  const total=bins.reduce((a,b)=>a+b);assert.ok(total>100);
  bins.forEach((count,i)=>assert.ok(Math.abs(count/total-weights[rank][i]/100)<.06,`${rank} +${i}`));rows.push({rank,bins,total});
 }
 console.log('B deterministic enhance bins',JSON.stringify(rows));
});
test('B premium materials are rare T2+ independent rolls, boss guarantees 1~2 each; scales unchanged',()=>{
 for(const [rank,flags,chance] of [['normal',{},.01],['elite',{elite:true},.08],['boss',{boss:true},1]]){
  const bins={rune_shard:0,frost_shard:0};
  for(let seed=1;seed<=n;seed++){
   const loot=rollDrops('skeleton_minion',seed,{...flags,huntTier:2});
   for(const id of Object.keys(bins)){const count=loot.stacks[id]||0;if(rank==='boss')assert.ok(count===1||count===2);else assert.ok(count<=1);if(count)bins[id]++;}
  }
  for(const id of Object.keys(bins))assert.ok(Math.abs(bins[id]/n-chance)<.012,`${rank} ${id}`);
  console.log('B premium drops',JSON.stringify({rank,n,bins}));
 }
 for(let seed=1;seed<=300;seed++){
  const t1=rollDrops('skeleton_minion',seed,{huntTier:1});assert.ok(!t1.stacks.rune_shard&&!t1.stacks.frost_shard);
  assert.equal(rollDrops('throne_dragon',seed,{huntTier:4}).stacks.dragon_scale,1);
 }
});
test('B basic materials gain ~50% with stochastic rounding, consumable and gold/stone streams unchanged',()=>{
 let total=0,base=0;
 for(let seed=1;seed<=n;seed++){const loot=rollDrops('skeleton_minion',seed,{huntTier:1}),r=rng(seed);r();if(r()<.6)base++;if(r()<.4)base++;total+=(loot.stacks.scrap||0)+(loot.stacks.fang||0);}
 assert.ok(Math.abs(total/base-1.5)<.025,`${total/base}`);console.log('B basic material ratio',total/base);
 for(const [m,c,hash] of [
  ['goblin_grunt',{},'519c8604b50270e9f77aef572fbe6ba81c9784e2bbff941743c23673b5722bfa'],
  ['ghost',{elite:true,huntTier:3,stageId:'S21',threat:2},'73f3357475a7697f5f148fded89cc21eb690c7ff8d4e59dfb9953d30f1f66cd7'],
  ['necropolis_lord',{boss:true,huntTier:4,stageId:'S27',threat:3},'55a2366a458e1b5a5dca08a82dc929ead699275c38987a44100b80f380b6b57b']]){
  const out=[];for(let seed=1;seed<=500;seed++){const l=rollDrops(m,seed,c);out.push({gold:l.gold,stones:Object.fromEntries(Object.entries(l.stacks).filter(([id])=>id.startsWith('enhance_stone')))});}
  assert.equal(createHash('sha256').update(JSON.stringify(out)).digest('hex'),hash);
 }
});
