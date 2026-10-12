import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ABILITIES, MONSTERS, STAGES} from '../js/content/combat.js';
import {MAPS, mapUnlocked, availableStages} from '../js/content/world-map.js';
import {createWorld,addPlayer,spawnMonster,startStage,step,emptyInput,getTelegraphs} from '../js/sim/world.js';
import {shapeHitsCircle,ticks} from '../js/sim/core.js';
import {encodeSnapshot,decodeSnapshot} from '../js/net/protocol.js';
import {createSave,validateSave} from '../js/meta/save.js';
import {selectThreat,settleRound,trackRound,createTracker} from '../js/meta/run.js';
import {biomeForStage} from '../js/content/biomes.js';
import {createBiomeLayout} from '../js/render/biome-layout.js';
const base=JSON.parse(readFileSync(new URL('./fixtures/throne-baseline.json',import.meta.url)));
const ids=['dragon_flame','dragon_stomp','dragon_tail'];
const fresh=()=>createSave({name:'용 시험',answers:[0,0,0,0,0],createdAt:1});
const digest=w=>createHash('sha256').update(JSON.stringify(w)).digest('hex');
test('official TD1 is gated after S20, leaves original stages and map dependencies byte-identical',()=>{
 assert.equal(STAGES.TD1?.name,'왕좌의 수호룡');assert.equal(STAGES.TD1.goal,'killAll');
 assert.equal(STAGES.TD1.spawns.length,1);assert.equal(STAGES.TD1.spawns[0].monster,'throne_dragon');
 assert.equal(STAGES.TD1.testChallenge,undefined);assert.equal(mapUnlocked(fresh(),'TD1'),false);assert.equal(availableStages(fresh()).includes('TD1'),false);const late=fresh();late.cleared.S20=true;assert.ok(mapUnlocked(late,'TD1'));
 for(const [id,stage] of Object.entries(base.stages))assert.deepEqual(STAGES[id],stage,id);
 for(const [id,map] of Object.entries(base.maps))assert.deepEqual(MAPS[id],map,id);
 assert.equal(biomeForStage('TD1'),'throne_forecourt');
 const w=createWorld();addPlayer(w,{pid:'a'});startStage(w,'TD1');assert.deepEqual(w.arena,{w:1680,h:1000});
 const layout=createBiomeLayout('TD1',w.arena.w,w.arena.h);assert.ok(layout.props.some(p=>p.kind==='broken_column'));
 assert.ok(layout.props.filter(p=>p.kind==='broken_column').every(p=>Math.min(p.x,w.arena.w-p.x,p.y,w.arena.h-p.y)<116));
});
test('dragon forward cone, offset front stomp, rear sector have exact safe sides and matching painter angle',()=>{
 for(const id of ids)assert.ok(ABILITIES[id],id);
 const hits=(id,x,y)=>shapeHitsCircle(ABILITIES[id].shape,0,0,0,x,y,1);
 assert.equal(hits(ids[0],260,0),true);assert.equal(hits(ids[0],-100,0),false);assert.equal(hits(ids[0],100,220),false);
 assert.equal(hits(ids[1],130,0),true);assert.equal(hits(ids[1],-130,0),false);assert.equal(hits(ids[1],130,170),false);
 assert.equal(hits(ids[2],-160,0),true);assert.equal(hits(ids[2],160,0),false);assert.equal(hits(ids[2],0,220),false);
 assert.equal(ABILITIES.dragon_tail.shape.facingOffsetDeg,180);
});
function encounter(id){
 const w=createWorld({seed:11,arena:{w:1680,h:1000}});const p=addPlayer(w,{pid:'a',x:650,y:500,mods:{maxHp:1000}});
 const m=spawnMonster(w,'throne_dragon',840,500);m.spawnLeft=0;m.thinkLeft=0;m.facing=Math.PI;
 // Disable other choices, not the act machine. Start the chosen ability through real monster AI.
 for(const other of ids)if(other!==id)m.cds[other]=9999;
 step(w,{a:emptyInput()});assert.equal(m.act?.id,id);return{w,p,m};
}
for(const id of ids){
 test(`${id}: windup/lock no damage, actual single hit, recovery and independent cooldown, frozen telegraph`,()=>{
  const {w,p,m}=encounter(id);const def=ABILITIES[id];
  // Rear attack turns its body away, then sweeps behind it; front abilities face the target.
  const tg=getTelegraphs(w)[0];assert.deepEqual(tg.shape,def.shape);assert.equal(tg.facing,m.act.facing);
  const act=m.act;let hits=0;let active=false;let lockFacing;
  while(m.act===act){const phase=m.act.phase;if(phase==='lock')lockFacing??=m.act.facing;
   const hp=p.hp;const events=step(w,{a:emptyInput()});hits+=events.filter(e=>e.type==='hit'&&e.dst===p.id).length;
   if(phase==='windup'||phase==='lock')assert.equal(p.hp,hp,phase);
   if(phase==='active')active=true;
   if(lockFacing!==undefined&&m.act===act)assert.equal(m.act.facing,lockFacing);
  }
  assert.equal(active,true);assert.equal(hits,1);assert.ok(p.hp<p.maxHp);assert.equal(m.cds[id],ticks(def.cooldownMs));
  assert.ok(def.recoveryMs>=1500);assert.ok(def.windupMs>=900);assert.ok(def.lockMs>=300);
  assert.ok(ids.filter(x=>x!==id).every(x=>m.cds[x]>0));
 });
 test(`${id}: walking out during cue and real dodge iframe avoid damage`,()=>{
  for(const dodge of [false,true]){const {w,p,m}=encounter(id);while(m.act.phase!=='active')step(w,{a:emptyInput()});
   if(!dodge){p.x=840;p.y=820;} // Geometric safe side after the locked cue, no attack cancellation.
   const events=step(w,{a:{...emptyInput(),...(dodge?{dodgeEdge:true,mx:0,my:.01}:{})}});
   assert.equal(p.hp,p.maxHp);
   if(dodge)assert.ok(events.some(e=>e.type==='perfectDodge'&&e.ability===id));
  }
 });
 test(`${id}: host-authoritative snapshot carries same telegraph, phase, HP and cooldown; guest never owns damage`,()=>{
  const {w,p,m}=encounter(id);while(m.act.phase!=='active')step(w,{a:emptyInput()});step(w,{a:emptyInput()});
  w.round={stageId:'TD1',state:'running',pending:[],t:w.tick,goal:'killAll',threat:1};const packet=encodeSnapshot(w);const before=JSON.stringify(w);const guest=decodeSnapshot(packet,'a');
  assert.equal(guest.entities.find(e=>e.id===p.id).hp,p.hp);assert.deepEqual(guest.telegraphs,getTelegraphs(w));
  assert.equal(guest.entities.find(e=>e.id===m.id).act.def,ABILITIES[id]);assert.equal(JSON.stringify(w),before);
 });
}
test('real attacks cycle without overlap; normal kill/settlement uses bounded existing rewards and no progression unlock',()=>{
 const {w,p,m}=encounter(ids[0]);for(const id of ids)m.cds[id]=0;const seen=new Set();
 for(let t=0;t<1100;t++){p.x=650;p.y=500;p.kx=p.ky=0;step(w,{a:emptyInput()});if(m.act)seen.add(m.act.id);}
 assert.deepEqual([...seen].sort(),ids.slice().sort());
 const save=fresh();assert.ok(validateSave(selectThreat(save,'TD1',1)));
 const reward=trackRound(save,createTracker(11),[{type:'kill',monster:'throne_dragon',xp:MONSTERS.throne_dragon.xp,stageId:'TD1',threat:1,x:840,y:500}]);
 assert.ok(reward.tracker.tempLoot.items.length<=2);assert.ok(reward.tracker.tempLoot.gold<=100);
 const out=settleRound(save,{stageId:'TD1',terminal:'clear',depositedXp:reward.tracker.depositedXp,tempLoot:reward.tracker.tempLoot});
 assert.ok(validateSave(out.save));assert.equal(out.save.cleared.TD1,true);assert.equal(mapUnlocked(out.save,'S20'),false);
 assert.equal(out.receipt.stageXp,2020); // Single-enemy late XP anchor S19, never unlocks S20.
});
for(const id of Object.keys(base.traces))test(`${id} host trace unchanged from origin/main79d87a4 (3 seeds ×1800ticks)`,()=>{
 for(const [seed,expected] of Object.entries(base.traces[id])){const w=createWorld({seed:Number(seed)});addPlayer(w,{pid:'a',weapon:'bow',mods:{maxHp:10000}});addPlayer(w,{pid:'b',weapon:'focus',mods:{maxHp:10000}});startStage(w,id);const h=createHash('sha256');
  for(let t=0;t<1800;t++){step(w,{a:{...emptyInput(),autoAttack:true,mx:t%120<60?.2:-.2},b:emptyInput()});h.update(digest(w));}
  assert.equal(h.digest('hex'),expected,`${id}/${seed}`);
 }
});
