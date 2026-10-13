import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, SaveStore, SAVE_KEY, validateSave } from '../js/meta/save.js';
import { createTracker, trackRound, settleRound, buildRoundMods } from '../js/meta/run.js';
import { masteryLevel, masteryLabel, masteryLevels, setMasteryLevel, MASTERY_THRESHOLDS, trackMastery } from '../js/meta/skill-mastery.js';
import { presentSkillEvents } from '../js/net/skill-presentation.js';
import { createWorld, addPlayer, startStage, spawnMonster, step, emptyInput } from '../js/sim/world.js';
const fresh = () => createSave({name:'숙련',weapon:'focus',answers:[0,0,0,0,0],createdAt:1});
const world = {round:{stageId:'S2'},entities:[{id:1,kind:'player',pid:'a'},{id:2,kind:'player',pid:'b'},{id:3,kind:'monster'},{id:4,kind:'monster'}],projectiles:[]};
const act = (ability='ember_bolt',id=1) => ({type:'act',ability,id});
const hit = (ability='ember_bolt',dst=3,src=1) => ({type:'hit',ability,dst,src});
test('thresholds, labels and debug minimum counts are shared and validated',()=>{
 assert.deepEqual(MASTERY_THRESHOLDS,[0,30,100,250,500]);
 for(const [count,level] of [[0,1],[29,1],[30,2],[99,2],[100,3],[249,3],[250,4],[499,4],[500,5]]) assert.equal(masteryLevel(count),level);
 const s=setMasteryLevel(fresh(),'frost_lance',3); assert.equal(s.skillMastery.frost_lance,100); assert.equal(masteryLabel(s,'frost_lance'),'숙련: Lv3 (100/250)');
 assert.equal(masteryLabel(setMasteryLevel(s,'frost_lance',5),'frost_lance'),'숙련: Lv5 (최대)');
 assert.throws(()=>setMasteryLevel(s,'arrow',3)); assert.throws(()=>setMasteryLevel(s,'frost_lance',6));
 assert.ok(validateSave(s)); assert.equal(validateSave({...s,skillMastery:{frost_lance:-1}}),false);
 assert.deepEqual(buildRoundMods(s),buildRoundMods(fresh())); assert.equal(masteryLevels(s).frost_lance,3);
});
test('one successful cast counts once across multiple targets/ticks; basic, misses, allies, other caster, town excluded',()=>{
 let t=createTracker(1); const s=fresh();
 t=trackRound(s,t,[act(),hit(),hit('ember_bolt',4)],{},world,'a').tracker; assert.equal(t.skillMastery.ember_bolt,1);
 t=trackRound(s,t,[hit()],{},world,'a').tracker; assert.equal(t.skillMastery.ember_bolt,1);
 t=trackRound(s,t,[act(),act('arrow'),hit('arrow'),act('frost_lance'),hit('frost_lance',2),act('volley',2),hit('volley',3,2)],{},world,'a').tracker;
 assert.deepEqual(t.skillMastery,{ember_bolt:1});
 t=trackRound(s,t,[hit()],{},world,'a').tracker; assert.equal(t.skillMastery.ember_bolt,2);
 t=trackRound(s,t,[act(),hit()],{},{...world,round:{}},'a').tracker; assert.equal(t.skillMastery.ember_bolt,2);
});
test('projectile hit survives an intervening different skill/basic act',()=>{
 const t={}; trackMastery(t,[act('volley'),act('arrow'),act('frost_lance'),hit('volley'),hit('volley',4)],world,'a');
 assert.deepEqual(t.skillMastery,{volley:1});
});
for(const terminal of ['clear','death','return_scroll']) test(`${terminal}: settlement persists count and rise; old save needs no version migration`,()=>{
 const s=setMasteryLevel(fresh(),'ember_bolt',2); s.skillMastery.ember_bolt=99;
 const result=settleRound(s,{stageId:'S2',terminal,skillMastery:{ember_bolt:1}});
 assert.equal(result.save.skillMastery.ember_bolt,100); assert.deepEqual(result.receipt.masteryRises,[{id:'ember_bolt',level:3}]); assert.ok(validateSave(result.save));
 const mem=new Map(), storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};
 const store=new SaveStore(storage); store.save(result.save); assert.equal(store.load().skillMastery.ember_bolt,100);
 const old=fresh(); delete old.skillMastery; mem.set(SAVE_KEY,JSON.stringify(old)); assert.ok(validateSave(old)); assert.deepEqual(store.load().skillMastery,{});
 assert.equal([...mem.keys()].length,1);
});
test('real host multi-hit whirl cast increments once, not per enemy',()=>{
 const w=createWorld({seed:17});addPlayer(w,{pid:'a',weapon:'blade',mods:{skills:['whirl'],maxMp:1000,maxHp:10000}});startStage(w,'S2');
 const player=w.entities[0];spawnMonster(w,'goblin_grunt',player.x+40,player.y,{hpMult:100}).spawnLeft=0;spawnMonster(w,'goblin_grunt',player.x+75,player.y+30,{hpMult:100}).spawnLeft=0;
 let tracker=createTracker(1),hits=0;const s=fresh();
 for(let i=0;i<25;i++){const events=step(w,{a:{...emptyInput(),skillEdge:i===0}});hits+=events.filter(e=>e.type==='hit'&&e.src===player.id&&e.ability==='whirl').length;tracker=trackRound(s,tracker,events,{},w,'a').tracker;}
 assert.ok(hits>=2);assert.equal(tracker.skillMastery.whirl,1);
});
test('host presentation attributes delayed guest hits even after corpse is absent, without editing events/world',()=>{
 const events=[act(),hit()], before=JSON.stringify({events,world});
 const decorated=presentSkillEvents(events,world,new Map()); assert.equal(JSON.stringify({events,world}),before);
 const tracker={}; trackMastery(tracker,decorated,{...world,entities:world.entities.filter(e=>e.kind==='player')},'a'); assert.equal(tracker.skillMastery.ember_bolt,1);
});
