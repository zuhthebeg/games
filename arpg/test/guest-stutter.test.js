import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaRenderer } from '../js/render/renderer.js';
import { FEEL } from '../js/render/feel.js';
import { createWorld, addPlayer, startStage, emptyInput, step } from '../js/sim/world.js';
import * as prediction from '../js/net/player-prediction.js';
import { CoopSession } from '../js/net/session.js';
import { LocalPrediction } from '../js/net/prediction.js';
import { spawnMonster } from '../js/sim/world.js';
import { InputQueue as LegacyInputQueue } from './fixtures/legacy-auto-input.js';
import { InputSender, InputQueue, InputLatch } from '../js/net/protocol.js';

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

function fixture() {
  const w=createWorld({seed:5}); addPlayer(w,{pid:'g',weapon:'blade',x:500,y:400}); startStage(w,'S2');
  w.entities=w.entities.filter(e=>e.kind==='player'); w.round.pending=[]; w.round.goal='timer'; w.round.timerTicks=1e6;
  return w;
}
test('guest auto start is a one-tick autoStart command and prediction equals host every tick despite stale range',()=>{
  assert.equal(typeof prediction.guestTickInput,'function');
  const w=fixture(), p=w.entities[0]; let starts=0;
  const tx=new InputSender();
  for(let t=0;t<240;t++) {
    const other={id:999,kind:'monster',team:'enemy',x:p.x+30,y:p.y,r:10,hp:100};
    const ctx={arena:w.arena,others:[other],tick:w.tick,enabled:true};
    const before=structuredClone(p), bytes=JSON.stringify(p), raw={...emptyInput(),mx:t%2 ? .5 : -.5,autoAttack:true};
    const cmd=prediction.guestTickInput(before,raw,ctx);
    assert.equal(cmd.autoAttack,true); assert.equal(cmd.attack,false); if(cmd.autoStart) starts++;
    const packet=tx.packet(cmd), wire={...cmd,mx:packet.v[0],my:packet.v[1],aimX:packet.v[2],aimY:packet.v[3]};
    const predicted=prediction.predictPlayerTick(before,wire,{...ctx,others:[]});
    step(w,{g:wire});
    assert.equal(predicted.x,p.x); assert.equal(predicted.y,p.y);
    for(const k of ['id','phase','left','elapsed']) assert.equal(predicted.act?.[k],p.act?.[k],k+' tick '+t);
    assert.deepEqual(predicted.cds,p.cds);
    assert.equal(JSON.stringify(before),bytes,'decision and prediction leave input state immutable');
    assert.equal(raw.autoAttack,true);
  }
  assert.ok(starts>=3); assert.ok(starts<40,'not a held attack');
});
test('guest command keeps manual input; no target or invisibility never creates auto attack',()=>{
  assert.equal(typeof prediction.guestTickInput,'function');
  const w=fixture(), p=w.entities[0];
  for(const raw of [{...emptyInput(),attack:true,autoAttack:true,aimX:1},{...emptyInput(),autoAttack:true}]) {
    const cmd=prediction.guestTickInput(p,raw,{arena:w.arena,others:[],tick:w.tick,enabled:true});
    assert.equal(cmd.attack,raw.attack);assert.equal(cmd.autoAttack,raw.autoAttack); assert.equal(cmd.autoStart,false);
  }
  p.invisibleUntil=100;
  const cmd=prediction.guestTickInput(p,{...emptyInput(),autoAttack:true},{arena:w.arena,others:[{team:'enemy',x:p.x+10,y:p.y,r:10}],tick:0,enabled:true});
  assert.equal(cmd.attack,false);
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

test('dropped auto-start pulse is recovered in its own prev command, never borrowed by a neighbour',()=>{
  const tx=new InputSender(), q=new InputQueue();
  q.receive(tx.packet({...emptyInput(),attack:false}),0);
  tx.packet({...emptyInput(),attack:true,aimX:1}); // lost start tick
  q.receive(tx.packet({...emptyInput(),attack:false}),1);
  const commands=[q.consume(2),q.consume(3),q.consume(4)];
  assert.deepEqual(commands.map(i=>i.attack),[false,true,false]);
});

test('without live prediction the guest leaves auto-attack to the host', () => {
  const input = { ...emptyInput(), autoAttack: true };
  assert.equal(prediction.guestTickInput(null, input, { enabled: true }), input);
  assert.equal(prediction.guestTickInput({ x: 0, y: 0 }, input, { enabled: false }), input);
  assert.equal(prediction.guestTickInput({ x: 0, y: 0 }, input, { enabled: true, roundEnded: true }), input);
});

function startCommand(p, w) {
  return prediction.guestTickInput(p,{...emptyInput(),autoAttack:true},{enabled:true,tick:w.tick,arena:w.arena,others:[{id:999,kind:'monster',team:'enemy',x:p.x+30,y:p.y,r:10,hp:100}]});
}
test('autoStart survives five-command backlog skip exactly once without changing movement skip',()=>{
  const w=fixture(),tx=new InputSender(),q=new InputQueue(),cmd=startCommand(w.entities[0],w);
  for(let i=0;i<5;i++)q.receive(tx.packet({...cmd,autoStart:i===0,mx:1}),0);
  const values=Array.from({length:8},(_,i)=>q.consume(34+i*34));
  assert.equal(values.filter(v=>v.autoStart).length,1);
  assert.equal(values.some(v=>v.attack),false); assert.equal(q.stats.skipped,1);
  assert.equal(values.reduce((sum,v)=>sum+v.mx,0),4);
});
test('one autoStart cannot become held attack during starvation, even with live autoAttack fallback',()=>{
  const w=fixture(),p=w.entities[0],q=new InputQueue(),tx=new InputSender();
  q.receive(tx.packet(startCommand(p,w)),0);const starts=[];
  for(let i=1;i<30;i++){const before=p.act;step(w,{g:q.consume(i*1000/30)});if(p.act&&!before)starts.push(i);}
  assert.deepEqual(starts,[1]);
});
test('new guest retains old host range fallback when a start packet is lost',()=>{
  const w=fixture(),p=w.entities[0],tx=new InputSender(),cmd=startCommand(p,w);
  assert.equal(cmd.autoAttack,true); assert.equal(cmd.attack,false); assert.equal(cmd.autoStart,true);
  tx.packet({...cmd,autoStart:false});tx.packet(cmd);
  const packet=tx.packet({...cmd,autoStart:false});const q=new LegacyInputQueue();q.receive(packet,0);
  const input=q.consume(34);assert.equal(input.autoAttack,true);
  const monster=spawnMonster(w,'goblin_grunt',p.x+30,p.y);monster.spawnLeft=0;monster.staggerLeft=99999;
  step(w,{g:input});assert.ok(p.act,'old host can still start from its own range decision');
});

for(const Receiver of [InputQueue,InputLatch]) test(Receiver.name+' autoStart cumulative recovery beyond prev, duplicate rejection and discard',()=>{
  const tx=new InputSender(),q=new Receiver(),raw={...emptyInput(),autoAttack:true,autoStart:false};
  tx.packet(raw); const lost=tx.packet({...raw,autoStart:true});
  for(let i=0;i<5;i++)tx.packet(raw);
  const packet=tx.packet(raw);q.receive(packet,0);
  assert.equal(q.receive(packet,0),false);assert.equal(q.receive(lost,0),false);
  const values=Array.from({length:12},(_,i)=>q.consume(34+i*34));
  assert.equal(values.filter(v=>v.autoStart).length,1);assert.equal(values.some(v=>v.attack),false);
  const next=tx.packet({...raw,autoStart:true});q.discard(next,500);
  q.receive(tx.packet(raw),501);
  assert.equal(q.consume(540).autoStart,false,'discard cannot resurrect a cumulative edge');
});
for(const weapon of ['blade','bow','focus']) test('full LocalPrediction.advance autoStart equals host tick order: '+weapon,()=>{
  const w=fixture(),p=w.entities[0];p.weapon=weapon;
  const lp=new LocalPrediction('g');Object.assign(lp,{enabled:true,arena:w.arena,tick:0,state:structuredClone(p)});
  const tx=new InputSender();let starts=0;
  for(let t=0;t<600;t++){
    lp.others=[{id:999,kind:'monster',team:'enemy',x:lp.state.x+30,y:lp.state.y,r:10,hp:100}];
    const raw={...emptyInput(),autoAttack:true,mx:t%2?.204:-.204,my:.003,dodgeEdge:t%73===0};
    let expected=false;prediction.predictPlayerTick(lp.state,raw,{...lp,onAutoAttack(){expected=true;}});
    const cmd=prediction.guestTickInput(lp.state,raw,lp);assert.equal(cmd.autoStart,expected);if(cmd.autoStart)starts++;
    const packet=tx.packet(cmd);lp.advance(packet,cmd,1000/30);
    step(w,{g:{...cmd,mx:packet.v[0],my:packet.v[1],aimX:packet.v[2],aimY:packet.v[3]}});
    for(const k of ['id','phase','left','elapsed'])assert.equal(lp.state.act?.[k],p.act?.[k],k+' tick '+t);
    assert.equal(lp.state.x,p.x);assert.equal(lp.state.y,p.y);assert.deepEqual(lp.state.cds,p.cds);
    lp.pending=[];
  }
  assert.ok(starts>20);
});
test('legacy guest keeps host range auto attack and manual attack remains held',()=>{
  const w=fixture(),p=w.entities[0],q=new InputQueue(),tx=new InputSender();
  const m=spawnMonster(w,'goblin_grunt',p.x+30,p.y);m.spawnLeft=0;m.staggerLeft=99999;
  q.receive(tx.packet({...emptyInput(),autoAttack:true}),0);
  const input=q.consume(34);assert.equal(input.autoStart,undefined);step(w,{g:input});assert.ok(p.act);
  q.receive(tx.packet({...emptyInput(),attack:true}),40);q.consume(80);assert.equal(q.consume(110).attack,true);
});

test('explicit autoStart follows manual basic gate including stale host invisibility',()=>{
  const w=fixture(),p=w.entities[0];p.invisibleUntil=100;
  const command={...emptyInput(),autoAttack:true,autoStart:true,aimX:1};
  const predicted=prediction.predictPlayerTick(p,command,{arena:w.arena,others:[],tick:w.tick});
  step(w,{g:command});assert.ok(p.act);assert.equal(p.invisibleUntil,undefined);
  assert.equal(predicted.invisibleUntil,undefined);assert.equal(predicted.act?.id,p.act.id);
});

test('autoStart false forbids a second host range decision; prev recovery stays on its command',()=>{
  const tx=new InputSender(),q=new InputQueue(),raw={...emptyInput(),autoAttack:true,autoStart:false};
  q.receive(tx.packet(raw),0);tx.packet({...raw,autoStart:true,aimX:1});q.receive(tx.packet(raw),1);
  const values=[q.consume(2),q.consume(3),q.consume(4)];
  assert.deepEqual(values.map(v=>v.autoStart),[false,true,false]);
  const w=fixture(),p=w.entities[0],m=spawnMonster(w,'goblin_grunt',p.x+30,p.y);m.spawnLeft=0;m.staggerLeft=99999;
  step(w,{g:values[0]});assert.equal(p.act,null);
  step(w,{g:values[1]});assert.ok(p.act);
});
