import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,addPlayer,spawnMonster,startStage,step} from '../js/sim/world.js';
import {STAGES} from '../js/content/combat.js';
import {ticks} from '../js/sim/core.js';
const living=w=>w.entities.filter(e=>e.kind==='monster'&&!e.dead&&!e.terminal);
function setup(stage='S2',right=false){const w=createWorld({seed:11});addPlayer(w,{pid:'p',mods:{maxHp:99999}});startStage(w,stage,{playerSide:right?'right':'left'});step(w);return w;}
function remove(w){for(const m of living(w))m.dead=true;}
test('S2 empty: next timestamp GROUP now, same seeded normal spawns except time',()=>{
 const w=setup();const all=structuredClone(w.round.pending);const next=Math.min(...all.map(s=>s.atTicks));const before=all.filter(s=>s.atTicks===next);const rng=w.rng;remove(w);
 const t=w.round.t,ev=step(w);assert.equal(w.round.t,t+1);assert.equal(w.tick,t+1);assert.equal(ev.filter(e=>e.type==='spawn').length,before.length);assert.deepEqual(w.round.pending,all.filter(s=>s.atTicks!==next));
 const a=living(w);assert.deepEqual(a.map(m=>[m.type,m.x,m.y]),before.map(s=>[s.monster,s.fx*w.arena.w,s.fy*w.arena.h]));assert.ok(a.every(m=>m.spawnLeft===ticks(700)));
 const scheduled=setup();scheduled.rng=rng;remove(scheduled);scheduled.round.t=before[0].atTicks-1;step(scheduled);
 assert.deepEqual(a,living(scheduled));assert.equal(w.rng,scheduled.rng);assert.equal(w.round.state,'running');
});
test('living, active boss, and birth grace block acceleration; corpses/allies do not',()=>{
 for(const stage of ['S2','S4']){const w=setup(stage);const before=structuredClone(w.round.pending);step(w);assert.deepEqual(w.round.pending,before);assert.equal(living(w).length,1);}
 const w=setup();remove(w);addPlayer(w,{pid:'ally'});step(w);assert.equal(living(w).length,3);
});
test('only earliest group retimed, later times untouched; maxConcurrent/zero-offset/backlog finite',()=>{
 const w=setup();remove(w);w.round.maxConcurrent=2;
 const s=w.round.pending[0];w.round.pending=[{...s,atTicks:100,slot:0},{...s,atTicks:100,slot:1},{...s,atTicks:100,slot:2},{...s,atTicks:500,slot:3}];
 step(w);assert.equal(living(w).length,2);assert.deepEqual(w.round.pending.map(s=>[s.slot,s.atTicks]),[[2,2],[3,500]]);
 step(w);assert.equal(living(w).length,2);remove(w);step(w);assert.equal(living(w).length,1);assert.equal(w.round.pending[0].atTicks,500);
 remove(w);step(w);assert.equal(living(w).length,1);assert.equal(w.round.pending.length,0);remove(w);step(w);assert.equal(w.round.state,'clear');
});
test('right side spawn geometry preserved exactly',()=>{
 const w=setup('S2',true);remove(w);const next=Math.min(...w.round.pending.map(s=>s.atTicks));const expected=w.round.pending.filter(s=>s.atTicks===next).map(s=>[s.monster,s.fx*w.arena.w,s.fy*w.arena.h]);step(w);assert.deepEqual(living(w).map(m=>[m.type,m.x,m.y]),expected);assert.ok(living(w).every(m=>m.facing===0));
});
test('no pending clears killAll, timer S1 keeps real clock and no fake spawn at completion',()=>{
 const w=setup();w.round.pending=[];remove(w);step(w);assert.equal(w.round.state,'clear');
 const timer=setup('S1');remove(timer);step(timer);assert.equal(timer.round.t,2);assert.equal(timer.round.state,'running');assert.equal(living(timer).length,0);
 timer.round.pending=[{monster:'goblin_grunt',atTicks:timer.round.timerTicks,fx:.8,fy:.5}];timer.round.t=timer.round.timerTicks-1;
 const ev=step(timer);assert.equal(timer.round.state,'clear');assert.equal(ev.some(e=>e.type==='spawn'),false);
});
test('quest future target slot survives group retime; already completed objective does not spawn',()=>{
 const id=Object.keys(STAGES).find(id=>STAGES[id].objective?.kind==='kill-target');assert.ok(id);
 const w=setup(id);remove(w);const o=w.round.objective;o.targetId=null;
 const s=w.round.pending.find(s=>s.slot===o.targetSlot)||{monster:'goblin_grunt',fx:.8,fy:.5,slot:o.targetSlot};w.round.pending=[{...s,atTicks:99999}];
 step(w);assert.equal(o.targetId,living(w)[0]?.id);assert.notEqual(o.targetId,null);
 const completed=setup(id);remove(completed);completed.round.objective.state='complete';const ev=step(completed);assert.equal(ev.some(e=>e.type==='spawn'),false);assert.equal(completed.round.state,'clear');
});
test('active boss waits, allied/terminal monsters do not occupy hostile alive count',()=>{
 const boss=setup('S4');const m=living(boss)[0];m.spawnLeft=0;m.thinkLeft=9999;const before=structuredClone(boss.round.pending);step(boss);assert.deepEqual(boss.round.pending,before);
 for(const state of ['ally','terminal']){const w=setup();const m=living(w)[0];if(state==='ally')m.team=w.entities[0].team;else m.terminal='death';const ev=step(w);assert.equal(ev.filter(e=>e.type==='spawn').length,3,state);}
});
test('unsorted future groups preserve array spawn order and retime only earliest; zero offsets obey cap',()=>{
 const w=setup();remove(w);const s=w.round.pending[0];w.round.pending=[{...s,atTicks:600,slot:'later'},{...s,atTicks:100,slot:'first'},{...s,atTicks:100,slot:'second'}];step(w);assert.deepEqual(w.round.pending.map(s=>[s.slot,s.atTicks]),[['later',600]]);assert.equal(living(w).length,2);
 const z=setup();remove(z);z.round.maxConcurrent=1;z.round.pending=[{...s,atTicks:0},{...s,atTicks:0},{...s,atTicks:0}];step(z);assert.equal(living(z).length,1);assert.equal(z.round.pending.length,2);step(z);assert.equal(z.round.pending.length,2);
});
