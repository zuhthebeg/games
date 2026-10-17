import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGES, MONSTERS, ABILITIES } from '../js/content/combat.js';
import { BALANCE, threatMultipliers } from '../js/content/balance.js';
import { mapUnlocked, mapState, REGIONS, REGION_EDGES } from '../js/content/world-map.js';
import { createSave, SaveStore, validateSave } from '../js/meta/save.js';
import { stageXp, STAGE_XP } from '../js/meta/progression.js';
import { partyHpScale } from '../js/net/protocol.js';
import { createWorld, addPlayer, startStage, step } from '../js/sim/world.js';
import { rollDrops, ITEMS } from '../js/meta/items.js';
import { HubUI } from '../js/ui/hub.js';
const fresh=()=>createSave({name:'왕좌',answers:[0,0,0,0,0],createdAt:1});
test('TD1 requires S20 even with historical trial clears; no mutation, campaign unlock or save wipe',()=>{
 const s=fresh();s.cleared.TD1=true;s.stageThreat.TD1=2;
 const memory=new Map(),store=new SaveStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)});
 store.save(s);const legacy=store.load();assert.ok(validateSave(legacy));assert.deepEqual(legacy,s);
 assert.equal(mapUnlocked(legacy,'TD1'),false);assert.equal(mapState(legacy,'TD1'),'lock');
 assert.equal(mapUnlocked(legacy,'S20'),false);
 const hub=Object.assign(Object.create(HubUI.prototype),{save:legacy});
 assert.throws(()=>hub.showSortie('TD1'),/잠긴/);assert.throws(()=>hub.launch('TD1'),/잠긴/);
 const before=structuredClone(legacy);legacy.cleared.S20=true;
 assert.equal(mapUnlocked(legacy,'TD1'),true);assert.equal(mapState(legacy,'TD1'),'clear');
 assert.equal(legacy.stageThreat.TD1,2);assert.deepEqual(legacy.items,before.items);
 assert.equal(stageXp(legacy,'TD1'),Math.round(STAGE_XP.TD1*.25));
 const eligible=fresh();eligible.cleared.S20=true;assert.equal(mapState(eligible,'TD1'),'depart');
});
test('formal dragon is stronger than trial without exceeding S20 boss HP; party/threat reuse existing scaling',()=>{
 assert.equal(STAGES.TD1.testChallenge,undefined);assert.equal(BALANCE.stages.TD1.huntTier,3);
 assert.deepEqual(BALANCE.stages.TD1.rec,[22,'epic',4]);assert.equal(BALANCE.stages.TD1.rewardRank,20);
 for(const count of [1,2,3,4])for(const threat of [1,2,3]){
  const mult=partyHpScale(count,22,'TD1');const w=createWorld({seed:11,threat,partyHpMult:mult});
  for(let i=0;i<count;i++)addPlayer(w,{pid:String(i)});startStage(w,'TD1');step(w,{});
  const d=w.entities.find(e=>e.type==='throne_dragon');
  const s20=MONSTERS.goblin_chief.hp*STAGES.S20.hpMult*STAGES.S20.bossHpMult*BALANCE.monsterHp;
  assert.ok(d.maxHp>770*10*mult*threatMultipliers(threat).hp);
  assert.ok(d.maxHp<=s20*mult*threatMultipliers(threat).hp);
  assert.equal(d.dmgMult,3*threatMultipliers(threat).damage);
  // No unarmored one-shot even at threat3 on the recommended-level base HP (276).
  for(const id of d.abilities??MONSTERS.throne_dragon.abilities)assert.ok(ABILITIES[id].damage*d.dmgMult<100+8*22);
  assert.equal(d.eliteVariant,false);assert.equal(w.round.pending.length,0);
 }
 const timings={dragon_flame:[1400,400,650,1900],dragon_stomp:[1050,350,150,1700],dragon_tail:[1200,400,250,1850]};
 for(const [id,t] of Object.entries(timings)){const a=ABILITIES[id];assert.deepEqual([a.windupMs,a.lockMs,a.activeMs,a.recoveryMs],t);}
});
test('late rewards use existing T3 plus guardian-only T4 pools, finite bounded gold/materials and S19 XP convention; no guarantee',()=>{
 assert.equal(STAGE_XP.TD1,STAGE_XP.S19);assert.equal(MONSTERS.throne_dragon.xp,MONSTERS.goblin_chief.xp);
 let zeroGear=0;
 for(let seed=0;seed<100;seed++)for(const threat of [1,2,3]){
  const loot=rollDrops('throne_dragon',seed,{stageId:'TD1',huntTier:3,threat});
  assert.ok(Number.isSafeInteger(loot.gold)&&loot.gold>=0&&loot.gold<=250);
  assert.ok(loot.items.length<=4);if(!loot.items.length)zeroGear++;
  for(const item of loot.items){assert.ok(ITEMS[item.id]);assert.equal(ITEMS[item.id].huntTier,ITEMS[item.id].dropOnly==='throne_dragon'?4:3);}
  for(const [id,n] of Object.entries(loot.stacks)){assert.ok(ITEMS[id]);assert.ok(Number.isSafeInteger(n)&&n>0&&n<=10);}
 }
 assert.ok(zeroGear>0);
});
test('map keeps parchment, connects castle to throne in separate final columns from necropolis',()=>{
 assert.equal(REGIONS.find(r=>r.id==='throne').name,'왕좌 앞뜰');
 assert.deepEqual(REGIONS.find(r=>r.id==='throne').pos,[24,92]);
 assert.deepEqual(REGIONS.find(r=>r.id==='necropolis').pos,[76,92]);
 assert.ok(REGION_EDGES.some(([a,b])=>a==='castle'&&b==='throne'));
 const s=fresh(),h=Object.assign(Object.create(HubUI.prototype),{save:s,showInnPanel:(title,html,page,footer,opts)=>{h.html=html;h.opts=opts;}});
 h.showBoard();assert.doesNotMatch(h.html,/시험: 도전|시험 도전|균형:|잠정/);assert.match(h.html,/data-stage="TD1" class="contract lock" disabled/);
 s.cleared.TD1=true;h.showBoard();assert.match(h.html,/data-region="throne" class="region-node lock"/);
 s.cleared.S20=true;h.showBoard();assert.match(h.opts.eyebrow,/1 \/ 20 완료/);
 const css=readFileSync(new URL('../css/game.css',import.meta.url),'utf8');assert.match(css,/#d9c69f/);
});

test('repeat TD1 does not outfarm S20 XP/gold/gear in the same late solo policy (3 seeds); legacy reload never regrants first clear',async()=>{
 const {throneLateSave}=await import('./fixtures/throne-late.js');
 const {botInput}=await import('../tools/balance/bot.js');
 const {buildRoundMods,createTracker,trackRound,settleRound}=await import('../js/meta/run.js');
 for(const seed of [1,11,79]){
  const results={};
  for(const id of ['TD1','S20']){
   // Two-handed warden blade/maul intentionally doubles weapon damage; this repeat-farm guard measures an unaffected one-hand-rate bow build.
   const save=throneLateSave('host','bow');save.cleared[id]=true;save.stageThreat[id]=1;
   const w=createWorld({seed}),p=addPlayer(w,{pid:'a',weapon:'bow',mods:buildRoundMods(save)});startStage(w,id);let tracker=createTracker(seed);
   for(let t=0;t<18000&&w.round.state==='running';t++)tracker=trackRound(save,tracker,step(w,{a:botInput(w,p)})).tracker;
   assert.equal(w.round.state,'clear');const out=settleRound(save,{stageId:id,terminal:p.terminal,...tracker});
   const minute=w.tick/1800;results[id]={xp:(out.receipt.stageXp+tracker.depositedXp)/minute,gold:out.receipt.goldGained/minute,gear:out.receipt.lootKept.items.length/minute};
   if(id==='TD1'){
    assert.equal(out.receipt.stageXp,505);assert.ok(out.receipt.lootKept.items.length<=2);
    const memory=new Map(),store=new SaveStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)});
    store.save(out.save);for(let reload=0;reload<3;reload++)assert.deepEqual(store.load(),out.save);
   }
  }
  for(const field of ['xp','gold','gear'])assert.ok(results.TD1[field]<=results.S20[field],`${seed}/${field}`);
 }
});
