import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,addPlayer,startStage,step,spawnMonster,emptyInput} from '../js/sim/world.js';
import {stepObjective} from '../js/sim/quest-objectives.js';
import {OBJECTIVE_QUESTS} from '../js/content/quest-expansion.js';
import {STAGES,MONSTERS} from '../js/content/combat.js';
import {BALANCE,monsterSizeProfile} from '../js/content/balance.js';
import {MAPS,REGIONS,mapUnlocked} from '../js/content/world-map.js';
import {biomeForStage} from '../js/content/biomes.js';
import {NEW_MONSTER_DROPS} from '../js/content/loot.js';
import {createSave,validateSave} from '../js/meta/save.js';
import {stageXp,deathLoss} from '../js/meta/progression.js';
import {createTracker,trackRound,settleRound} from '../js/meta/run.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {HubUI} from '../js/ui/hub.js';
const id='M_THRONE_GARGOYLE';
const fresh=()=>createSave({name:'QC1',weapon:'blade',answers:[0,0,0,0,0],createdAt:1});
function setup(count=1){const w=createWorld({seed:42});for(let i=0;i<count;i++)addPlayer(w,{pid:String(i),mods:{maxHp:10000,dmgMult:{blade:1000}}});startStage(w,id);step(w);return w;}
const target=w=>w.entities.find(e=>e.id===w.round.objective.targetId);
function defeat(w,m){const p=w.entities.find(e=>e.kind==='player'&&!e.terminal);p.x=m.x-45;p.y=m.y;let events=[];for(let i=0;i<40&&!m.dead;i++)events.push(...step(w,{[p.pid]:{...emptyInput(),autoAttack:true}}));assert.equal(m.dead,true);assert.ok(events.some(e=>e.type==='kill'&&e.id===m.id));return events;}
test('QC1 fixed three at0 slots, S20-only gate, throne map and explicit S19 anchors',()=>{
 assert.deepEqual(STAGES[id].spawns,OBJECTIVE_QUESTS.QC1.spawns);assert.deepEqual(STAGES[id].spawns.map(s=>[s.monster,s.at,s.fx,s.fy]),[['gargoyle',0,.74,.50],['goblin_slinger',0,.82,.25],['spirit',0,.82,.75]]);
 assert.equal(STAGES[id].goal,'objective');assert.equal(STAGES[id].maxConcurrent,3);assert.equal(STAGES[id].eliteChance,0);
 assert.deepEqual(MAPS[id].requires,['S20']);assert.deepEqual(MAPS.TD1.requires,['S20']);assert.ok(REGIONS.find(r=>r.id==='throne').maps.includes(id));
 assert.equal(mapUnlocked({cleared:{S20:true}},id),true);for(const cleared of [{S19:true},{TD1:true},{[id]:true}])assert.equal(mapUnlocked({cleared},id),false);
 assert.equal(biomeForStage(id),'fortress');assert.equal(BALANCE.stages[id].hp,BALANCE.stages.S19.hp);assert.equal(BALANCE.stages[id].damage,BALANCE.stages.S19.damage);assert.deepEqual(BALANCE.stages[id].rec,[20,'epic',3]);
 assert.deepEqual(monsterSizeProfile(id,false,false,.7),monsterSizeProfile('S19',false,false,.7));
});
test('gargoyle expands rune guardian body/poise/HP, retains speed and uses only ground kits and identical loot',()=>{
 const g=MONSTERS.gargoyle,r=MONSTERS.rune_guardian;assert.equal(g.hp,r.hp*1.5);assert.equal(g.r,r.r*1.2);assert.equal(g.poise,r.poise*1.2);assert.equal(g.speed,r.speed);assert.deepEqual(g.abilities,['guardian_crush','goblin_hop']);assert.equal(g.elite,undefined);assert.deepEqual(NEW_MONSTER_DROPS.gargoyle,NEW_MONSTER_DROPS.rune_guardian);
 const w=setup();assert.equal(w.entities.filter(e=>e.kind==='monster').length,3);assert.equal(target(w).eliteVariant,false);assert.equal(w.round.pending.length,0);
});
test('stable slot binds entity ID, killing another same-type gargoyle does not complete',()=>{
 const w=setup(),t=target(w);const other=spawnMonster(w,'gargoyle',450,200);defeat(w,other);assert.equal(w.round.objective.state,'waiting');assert.equal(w.round.objective.targetId,t.id);assert.equal(w.round.state,'running');
});
test('auxiliary kills alone do not complete; specified real kill clears with both auxiliaries alive and freezes',()=>{
 const w=setup();for(const m of w.entities.filter(e=>e.kind==='monster'&&e!==target(w)))defeat(w,m);assert.equal(w.round.state,'running');assert.equal(w.round.objective.state,'waiting');
 const w2=setup(),events=defeat(w2,target(w2));assert.equal(w2.round.state,'clear');assert.equal(w2.entities.filter(e=>e.kind==='monster'&&!e.dead).length,2);assert.equal(events.filter(e=>e.type==='objectiveComplete').length,1);assert.deepEqual(events.find(e=>e.type==='objectiveComplete').participants,['0']);
 step(w2);const frozen=JSON.stringify(w2);for(let i=0;i<30;i++)assert.deepEqual(step(w2,{'0':{...emptyInput(),autoAttack:true}}),[]);assert.equal(JSON.stringify(w2),frozen);
});
test('unbound target, arbitrary player/type kill and client target flags cannot complete',()=>{
 const w=setup(),o=w.round.objective;w.events=[{type:'kill',id:999,monster:'gargoyle'},{type:'kill',id:1,monster:'gargoyle'}];assert.equal(stepObjective(w,{'0':{targetKilled:true,targetId:o.targetId}}),false);o.targetId=null;assert.equal(stepObjective(w),false);
});
for(const terminal of ['death','return_scroll'])test(`QC1 ${terminal} companion stays terminal; alive nonterminal alone receives clear`,()=>{
 const w=setup(3);w.entities[0].terminal=terminal;w.entities[0].dead=terminal==='death';w.entities[2].hp=0;w.entities[2].dead=true;w.entities[2].terminal='death';const events=defeat(w,target(w));assert.equal(w.entities[0].terminal,terminal);assert.equal(w.entities[2].terminal,'death');assert.equal(w.entities[1].terminal,'clear');assert.deepEqual(events.find(e=>e.type==='objectiveComplete').participants,['1']);
});
test('same combat tick fatal poison excludes dying companion from target clear',()=>{
 const w=setup(2),p=w.entities[1];const t=target(w);w.entities[0].x=t.x-45;w.entities[0].y=t.y;
 t.spawnLeft=0;t.thinkLeft=9999;
 while(!(w.entities[0].act?.phase==='active'))step(w,{'0':{...emptyInput(),autoAttack:true}});
 p.hp=1;p.poison={left:2,next:1,interval:30,hit:{def:{damage:2},mult:1,periodic:true,srcId:999,srcKind:'monster',abilityId:'spider_poison',fromX:p.x,fromY:p.y}};
 const events=step(w,{'0':{...emptyInput(),autoAttack:true}});assert.equal(t.dead,true);assert.equal(p.terminal,'death');assert.equal(w.entities[0].terminal,'clear');assert.deepEqual(events.find(e=>e.type==='objectiveComplete').participants,['0']);
});
test('first XP2020 repeat0, S19 death policy, persistent receipt and existing personal sortie cap',()=>{
 const s=fresh();assert.equal(stageXp(s,id),2020);assert.equal(deathLoss({...s,xp:100},id),deathLoss({...s,xp:100},'S19'));
 const r=settleRound(s,{stageId:id,terminal:'clear'});assert.equal(r.receipt.stageXp,2020);assert.equal(stageXp(r.save,id),0);assert.equal(validateSave(r.save),true);assert.equal(stageXp({cleared:{M_MINE_CART:true}},'M_MINE_CART'),0);assert.equal(stageXp({cleared:{M_MARSH_MARKERS:true}},'M_MARSH_MARKERS'),0);
 for(let seed=1;seed<=100;seed++){const events=Array.from({length:30},(_,i)=>({type:'kill',id:i+10,monster:'gargoyle',stageId:id,elite:false,threat:1,xp:36}));const tr=trackRound(s,createTracker(seed),events).tracker;assert.ok(tr.gearBudget>=1&&tr.gearBudget<=2);const result=settleRound(s,{stageId:id,terminal:'clear',...tr});assert.ok(result.receipt.lootKept.items.length<=tr.gearBudget);}
});
test('snapshot contains deep-copy target slot, bound ID and complete state',()=>{
 const w=setup(),packet=encodeSnapshot(w),g=decodeSnapshot(packet,'0');assert.deepEqual(g.round.objective,w.round.objective);g.round.objective.targetId=999;assert.notEqual(w.round.objective.targetId,999);defeat(w,target(w));assert.equal(decodeSnapshot(encodeSnapshot(w),'0').round.objective.state,'complete');
});
test('normal low-level UI exposes QC1 once with S20 gate, no new TD1 dependency or /20 progress',()=>{
 const s=fresh(),h=Object.assign(Object.create(HubUI.prototype),{save:s,lootState:{},persist:()=>{},closeSheet:()=>{}});h.show=(html)=>{h.html=html};h.showInnPanel=(title,html,page,extra,options)=>{h.html=html;h.options=options};
 const oldMatchMedia=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:false});
 h.showBoard();assert.match(h.html,/data-stage="M_THRONE_GARGOYLE" class="contract lock" disabled/);s.cleared.S20=true;h.showBoard();assert.equal((h.html.match(/data-stage="M_THRONE_GARGOYLE"/g)||[]).length,1);assert.match(h.options.eyebrow,/1 \/ 20/);h.showSortie(id);assert.match(h.html,/가고일 처치: 0\/1/);assert.match(h.html,/추천 레벨 <b>20<\/b>/);assert.match(h.html,/data-action="coop"/);assert.equal(mapUnlocked(s,'TD1'),true);globalThis.matchMedia=oldMatchMedia;
});
test('all gargoyle pixels byte-match archive; frames uniquely renamed, complete eight-direction clips',()=>{
 const base=new URL('../assets/sprites/gargoyle/',import.meta.url),archive=new URL('../tools/art/legacy-gargoyle/',import.meta.url);const entry=JSON.parse(readFileSync(new URL('../assets/sprites/manifest.json',import.meta.url))).find(e=>e.id==='gargoyle');const frames=new Set(),animations={};let bytes=0;
 for(const sheet of entry.sheets){const file=readFileSync(new URL(sheet,base)),d=JSON.parse(file),original=JSON.parse(readFileSync(new URL(sheet,archive)));bytes+=file.length+readFileSync(new URL(d.meta.image,base)).length;assert.deepEqual(readFileSync(new URL(d.meta.image,base)),readFileSync(new URL(d.meta.image,archive)));for(const [name,frame] of Object.entries(d.frames)){assert.ok(name.startsWith('gc_'));assert.ok(!frames.has(name));frames.add(name);assert.deepEqual(frame,original.frames[name.slice(3)]);}Object.assign(animations,d.animations);}
 assert.equal(frames.size,424);assert.equal(bytes,entry.bytes);for(const clip of entry.animations)for(const direction of ['E','SE','S','SW','W','NW','N','NE']){const names=animations[`${clip}_${direction}`];assert.ok(names.length>1);for(const name of names)assert.ok(frames.has(name));}
});
