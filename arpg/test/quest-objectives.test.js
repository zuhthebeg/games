import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addPlayer,startStage,step,emptyInput} from '../js/sim/world.js';
import {createObjective,stepObjective,releaseCarrier} from '../js/sim/quest-objectives.js';
import {OBJECTIVE_QUESTS} from '../js/content/quest-expansion.js';
import {STAGES} from '../js/content/combat.js';
import {BALANCE,monsterSizeProfile} from '../js/content/balance.js';
import {mapUnlocked,REGIONS,MAPS} from '../js/content/world-map.js';
import {biomeForStage} from '../js/content/biomes.js';
import {createSave,validateSave} from '../js/meta/save.js';
import {settleRound} from '../js/meta/run.js';
import {stageXp,deathLoss} from '../js/meta/progression.js';
const id='M_MINE_CART';
function setup(count=1){const w=createWorld({seed:42});for(let i=0;i<count;i++)addPlayer(w,{pid:String(i),mods:{maxHp:10000}});startStage(w,id);return w;}
const pawn=(w,i=0)=>w.entities.find(p=>p.pid===String(i));
const at=(p,pos)=>{p.x=pos.x;p.y=pos.y;p.moving=false;};
function dwell(w,n=15,inputs={}){for(let i=0;i<n;i++)stepObjective(w,inputs);}
function carry(w,i=0){at(pawn(w,i),w.round.objective.token);dwell(w);assert.equal(w.round.objective.carrier,String(i));}
test('QM1 registry: distinct map, three fixed slots, gate S10, mine biome and explicit S12 anchors',()=>{
 assert.equal(MAPS[id].questId,'QM1');assert.equal(STAGES[id].goal,'objective');assert.deepEqual(STAGES[id].spawns,OBJECTIVE_QUESTS.QM1.spawns);
 assert.deepEqual(STAGES[id].spawns.map(s=>s.at),[0,0,2000]);assert.equal(STAGES[id].maxConcurrent,3);
 assert.equal(mapUnlocked({cleared:{S10:true}},id),true);assert.equal(mapUnlocked({cleared:{S12:true}},id),false);
 assert.deepEqual(REGIONS.find(r=>r.id==='mine').maps,['S12','S17']);assert.equal(REGIONS.length,7);assert.equal(biomeForStage(id),'mine');
 assert.equal(BALANCE.stages[id].huntTier,3);assert.equal(BALANCE.stages[id].rewardRank,12);
 assert.deepEqual(monsterSizeProfile(id,false,false,.7),monsterSizeProfile('S12',false,false,.7));
});
test('unsupported objectives fail explicitly, never silently killAll',()=>assert.throws(()=>createObjective({kind:'visited'},{w:1,h:1}),/Unknown/));
test('500ms / 15 ticks continuous dwell; leaving resets, damage alone preserves',()=>{
 const w=setup(),p=pawn(w),o=w.round.objective;at(p,o.token);dwell(w,14);assert.equal(o.carrier,null);p.hp-=5;dwell(w,1);assert.equal(o.carrier,'0');
 const w2=setup(),p2=pawn(w2);at(p2,w2.round.objective.token);dwell(w2,14);p2.x+=65;dwell(w2,1);assert.deepEqual(w2.round.objective.progress,{});at(p2,w2.round.objective.token);dwell(w2,14);assert.equal(w2.round.objective.carrier,null);
});
for(const interrupt of ['movement','dodge','channel','death','terminal'])test(`${interrupt} interrupts dwell`,()=>{
 const w=setup(),p=pawn(w);at(p,w.round.objective.token);dwell(w,10);
 const inputs={};if(interrupt==='movement')inputs['0']={mx:1};if(interrupt==='dodge')inputs['0']={dodgeEdge:true};if(interrupt==='channel')p.channel=1;if(interrupt==='death')p.dead=true;if(interrupt==='terminal')p.terminal='return_scroll';
 dwell(w,1,inputs);assert.deepEqual(w.round.objective.progress,{});
});
test('first continuous contact wins, shared pickup never duplicates',()=>{
 const w=setup(2);at(pawn(w),w.round.objective.token);dwell(w,3);at(pawn(w,1),w.round.objective.token);dwell(w,12);assert.equal(w.round.objective.carrier,'0');assert.equal(w.events.filter(e=>e.type==='tokenPicked').length,1);
});
for(const terminal of ['death','return_scroll'])test(`carrier ${terminal} drops clamped token; companion reclaims`,()=>{
 const w=setup(2),p=pawn(w);carry(w);p.terminal=terminal;p.dead=terminal==='death';p.x=-50;p.y=99999;dwell(w,1);assert.deepEqual(w.round.objective.token,{x:0,y:860});assert.equal(w.round.objective.carrier,null);
 at(pawn(w,1),w.round.objective.token);dwell(w);assert.equal(w.round.objective.carrier,'1');at(pawn(w,1),w.round.objective.entry);dwell(w);assert.equal(w.round.objective.state,'complete');assert.deepEqual(w.events.at(-1).participants,['1']);assert.equal(p.terminal,terminal);
});
test('departed carrier releases token before entity removal',()=>{const w=setup(2);carry(w);const p=pawn(w);p.x=400;p.y=200;releaseCarrier(w,p);w.entities=w.entities.filter(e=>e!==p);dwell(w);assert.equal(w.round.objective.carrier,null);assert.deepEqual(w.round.objective.token,{x:400,y:200});});
test('return needs carrier and own 15-tick dwell; cannot claim from client booleans',()=>{
 const w=setup(2);carry(w);at(pawn(w,1),w.round.objective.entry);dwell(w,30,{'1':{carried:true,visited:true}});assert.equal(w.round.objective.state,'carried');at(pawn(w),w.round.objective.entry);dwell(w,14);assert.equal(w.round.objective.state,'carried');dwell(w,1);assert.equal(w.round.objective.state,'complete');
});
test('real sim spawns total 3 once, clear with living enemies, then freezes damage/spawn/kill/events',()=>{
 const w=setup();for(let i=0;i<61;i++)step(w);assert.equal(w.entities.filter(p=>p.kind==='monster').length,3);assert.equal(w.round.pending.length,0);
 const p=pawn(w);at(p,w.round.objective.token);for(let i=0;i<15;i++)step(w);assert.equal(w.round.objective.carrier,'0');at(p,w.round.objective.entry);let events;for(let i=0;i<15;i++)events=step(w);
 assert.equal(w.round.state,'clear');assert.equal(p.terminal,'clear');assert.ok(w.entities.some(e=>e.kind==='monster'&&!e.dead));assert.equal(events.filter(e=>e.type==='objectiveComplete').length,1);
 const state=JSON.stringify({...w,events:[]});for(let i=0;i<20;i++)assert.deepEqual(step(w,{'0':{autoAttack:true}}),[]);assert.equal(JSON.stringify(w),state);
});
test('same final tick death wins over objective success; other terminal pawns stay terminal',()=>{
 const w=setup(3);carry(w,1);const p=pawn(w,1);at(p,w.round.objective.entry);dwell(w,14);p.hp=0;p.dead=true;p.terminal='death';pawn(w).terminal='return_scroll';step(w);assert.notEqual(w.round.state,'clear');assert.equal(p.terminal,'death');assert.equal(pawn(w).terminal,'return_scroll');
});
test('old saves accept absent optional clear; first XP910, repeat228, anchor death penalty; no token inventory',()=>{
 const s=createSave({name:'QM1',answers:[0,0,0,0,0],weapon:'blade',createdAt:1});delete s.cleared[id];assert.equal(validateSave(s),true);
 assert.equal(stageXp(s,id),910);assert.equal(deathLoss({...s,xp:100},id),deathLoss({...s,xp:100},'S12'));
 const r=settleRound(s,{stageId:id,terminal:'clear'});assert.equal(r.receipt.stageXp,910);assert.equal(stageXp(r.save,id),228);assert.equal(validateSave(r.save),true);assert.equal(r.receipt.lootKept.items.length,0);assert.deepEqual(r.receipt.lootKept.stacks,{});
});
test('fatal periodic damage on final return tick drops token instead of resurrecting carrier',()=>{
 const w=setup(2),p=pawn(w);carry(w);at(p,w.round.objective.entry);dwell(w,14);
 p.hp=1;p.poison={left:2,next:1,interval:30,hit:{def:{damage:2},mult:1,periodic:true,srcId:999,srcKind:'monster',abilityId:'spider_poison',fromX:p.x,fromY:p.y}};
 const events=step(w);assert.equal(p.terminal,'death');assert.equal(w.round.objective.carrier,null);assert.notEqual(w.round.state,'clear');assert.ok(events.some(e=>e.type==='death'));assert.ok(!events.some(e=>e.type==='objectiveComplete'));
});
test('dead or returned companion on success tick retains terminal; only living pawn clears in real sim',()=>{
 for(const terminal of ['death','return_scroll']) {
  const w=setup(2),p=pawn(w);pawn(w,1).terminal=terminal;pawn(w,1).dead=terminal==='death';carry(w);at(p,w.round.objective.entry);dwell(w,14);const events=step(w);
  assert.equal(p.terminal,'clear');assert.equal(pawn(w,1).terminal,terminal);assert.deepEqual(events.find(e=>e.type==='objectiveComplete').participants,['0']);
 }
});
test('S12 loot anchor stays finite and identical at all threat levels; objective completion supplies no gear',async()=>{
 const {rollDrops}=await import('../js/meta/items.js');
 for(const threat of [1,2,3])for(const monster of ['iron_boar','goblin_slinger','goblin_grunt'])for(let seed=1;seed<25;seed++) {
  const ctx={huntTier:3,threat,elite:false};const loot=rollDrops(monster,seed,{...ctx,stageId:id});
  assert.deepEqual(loot,rollDrops(monster,seed,{...ctx,stageId:'S12'}));assert.ok(Number.isFinite(loot.gold));
 }
});
