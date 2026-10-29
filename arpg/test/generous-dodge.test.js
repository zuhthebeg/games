import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, spawnMonster, step, emptyInput } from '../js/sim/world.js';
import { enableGuestDodgeLag } from '../js/sim/dodge-lag.js';
import { predictPlayerTick } from '../js/net/player-prediction.js';
import { encodeSnapshot, decodeSnapshot } from '../js/net/protocol.js';
import { CoopSession } from '../js/net/session.js';
const input = o => ({...emptyInput(), ...o});
function fixture(multi=true, guest=false) {
 const w=createWorld({multiplayerDodge:multi}), p=addPlayer(w,{pid:'p',x:400,y:400});
 const m=spawnMonster(w,'goblin_grunt',900,400);m.spawnLeft=0;m.staggerLeft=9999;
 if(guest)enableGuestDodgeLag(w,'p'); return {w,p,m};
}
function shot({w,p,m}, extra={}) {w.projectiles.push({id:w.nextId++,ownerId:m.id,ownerKind:'monster',ownerType:m.type,team:m.team,abilityId:'sling_stone',x:p.x,y:p.y,vx:0,vy:0,r:8,travelled:0,range:500,pierce:0,hit:[],dmgMult:1,poiseMult:1,...extra});}
for(const guest of [false,true]) for(const contact of [6,9,11,12]) test(`multi ${guest?'guest':'host'} contact tick ${contact}: full finite active perfect`,()=>{
 const f=fixture(true,guest);step(f.w,{p:input({dodgeEdge:true,mx:1})});
 for(let t=1;t<contact;t++)step(f.w);shot(f);const ev=step(f.w);
 assert.equal(ev.filter(e=>e.type==='perfectDodge').length,contact<12?1:0);
 assert.equal(f.p.hp===f.p.maxHp,contact<12);
});
for(const ms of [0,80,160,240]) test(`synthetic delayed app input ${ms}ms near late window contact`,()=>{
 const f=fixture(true,true);const age=Math.round(ms/(1000/30));
 // The user saw tick 0; the host has already simulated this many ticks before delivery.
 if(age){for(let t=0;t<age-1;t++)step(f.w);shot(f);step(f.w);}
 const ev=step(f.w,{p:input({dodgeEdge:true,mx:1,viewTick:0})});
 assert.equal(f.p.dodge.iframeLeft,12-age);assert.equal(f.p.hp,f.p.maxHp);
 if(age)assert.equal(ev.filter(e=>e.type==='perfectDodge').length,1);
 const contact=11;while(f.w.tick<contact)step(f.w);shot(f);const tail=step(f.w);
 assert.equal(tail.filter(e=>e.type==='perfectDodge').length,age?0:1,'exactly once');
 assert.equal(f.p.hp,f.p.maxHp);
});
test('300ms bound, stale/future timestamp and host never invent packet rewind',()=>{
 for(const [guest,viewTick,age,refund] of [[true,0,9,true],[true,0,10,false],[true,99,8,false],[false,0,8,false]]){
 const f=fixture(true,guest);for(let t=0;t<age-1;t++)step(f.w);shot(f);step(f.w);const hp=f.p.hp;
 const ev=step(f.w,{p:input({dodgeEdge:true,mx:1,viewTick})});assert.equal(ev.some(e=>e.type==='dodgeRewind'),refund);assert.equal(f.p.hp,refund?f.p.maxHp:hp);
 }
});
test('solo retains exact 7 tick iframe and 5 tick perfect window',()=>{
 const f=fixture(false);step(f.w,{p:input({dodgeEdge:true,mx:1})});assert.equal(f.p.dodge.iframeLeft,7);
 for(let i=1;i<6;i++)step(f.w);shot(f);const ev=step(f.w);assert.equal(f.p.hp,f.p.maxHp);assert.equal(ev.some(e=>e.type==='perfectDodge'),false);
});
test('real CoopSession opts in both host and guest, prediction parity survives snapshot codec',()=>{
 const profile={combatVersion:3,weapon:'blade',mods:{},level:1};const config={stageId:'S2',threat:1};const data={profiles:{h:profile,g:profile},config,seed:4};
 const session=new CoopSession({uid:'h',host:'h',players:['h','g'],profile,config});session.begin(data);
 for(const pid of ['h','g']){
 const w=session.world;w.round.pending=[];w.round.goal="timer";w.round.timerTicks=1e6;w.entities=w.entities.filter(e=>e.kind==='player');
 const p=w.entities.find(e=>e.pid===pid);p.x=pid==='h'?300:1000;
 for(let t=0;t<80;t++){
 const inp=input({dodgeEdge:t%36===0,mx:.7,my:.3});
 const view=decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w,{h:0,g:0}))),pid);
 const before=view.entities.find(e=>e.pid===pid);
 const pred=predictPlayerTick(before,inp,{arena:w.arena,tick:w.tick,multiplayerDodge:true});step(w,{[pid]:inp});
 assert.equal(pred.dodge.iframeLeft,p.dodge.iframeLeft);assert.equal(pred.dodge.cdLeft,p.dodge.cdLeft);assert.equal(pred.dodge.dashLeft,p.dodge.dashLeft);
 assert.ok(Math.abs(pred.x-p.x)<.006);assert.ok(Math.abs(pred.y-p.y)<.006);
 if(t===0)assert.equal(p.dodge.iframeLeft,12);
 }
 }
});
test('multi late contact reward pays once and counter occurs once; cooldown not invincible chain',()=>{
 const f=fixture(true,true);f.p.weaponForm='blunt';f.m.x=610;shot(f);step(f.w);for(let t=0;t<7;t++)step(f.w);
 const ev=step(f.w,{p:input({dodgeEdge:true,mx:1,viewTick:0})});
 assert.equal(ev.filter(e=>e.type==='perfectDodge').length,1);const rng=f.w.rng;
 let paid=0,counters=0,dodges=0;
 for(let t=0;t<25;t++){const es=step(f.w);paid+=es.filter(e=>e.type==='perfectDodge').length;counters+=es.filter(e=>e.type==='counter').length;dodges+=es.filter(e=>e.type==='dodge').length;}
 assert.equal(paid,0);assert.equal(counters,1);assert.equal(dodges,0);assert.equal(f.w.rng,rng);
 shot(f);const late=step(f.w,{p:input({dodgeEdge:true,mx:1,viewTick:0})});assert.equal(late.some(e=>e.type==='dodge'),false);assert.ok(f.p.hp<f.p.maxHp,'damage returns before cooldown');
});
test('multi aged input parity with attack cancellation/buffer, iframe bonus capped, no wire additions',()=>{
 const f=fixture(true,true);f.p.iframeBonusMs=300;const config={stageId:'S2',state:'running',t:0,goal:'timer',timerTicks:1e6,pending:[],maxConcurrent:3,threat:1};f.w.round=config;f.w.entities=[f.p];
 for(let t=0;t<220;t++){
 const inp=input({mx:.7,my:.2,attack:t%20<8,dodgeEdge:t%39===3,viewTick:Math.max(0,t-8)});
 const packet=encodeSnapshot(f.w,{p:0});assert.equal(JSON.stringify(packet).includes('multiplayerDodge'),false);
 const before=decodeSnapshot(packet,'p').entities[0];const pred=predictPlayerTick(before,inp,{arena:f.w.arena,tick:f.w.tick,multiplayerDodge:true});step(f.w,{p:inp});
 assert.deepEqual(pred.dodge,f.p.dodge);assert.equal(pred.bufferDodge,f.p.bufferDodge);assert.equal(pred.act?.phase,f.p.act?.phase);assert.ok(Math.abs(pred.x-f.p.x)<.006);assert.ok(f.p.dodge.iframeLeft<=12);
 }
});
test('new round cannot refund prior round hostile hit',async()=>{
 const {startStage}=await import('../js/sim/world.js');const f=fixture(true,true);shot(f);step(f.w);const hp=f.p.hp;
 startStage(f.w,'S2');const ev=step(f.w,{p:input({dodgeEdge:true,mx:1,viewTick:0})});assert.equal(f.p.hp,hp);assert.equal(ev.some(e=>e.type==='dodgeRewind'),false);
});
for(const kind of ['friendly','self','counter','periodic','terminal'])test(`multi rewind excludes ${kind}`,()=>{
 const f=fixture(true,true);
 if(kind==='periodic')f.p.poison={left:10,next:1,interval:30,hit:{periodic:true,srcId:f.m.id,srcKind:'monster',abilityId:'spider_puddle',mult:1,def:{damage:2},fromX:f.m.x,fromY:f.m.y}};
 else shot(f,kind==='counter'?{counter:true}:['friendly','self'].includes(kind)?{ownerId:f.p.id,ownerKind:'player',team:f.p.team}:{});
 step(f.w);if(kind==='terminal'){f.p.dead=true;f.p.terminal='death';f.p.hp=0;}const hp=f.p.hp;
 const ev=step(f.w,{p:input({dodgeEdge:true,mx:1,viewTick:0})});assert.equal(f.p.hp,hp);assert.equal(ev.some(e=>['dodgeRewind','perfectDodge'].includes(e.type)),false);
});
