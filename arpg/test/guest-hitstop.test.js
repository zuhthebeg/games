import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaRenderer } from '../js/render/renderer.js';
import { FEEL } from '../js/render/feel.js';
import { createWorld, addPlayer, startStage, emptyInput, step } from '../js/sim/world.js';
import { CoopSession } from '../js/net/session.js';

function fixture() {
  const w=createWorld({seed:5}); addPlayer(w,{pid:'g',weapon:'blade',x:500,y:400}); startStage(w,'S2');
  w.entities=w.entities.filter(e=>e.kind==='player'); w.round.pending=[]; w.round.goal='timer'; w.round.timerTicks=1e6;
  return w;
}

for (const localTarget of [false, true]) test(`guest local hitstop bypass preserves hurt/flash and other bodies: target=` + localTarget, () => {
  const local = {id:1,kind:'player',predictedLocal:true,x:100,y:100,facing:0};
  const other = {id:2,kind:'monster',type:'goblin_grunt',x:120,y:100,facing:0};
  const views = new Map();
  const r = {reduced:false,trauma:0,ensure(e) {if (!views.has(e.id)) views.set(e.id,{stopLeft:0,anim:{}}); return views.get(e.id);}};
  ArenaRenderer.prototype.impact.call(r, localTarget ? local : other, localTarget ? other : local, FEEL.impact.normal);
  assert.equal(views.get(1).stopLeft,0);
  assert.equal(views.get(2).stopLeft,FEEL.impact.normal.stop);
  const target = views.get(localTarget ? 1 : 2);
  assert.equal(target.anim.hurt,FEEL.hurtLife); assert.ok(target.flashLeft>0);
  delete local.predictedLocal;
  ArenaRenderer.prototype.impact.call(r,local,other,FEEL.impact.normal);
  assert.equal(views.get(1).stopLeft,FEEL.impact.normal.stop,'solo/host unchanged');
});

test('session marks only guest predicted pawn for presentation',()=>{
  const w=fixture();
  const opts={uid:'g',host:'h',players:['g','h'],config:{stageId:'S2'},sendRt(){},sendAction(){}};
  const guest=new CoopSession(opts); guest.prediction.enabled=true;
  const host=new CoopSession({...opts,host:'g'}); host.prediction.enabled=true;
  assert.equal(guest.decorate(w).entities[0].predictedLocal,true);
  assert.equal(host.decorate(w).entities[0].predictedLocal,undefined);
  assert.equal(w.entities[0].predictedLocal,undefined);
});
