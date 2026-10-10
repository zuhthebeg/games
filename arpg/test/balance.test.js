import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BALANCE, threatMultipliers } from '../js/content/balance.js';
import { STAGES, MONSTERS, ABILITIES } from '../js/content/combat.js';
import { createWorld,addPlayer,startStage,step,spawnMonster,emptyInput } from '../js/sim/world.js';
import { createSave,validateSave,SaveStore,SAVE_KEY } from '../js/meta/save.js';
import { buildRoundMods,createTracker,trackRound,selectThreat,unlockedThreat,settleRound } from '../js/meta/run.js';
import { ITEMS,rollDrops,dropSeed } from '../js/meta/items.js';
import { simulate,summarize,preset } from '../tools/balance/botsim.mjs';
import { botInput } from '../tools/balance/bot.js';
import { HubUI } from '../js/ui/hub.js';

const fresh=()=>createSave({name:'위협 시험',answers:[0,0,0,0,0],createdAt:1});
function firstSpawn(seed,threat=1) {
  const world=createWorld({seed,threat});addPlayer(world,{pid:'a'});startStage(world,'S2');step(world);
  return world;
}
test('elite spawn is seeded, 8~12% content policy; variant rank is separate from archetype elite',()=>{
  let elite=0;
  for(let seed=1;seed<=1000;seed++) {
    const world=firstSpawn(seed),other=firstSpawn(seed);
    assert.deepEqual(world,other);
    const m=world.entities[1];elite+=+m.eliteVariant;
    assert.equal(m.maxHp,Math.round(MONSTERS[m.type].hp*STAGES.S2.hpMult*(m.eliteVariant?BALANCE.elite.hp:1)));
    assert.equal(m.dmgMult,STAGES.S2.dmgMult*(m.eliteVariant?BALANCE.elite.damage:1));
    assert.equal(world.events[0].elite,m.eliteVariant);
  }
  assert.ok(elite>=55&&elite<=105,`elite=${elite}/1000`);
  for(const id of ['S2','S3','S4','S5','S6','S7']) assert.ok(STAGES[id].eliteChance>=.08&&STAGES[id].eliteChance<=.12);
  const world=createWorld(),chief=spawnMonster(world,'goblin_chief',800,400);
  assert.equal(MONSTERS.goblin_chief.elite,true);assert.equal(chief.eliteVariant,false);
});
test('threat 1~3 applies HP/damage once at spawn, frozen round survives snapshot replay',()=>{
  for(let threat=1;threat<=3;threat++) {
    const world=firstSpawn(11,threat),m=world.entities[1],mult=threatMultipliers(threat);
    assert.equal(world.round.threat,threat);
    assert.equal(m.maxHp,Math.round(MONSTERS[m.type].hp*STAGES.S2.hpMult*mult.hp*(m.eliteVariant?BALANCE.elite.hp:1)));
    assert.equal(m.dmgMult,STAGES.S2.dmgMult*mult.damage*(m.eliteVariant?BALANCE.elite.damage:1));
    const replay=structuredClone(world);
    world.threat=1; // frozen stage value, not mutable selection, drives later spawn waves
    replay.threat=1;
    for(let tick=0;tick<600;tick++) assert.deepEqual(step(world,{a:emptyInput()}),step(replay,{a:emptyInput()}));
    assert.deepEqual(world,replay);
    assert.throws(()=>addPlayer(world,{pid:'b',mods:{threat:2}}),/frozen/);
  }
  assert.throws(()=>createWorld({threat:4}),/threat/);
});
test('save v2 optional threat fields default to 1; bad keys/tiers reject, storage keeps old v2 intact',()=>{
  const save=fresh();delete save.threat;delete save.stageThreat;
  const raw=JSON.stringify(save),storage=new Map([[SAVE_KEY,raw]]);
  const store=new SaveStore({getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)});
  assert.ok(validateSave(save));assert.deepEqual(store.load(),save);assert.equal(storage.get(SAVE_KEY),raw);
  assert.equal(unlockedThreat(save,'S4'),1);assert.equal(buildRoundMods(save).threat,1);
  for(const stageThreat of [{S4:-1},{S4:4},{S4:1.5},{S99:1},[]]) assert.equal(validateSave({...save,stageThreat}),false);
  assert.equal(validateSave({...save,threat:4}),false);
  const v1=JSON.parse(readFileSync(new URL('./fixtures/save-v1-s4.json',import.meta.url)));
  storage.set(SAVE_KEY,JSON.stringify(v1));assert.equal(unlockedThreat(store.load(),'S4'),2);
});
test('stage-specific threat unlock only on matching tier clear; return/death never promote, no skipped tier',()=>{
  let save=fresh();assert.throws(()=>selectThreat(save,'S4',2),/잠겨/);
  for(const terminal of ['return_scroll','death']) assert.equal(unlockedThreat(settleRound(save,{stageId:'S4',terminal}).save,'S4'),1);
  save=settleRound(save,{stageId:'S4',terminal:'clear'}).save;
  assert.equal(unlockedThreat(save,'S4'),2);assert.equal(save.stageThreat.S4,1);assert.equal(unlockedThreat(save,'S3'),1);
  save=selectThreat(save,'S4',2);
  const world=createWorld();addPlayer(world,{pid:'a',mods:buildRoundMods(save)});startStage(world,'S4');
  assert.equal(world.round.threat,2);
  save=settleRound(save,{stageId:'S4',terminal:'clear'}).save;assert.equal(save.lastReceipt.threat,2);
  assert.equal(unlockedThreat(save,'S4'),3);assert.ok(validateSave(save));
  save=selectThreat(save,'S4',3);save=settleRound(save,{stageId:'S4',terminal:'clear'}).save;
  assert.equal(unlockedThreat(save,'S4'),3);assert.equal(save.stageThreat.S4,3);assert.throws(()=>selectThreat(save,'S1',2),/잠겨/);
});
test('real elite kill event carries ctx through trackRound to exact seeded loot',()=>{
  const seed=Array.from({length:1000},(_,i)=>i+1).find(s=>firstSpawn(s).entities[1].eliteVariant);
  const world=createWorld({seed,threat:3});
  addPlayer(world,{pid:'a',x:STAGES.S2.spawns[0].fx*1400-40,y:STAGES.S2.spawns[0].fy*860,
    mods:{maxHp:100000,dmgMult:{blade:100000}}});startStage(world,'S2');
  let kill;
  for(let t=0;t<150&&!kill;t++) kill=step(world,{a:{...emptyInput(),attack:true}}).find(e=>e.type==='kill');
  assert.ok(kill);assert.equal(kill.elite,true);assert.equal(kill.threat,3);assert.equal(kill.stageId,'S2');
  const save=fresh(),expected=rollDrops(kill.monster,dropSeed(seed,0),{elite:true,threat:3,stageId:'S2'});
  const result=trackRound(save,createTracker(seed),[kill]).tracker;
  assert.deepEqual(result.tempLoot,expected);
});
test('threat increases equipment/stone rates and high-grade weight; 1.3 stage curve and gold multipliers',()=>{
  const metrics=[];
  for(let threat=1;threat<=3;threat++) {
    let gear=0,stone=0,rare=0,gold=0;
    for(let seed=0;seed<10000;seed++) {
      const loot=rollDrops('goblin_slinger',seed,{threat,stageId:'S3'});
      gear+=loot.items.length;stone+=Object.entries(loot.stacks).filter(([id])=>id.startsWith('enhance_stone')).reduce((n,[,v])=>n+v,0);
      rare+=loot.items.filter(i=>['rare','epic'].includes(ITEMS[i.id].rarity)).length;gold+=loot.gold;
    }
    metrics.push({gear,stone,rare,gold});
  }
  for(let i=1;i<3;i++) for(const key of ['gear','stone','rare','gold']) assert.ok(metrics[i][key]>metrics[i-1][key]);
  assert.ok(Math.abs(metrics[1].gold/metrics[0].gold-1.6)<.02);
  assert.ok(Math.abs(metrics[2].gold/metrics[0].gold-2.4)<.02);
  let low=0,high=0;
  for(let seed=0;seed<1000;seed++) {low+=rollDrops('goblin_grunt',seed,{stageId:'S2'}).gold;high+=rollDrops('goblin_grunt',seed,{stageId:'S7'}).gold;}
  assert.ok(Math.abs(high/low-BALANCE.rewardCurve**5)<.02);
});
test('all existing telegraph timings are unchanged under elite/threat, no invisible extra attacks',()=>{
  for(const threat of [1,2,3]) {
    const world=firstSpawn(11,threat),monster=world.entities[1];
    for(const id of MONSTERS[monster.type].abilities) {
      assert.ok(ABILITIES[id].windupMs>=400);assert.ok(ABILITIES[id].lockMs>0);
    }
  }
  assert.equal(STAGES.S1.timerMs,30000);assert.equal(STAGES.S1.eliteChance,0);
});
test('bot read-only inputs, nearest attack/ranged spacing/potion rule; same seed gives identical full summary',()=>{
  const world=createWorld(),p=addPlayer(world,{pid:'bot',weapon:'bow',mods:{maxHp:100}});
  spawnMonster(world,'goblin_grunt',p.x+40,p.y).spawnLeft=0;
  p.hp=34;
  const before=structuredClone(world),input=botInput(world,p);
  assert.ok(input.potionEdge);assert.ok(input.mx<0);assert.deepEqual(world,before);
  const a=simulate({stage:'S3',seed:11}),b=simulate({stage:'S3',seed:11});
  assert.deepEqual(a,b);assert.deepEqual(summarize([a]),summarize([b]));
  assert.ok(validateSave(preset('S4')));
});
test('sortie segment selection commits through existing launcher mods and blocks locked tier',()=>{
  const hub=Object.create(HubUI.prototype);
  const save=settleRound(fresh(),{stageId:'S2',terminal:'clear'}).save;
  Object.assign(hub,{save,sortieStage:'S2',root:{hidden:false},persist:()=>{},showSortie:()=>{}});
  hub.action('threat',{threat:'2'});assert.equal(hub.sortieThreat,2);
  assert.throws(()=>hub.action('threat',{threat:'3'}),/잠겨/);
  let launched;
  hub.startRound=stage=>{const w=createWorld();addPlayer(w,{pid:'a',mods:buildRoundMods(hub.save)});startStage(w,stage);launched=w;};
  hub.launch('S2');assert.equal(launched.round.threat,2);assert.ok(hub.root.hidden);
});
