import test from 'node:test';
import assert from 'node:assert/strict';
import {Sim,neutralInput} from '../js/sim.js';
import {WTYPES} from '../js/data.js';
const save={weapon:'gs',w:{gs:1,db:1,bow:1},armor:1};
const sim=()=>new Sim({mon:'boar'},save);
const tick=(s,i={})=>{s.p.input={...neutralInput(),...i};s.updPlayer(1/60);};
test('A tap starts immediately; held A guards at 200ms, before contact',()=>{
 const s=sim();s.p.buffer.attack=1;tick(s,{attackHeld:true});assert.equal(s.p.state,'atk');assert.equal(s.p.t,0);
 for(let i=0;i<11;i++)tick(s,{attackHeld:true});assert.equal(s.p.state,'atk');tick(s,{attackHeld:true});assert.equal(s.p.state,'guard');assert.equal(s.p.hits,0);
 for(let i=0;i<7;i++)tick(s);assert.equal(s.p.state,'guard');tick(s);assert.equal(s.p.state,'idle');
 const t=sim();t.p.buffer.attack=1;tick(t,{attackHeld:true});for(let i=0;i<11;i++)tick(t,{attackHeld:true});tick(t);assert.equal(t.p.state,'atk');
});
test('guard angle, chip, cost, heavy knockback, stamina break and roll',()=>{
 for(const [angle,blocked]of [[0,true],[70,true],[70.1,false],[180,false]]){const s=sim();s.p.state='guard';s.p.yaw=0;const a=angle*Math.PI/180;s.hurt(20,s.p.x+Math.sin(a),s.p.z+Math.cos(a),true);assert.equal(100-s.p.hp,blocked?3:20);assert.equal(s.p.st,blocked?82:100);assert.equal(s.p.state,blocked?'guard':'down');}
 const s=sim();s.p.state='guard';for(let i=0;i<6;i++)s.hurt(20,s.p.x,s.p.z+1,true);assert.equal(s.p.state,'stun');assert.equal(s.p.st,0);assert.equal(s.p.hp,73);for(let i=0;i<75;i++)tick(s);assert.equal(s.p.state,'idle');
 const r=sim();r.p.state='guard';r.p.buffer.roll=1;tick(r,{attackHeld:true});assert.equal(r.p.state,'roll');
});
test('B tap release <=180ms; hold charges strictly after boundary',()=>{
 const s=sim();s.startHeavy(0,false);for(let i=0;i<9;i++)tick(s,{heavyHeld:true});assert.equal(s.p.state,'idle');tick(s);assert.equal(s.p.combo,3);assert.equal(s.p.state,'atk');
 const h=sim();h.startHeavy(0,false);for(let i=0;i<10;i++)tick(h,{heavyHeld:true});tick(h,{heavyHeld:true});assert.equal(h.p.state,'charge');
});
for(const [buttons,expected]of [[[0,0,1],[0,1,4]],[[0,1,0],[0,3,1]],[[0,0,0],[0,1,2]],[[1,1],[3,4]]])test('combo '+buttons.join(''),()=>{
 const s=sim(),nodes=[];for(const b of buttons){s.startCombo(b,0,false);nodes.push(s.p.combo);}assert.deepEqual(nodes,expected);
 const restored=sim().restore(s.snapshot());assert.equal(restored.p.combo,expected.at(-1));
});
test('legacy integer A snapshots and optional attackHeld remain compatible',()=>{
 const s=sim();s.startAtk(WTYPES.gs.light[1],0,1,0,false);const snap=s.snapshot();delete snap.players[0].input.attackHeld;const t=sim().restore(snap);t.startCombo(0,0,false);assert.equal(t.p.combo,2);assert.equal(!!t.p.input.attackHeld,false);
});
test('priority replaces body only, never legs; gs only',()=>{
 for(const w of ['gs','db'])for(const best of ['body','legs']){const s=sim();s.p.weapon=w;s.p.x=s.p.z=s.p.yaw=0;s.m.state='flinch';s.mParts=()=>[{n:best,x:0,z:1,r:1},{n:'tail',x:0,z:2,r:.8}];let part;s.hitMonster=n=>part=n;s.meleeHit(WTYPES.gs.light[0]);assert.equal(part,w==='gs'&&best==='body'?'tail':best);}
});
for(const [buttons,expected]of [[[0,0,1],[0,1,4]],[[0,1,0],[0,3,1]],[[0,0,0],[0,1,2]],[[1,1],[3,4]]])test('buffered real updater combo '+buttons.join(''),()=>{
 const s=sim(),nodes=[];
 for(const button of buttons){
  if(s.p.state==='atk')for(let i=0;i<100 && !(s.p.hits>0&&s.p.t>=s.p.cur.dur*.7);i++)tick(s);
  s.p.buffer[button?'heavy':'attack']=1;tick(s,{heavyHeld:!!button});if(button)tick(s);
  assert.equal(s.p.state,'atk');nodes.push(s.p.combo);
 }
 assert.deepEqual(nodes,expected);
});
test('exact 180ms tap boundary and 200ms guard boundary',()=>{
 for(const [duration,node] of [[.18,3],[.180001,-1]]){const s=sim();s.startHeavy(0,false);s.p.input=neutralInput();s.updPlayer(duration);assert.equal(s.p.combo,node);}
 const s=sim();s.p.buffer.attack=1;tick(s,{attackHeld:true});s.p.input={...neutralInput(),attackHeld:true};s.updPlayer(.199999);assert.equal(s.p.state,'atk');s.updPlayer(.000001);assert.equal(s.p.state,'guard');
});
test('early buffered B tap retains physical release duration; held B charges at link',()=>{
 for(const held of [false,true]){const s=sim();s.startAtk(WTYPES.gs.light[1],0,1,0,false);s.p.t=.34;
 s.step({p1:{heavy:true,heavyHeld:true}});s.step({p1:{heavyHeld:held}});
 for(let i=0;i<16&&s.p.combo===1&&s.p.state==='atk';i++)s.step({p1:{heavyHeld:held}});
 if(held)assert.equal(s.p.state,'charge');else {assert.equal(s.p.state,'atk');assert.equal(s.p.combo,4);}
 }
});
