import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {STAGES,MONSTERS} from '../js/content/combat.js';
import {BALANCE} from '../js/content/balance.js';
import {BIOMES,biomeForStage} from '../js/content/biomes.js';
import {REGIONS,REGION_EDGES,MAPS,mapUnlocked} from '../js/content/world-map.js';
import {NEW_MONSTER_DROPS} from '../js/content/loot.js';
import {ITEMS,rollDrops} from '../js/meta/items.js';
import {createSave,SaveStore,validateSave,SAVE_VERSION} from '../js/meta/save.js';
import {stageXp} from '../js/meta/progression.js';
import {createWorld,addPlayer,startStage,step,setLoad} from '../js/sim/world.js';
import {buildRoundMods,createTracker,trackRound,settleRound,usedConsumables} from '../js/meta/run.js';
import {preset} from '../tools/balance/botsim.mjs';
import {botInput} from '../tools/balance/bot.js';
import {questEvents,rewardSave} from './fixtures/quest-rewards.js';
import {HubUI} from '../js/ui/hub.js';
const stages=['S21','S22','S23'];
const ids=['skeleton_minion','skeleton_warrior','skeleton_rogue','skeleton_mage','ghoul','ghost','bat'];
const fresh=()=>createSave({name:'묘지',answers:[0,0,0,0,0],createdAt:1});
async function baseline(file){let source=execFileSync('git',['show','6eca8b8:arpg/js/'+file],{encoding:'utf8'});source=source.replace(/from '([^']+)'/g,(_,p)=>'from '+JSON.stringify(new URL(p,new URL('../js/'+file,import.meta.url)).href));return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}

test('U5 preserves every original stage, tuning, map gate, palette, reward and item definition exactly',async()=>{
 const oldCombat=await baseline('content/combat.js');
 // Combat constructors depend on current balance: compare legacy tuning independently too.
 for(const [id,s] of Object.entries(oldCombat.STAGES))assert.deepEqual(STAGES[id],s,id);
 for(const file of ['content/balance.js','content/biomes.js','meta/progression.js','content/loot.js','meta/items.js']){
  const old=await baseline(file);
  const current=await import(new URL('../js/'+file,import.meta.url));
  const names={ 'content/balance.js':['BALANCE'], 'content/biomes.js':['BIOMES','STAGE_BIOMES'], 'meta/progression.js':['STAGE_XP'], 'content/loot.js':['NEW_MONSTER_DROPS'], 'meta/items.js':['ITEMS','RECIPES'] }[file];
  for(const name of names)for(const [id,value] of Object.entries(old[name])){
   if(name==='BALANCE'&&id==='stages'){for(const [stage,tune] of Object.entries(value))assert.deepEqual(current[name][id][stage],tune,stage);}
   else assert.deepEqual(current[name][id],value,file+'/'+id);
  }
 }
 const oldMap=await baseline('content/world-map.js');
 for(const [id,map] of Object.entries(oldMap.MAPS))assert.deepEqual(MAPS[id],map,id);
 assert.deepEqual(oldMap.REGION_EDGES,REGION_EDGES.slice(0,oldMap.REGION_EDGES.length));
 // N3 was independently reviewed and deployed after U5 branched; pin all N3 mechanics/transport bytes. AV1 world/prediction changes are covered by exact abcd094 disabled traces and AV1 fixtures.
 assert.equal(execFileSync('git',['diff','--exit-code','3104089','--','arpg/js/sim/core.js','arpg/js/sim/movement.js','arpg/js/sim/dodge-lag.js','arpg/js/sim/quest-objectives.js','arpg/js/net/session.js','arpg/js/net/loopback.js','arpg/js/net/lobby.js','arpg/js/net/skill-presentation.js','arpg/js/render/telegraph-time.js'],{encoding:'utf8'}),'','reviewed N3 tracked bytes unchanged');
 assert.equal(execFileSync('git',['diff','--exit-code','6eca8b8','--','arpg/assets','arpg/tools/art'],{encoding:'utf8'}),'','M2a art tracked bytes unchanged');
});

test('U5 gate is S20, then sequential clears, never TD1/QC1; forged historical U5 clears cannot bypass S20',()=>{
 const s=fresh();for(const id of stages)assert.equal(mapUnlocked(s,id),false);
 s.cleared.TD1=true;s.cleared.M_THRONE_GARGOYLE=true;for(const id of stages)assert.equal(mapUnlocked(s,id),false);
 for(const id of stages)s.cleared[id]=true;for(const id of stages)assert.equal(mapUnlocked(s,id),false);
 for(const id of stages)s.cleared[id]=false;s.cleared.S20=true;
 assert.ok(mapUnlocked(s,'S21'));assert.equal(mapUnlocked(s,'S22'),false);assert.equal(mapUnlocked(s,'S23'),false);
 s.cleared.S21=true;assert.ok(mapUnlocked(s,'S22'));assert.equal(mapUnlocked(s,'S23'),false);s.cleared.S22=true;assert.ok(mapUnlocked(s,'S23'));
 assert.deepEqual(MAPS.S21.requires,['S20']);assert.deepEqual(MAPS.S22.requires,['S21']);assert.deepEqual(MAPS.S23.requires,['S22']);
 const edges=new Set();for(const [a,b] of REGION_EDGES){assert.ok(REGIONS.some(r=>r.id===a)&&REGIONS.some(r=>r.id===b));assert.notEqual(a,b);assert.ok(!edges.has([a,b].sort().join('/')));edges.add([a,b].sort().join('/'));}
 assert.ok(edges.has('castle/graveyard'));assert.ok(edges.has('castle/throne'));
 assert.deepEqual(REGIONS.find(r=>r.id==='graveyard').maps,stages);
 assert.deepEqual(new Set(stages.flatMap(id=>STAGES[id].spawns.map(s=>s.monster))),new Set(ids));
 for(const id of stages){assert.equal(biomeForStage(id),'graveyard');assert.equal(STAGES[id].goal,'killAll');assert.equal(BALANCE.stages[id].huntTier,4);for(const spawn of STAGES[id].spawns){assert.ok(spawn.fx>.05&&spawn.fx<.95&&spawn.fy>.05&&spawn.fy<.95);assert.ok(MONSTERS[spawn.monster]);}}
 assert.equal(STAGES.S23.maxConcurrent,1);assert.equal(STAGES.S23.eliteChance,1);assert.equal(STAGES.S23.spawns.at(-1).monster,'skeleton_mage');assert.equal(STAGES.S23.spawns.filter(s=>s.monster==='skeleton_mage').length,1);
 assert.equal(BIOMES.graveyard.props.length,8);
});

test('U5 all placed species have deterministic existing-material tables and T4/T3 slot pools without guardian exclusives',()=>{
 const seen=new Set();for(const id of ids){assert.ok(NEW_MONSTER_DROPS[id]);assert.deepEqual(NEW_MONSTER_DROPS[id].items,[]);for(const threat of [1,2,3])for(let seed=0;seed<300;seed++){
  const ctx={stageId:'S21',huntTier:4,threat,elite:seed%2===0};const d=rollDrops(id,seed,ctx);assert.deepEqual(d,rollDrops(id,seed,ctx));assert.ok(Number.isSafeInteger(d.gold)&&d.gold>=0);
  for(const [k,n] of Object.entries(d.stacks)){assert.ok(ITEMS[k]);assert.ok(Number.isSafeInteger(n)&&n>0);assert.notEqual(k,'dragon_scale');}
  for(const item of d.items){const def=ITEMS[item.id];assert.ok(def);assert.equal(def.huntTier,['weapon','body'].includes(def.slot)?4:3);assert.ok(!def.dropOnly);seen.add(def.slot);}
 }}assert.deepEqual(seen,new Set(['weapon','head','body','hands','feet']));
 for(const id of stages)for(const threat of [1,2,3])for(let seed=0;seed<100;seed++){
  const s=rewardSave(id,threat),events=questEvents(id,seed,threat);let tracker=createTracker(seed);
  for(const event of events)tracker=trackRound(s,tracker,[event]).tracker;
  assert.ok(tracker.gearBudget===1||tracker.gearBudget===2);assert.ok(tracker.gearAwarded<=tracker.gearBudget);
  const repeat=trackRound(s,tracker,events).tracker;assert.ok(repeat.gearAwarded<=tracker.gearBudget);assert.equal(new Set(repeat.tempLoot.items.map(i=>i.uid)).size,repeat.tempLoot.items.length);
  const out=settleRound(s,{stageId:id,terminal:'clear',...tracker});assert.ok(out.receipt.lootKept.items.length<=tracker.gearBudget);assert.ok(validateSave(out.save));
 }
});

for(const id of stages)test(`U5 ${id} real T3 epic+4 Lv22 bot enters, kills, deposits loot, settles and reloads (3 seeds)`,()=>{
 for(const seed of [1,11,79]){
  const s=preset(id);s.cleared.S20=true;const w=createWorld({seed}),p=addPlayer(w,{pid:'a',mods:buildRoundMods(s)});let tracker=createTracker(seed);startStage(w,id);let kills=0,mageElite=false;
  for(let t=0;t<18000&&w.round.state==='running';t++){
   const events=step(w,{a:botInput(w,p)});kills+=events.filter(e=>e.type==='kill').length;
   if(events.some(e=>e.type==='spawn'&&e.monster==='skeleton_mage'&&e.elite))mageElite=true;
   const out=trackRound(s,tracker,events,usedConsumables(s,p));tracker=out.tracker;setLoad(w,'a',out.load.ratio);
  }
  assert.equal(w.round.state,'clear',`${id}/${seed} hp=${p.hp}`);assert.equal(kills,STAGES[id].spawns.length);if(id==='S23')assert.ok(mageElite);
  const out=settleRound(s,{stageId:id,terminal:p.terminal,...tracker,used:usedConsumables(s,p)});assert.ok(out.save.cleared[id]);assert.ok(out.receipt.goldGained>0);assert.ok(out.receipt.goldGained<=540,'existing normal gold budget');assert.ok(out.receipt.lootKept.items.length<=2);assert.ok(validateSave(out.save));assert.equal(stageXp(out.save,id),Math.round(out.receipt.stageXp*.25));
  const m=new Map(),store=new SaveStore({getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});store.save(out.save);assert.deepEqual(store.load(),out.save);
 }
});

test('U5 missing keys in old saves stay missing/locked, schema/items/stats unchanged; main counter remains /20',()=>{
 const s=fresh();for(const id of stages){delete s.cleared[id];delete s.stageThreat[id];}const before=structuredClone(s);const m=new Map(),store=new SaveStore({getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});store.save(s);assert.deepEqual(store.load(),before);assert.equal(store.load().version,SAVE_VERSION);
 for(const id of stages)assert.equal(mapUnlocked(store.load(),id),false);
 const h=Object.assign(Object.create(HubUI.prototype),{save:s,showInnPanel:(_t,html,_p,_f,opts)=>{h.html=html;h.opts=opts;}});h.showBoard();assert.match(h.html,/버려진 묘지/);assert.match(h.html,/data-stage="S21" class="contract lock" disabled/);
 s.cleared.S20=true;s.cleared.S21=true;h.showBoard();assert.match(h.opts.eyebrow,/1 \/ 20 완료 · 묘지 1 \/ 3/);assert.match(h.html,/data-stage="S22" class="contract depart"/);assert.match(h.html,/data-stage="S23" class="contract lock" disabled/);
});
