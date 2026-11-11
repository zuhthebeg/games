import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../js/sim.js';
import { QUESTS, ATK, DMG_SCALE } from '../js/data.js';
import { envelope, encodeMonster, decodeMonster, encodeHunter, byteLength, LatestState, compatible } from '../js/net/protocol.js';
import { PlaybackClock } from '../js/net/clock.js';
import { TickBuffer, HpDisplay } from '../js/net/interp.js';
import { LoopbackNetwork, attachRelay } from '../js/net/transport.js';
import { HitClaims } from '../js/net/claims.js';
import { HostReplication, GuestReplication } from '../js/net/replication.js';
const save={weapon:'gs',w:{gs:1,db:1,bow:1},armor:1};
const sim=()=>new Sim(QUESTS[0],save,42);
const close=(a,b,eps=.00001)=>assert.ok(Math.abs(a-b)<eps, a+' != '+b);

test('compact world wire roundtrip and maximum projectile budget',()=>{
  const s=sim(); s.m.x=1.234; s.m.yaw=3.12345;s.m.broke.tail=true;
  for(let i=0;i<8;i++) s.spawnProj(1,2,.1,31,1.25,28,true);
  const p=encodeMonster(s,3,'hunt'), back=decodeMonster(JSON.parse(JSON.stringify(p)));
  close(back.m.x,s.m.x,.006);close(back.m.yaw,s.m.yaw,.0006);
  assert.equal(back.m.broke.tail,true);assert.equal(back.projs.length,8);
  assert.ok(byteLength(p)<1024); assert.equal(s.m.x,1.234);
  console.log('WIRE max-projectiles bytes='+byteLength(p));
});
test('state sequence filtering is per sender/type; version and hunt are fenced',()=>{
  const latest=new LatestState();
  assert.ok(latest.accept('a',envelope('world','h',10,{})));
  assert.ok(!latest.accept('a',envelope('world','h',9,{})));
  assert.ok(latest.accept('b',envelope('world','h',1,{})));
  assert.ok(latest.accept('a',envelope('hunter','h',1,{})));
  assert.equal(compatible({v:999}),false);
  const g=new GuestReplication({hunt:'h',host:'a',localId:'b'}),p=encodeMonster(sim(),1,'h');
  assert.equal(g.receive('wrong',p,0),false);
  assert.equal(g.receive('a',{...p,v:999},0),false);
  assert.equal(g.receive('a',{...p,hunt:'old'},0),false);
  assert.equal(g.receive('a',{...p,payload:{}},0),false);
  assert.equal(g.receive('a',p,0),true);
});
test('replication cannot overwrite the local owner, stale hunter packets ignored',()=>{
  const s=sim(),g=new GuestReplication({hunt:'h',host:'host',localId:'p1'});
  const before=s.snapshot();
  assert.equal(g.receive('p1',encodeHunter(s.p,0,1,'h'),0),false);
  const p=encodeHunter({...s.p,id:'remote'},0,2,'h');
  assert.equal(g.receive('remote',p,0),true);
  assert.equal(g.receive('remote',p,1),false);
  assert.equal(g.receive('spoof',p,1),false);
  assert.deepEqual(s.snapshot(),before);
});
test('host sends exactly once per four simulation ticks',()=>{
  const packets=[],h=new HostReplication({hunt:'h',transport:{sendState:p=>packets.push(p)}}),s=sim();
  for(let tick=1;tick<=60;tick++) {s.tick=tick;h.afterTick(s);h.afterTick(s);}
  assert.equal(packets.length,15);
  assert.deepEqual(packets.map(p=>p.payload.k),Array.from({length:15},(_,i)=>(i+1)*4));
});
test('tick interpolation crosses angle wrap and bounds decelerating extrapolation',()=>{
  const b=new TickBuffer();b.push(0,{x:0,z:0,yaw:3.1});b.push(4,{x:4,z:0,yaw:-3.1});
  close(b.sample(2).x,2);assert.ok(Math.abs(b.sample(2).yaw)>3);
  close(b.sample(10).x,7);close(b.sample(100).x,7);
  assert.equal(b.push(3,{x:100}),false);assert.equal(b.push(4,{x:100}),false);
  assert.equal(b.samples.length,2);
});
test('playback stays monotonic and never slews beyond five percent',()=>{
  const c=new PlaybackClock();c.observe(0,0);let prev=c.playTick;
  for(let i=1;i<1000;i++) {
    if(i%4===0)c.observe(i,i*1000/60+(i%48===0?200:0));
    const tick=c.advance(1/60,i*1000/60);
    assert.ok(tick>=prev);assert.ok(tick-prev>=.95-1e-8 && tick-prev<=1.05+1e-8);
    assert.ok(c.delayMs>=100 && c.delayMs<=250);prev=tick;
  }
});
test('hp display closes at least 95 percent of error in 300ms',()=>{
  const hp=new HpDisplay(100);for(let i=0;i<18;i++)hp.update(0,1/60);
  assert.ok(hp.value<=5);
});
test('seeded TCP loopback has stable replay, HOL ordering and no event loss',()=>{
  const run=()=>{
    const n=new LoopbackNetwork({seed:77,delayMs:80,jitterMs:40,burstChance:.5,burstMs:180}),got=[];
    const a=n.connect('a',()=>{});n.connect('b',(from,p,ch,at)=>got.push([p.seq,ch,at]));
    for(let i=0;i<100;i++){a.sendEvent({seq:i});n.advance(i*5);}
    n.advance(2000);assert.equal(got.length,100);assert.deepEqual(got.map(p=>p[0]),Array.from({length:100},(_,i)=>i));
    return got;
  };assert.deepEqual(run(),run());
});
test('reliable relay adapter preserves shared callbacks, wraps started and removes only own hooks',()=>{
  const calls=[],packets=[],ws={onRt:()=>calls.push('oldRt'),onStarted:()=>calls.push('oldStart'),
    onEvent:()=>calls.push('oldEvent'),sendRt:p=>calls.push(p),sendAction:p=>calls.push(p)};
  const old=ws.onStarted;
  const t=attachRelay(ws,{uid:'me',onPacket:(...a)=>packets.push(a),onStarted:()=>calls.push('start')});
  ws.onStarted({});ws.onRt('peer',{bh:{seq:1}});
  ws.onEvent({data:{type:'BH_EVENT',from:'peer',payload:{seq:2}}});
  ws.onEvent({data:{type:'BH_EVENT',from:'me',payload:{seq:3}}});
  assert.equal(packets.length,2);assert.deepEqual(calls.slice(0,2),['oldStart','start']);
  t.sendEvent({seq:4},{snapshot:{tick:2},final:true});
  assert.equal(calls.at(-1).__final,true);assert.deepEqual(calls.at(-1).__snapshot,{tick:2});
  t.close();assert.equal(ws.onStarted,old);
});
function claimFixture(weapon='gs') {
  const s=sim();s.players[0].weapon=weapon;
  const v=new HitClaims();
  for(let tick=0;tick<=180;tick++){s.tick=tick;v.record(s);}
  const part=s.mParts()[0];Object.assign(s.p,{x:part.x,z:part.z-2});
  return {s,v,c:{seq:1,hostTick:180,part:'head',raw:ATK[0]*(weapon==='gs'?1:.4)*DMG_SCALE,moveId:'light:0'}};
}
test('hit claims reject range, raw, duplicate, interval, old history and dead monster',()=>{
  for(const [reason,mutate] of [
    ['range',f=>f.s.p.x=100],['raw',f=>f.c.raw=99999],
    ['schema',f=>f.c.hostTick=0],['dead',f=>f.s.m.state='dead'],['move',f=>f.c.moveId='bad']]) {
    const f=claimFixture();mutate(f);assert.equal(f.v.validate('p1',f.c,f.s.p,f.s).reason,reason);
  }
  const f=claimFixture();assert.ok(f.v.validate('p1',f.c,f.s.p,f.s).ok);
  assert.equal(f.v.validate('p1',f.c,f.s.p,f.s).reason,'duplicate');
  assert.equal(f.v.validate('p1',{...f.c,seq:2},f.s.p,f.s).reason,'interval');
  assert.ok(f.v.history.length<=61);
});
test('claim arrival bursts use playback ticks, duplicates never apply HP twice',()=>{
  const {s,v,c}=claimFixture('db'),before=s.m.hp;
  s.p.x=s.mParts()[0].x;s.p.z=s.mParts()[0].z;
  for(const tick of [132,156,180]) {
    const claim={...c,hostTick:tick,seq:tick};
    for(let retry=0;retry<2;retry++) {
      const hit=v.validate('p1',claim,s.p,s);
      if(hit.ok) s.hitMonster(hit.part,hit.raw,hit.x,hit.z,hit.mv);
    }
  }
  assert.equal(v.accepted,3);assert.equal(v.rejected,3);assert.ok(s.m.hp<before);
});

// Synthetic constant-velocity replication benchmark, NOT a completed coop hunt.
const conditions=[
  ['wired',{delayMs:30,jitterMs:5,burstChance:0}],
  ['lte',{delayMs:80,jitterMs:40,burstChance:.02}],
  ['adverse',{delayMs:200,jitterMs:80,burstChance:.05}]
];
for(const [name,condition] of conditions) for(const peers of [2,4]) test(name+'/'+peers+' synthetic smoothness and delivery',()=>{
  const n=new LoopbackNetwork({...condition,seed:42}),guests=[];
  const t=n.connect('host',()=>{}),s=sim();
  for(let i=1;i<peers;i++) {
    const g=new GuestReplication({hunt:'h',host:'host',localId:'g'+i});guests.push(g);
    n.connect('g'+i,(from,p,ch,at)=>g.receive(from,p,at));
  }
  const host=new HostReplication({hunt:'h',transport:t});
  const speeds=[],delays=[],jumps=[];let last=null,maxBytes=0;
  for(let tick=1;tick<=3600;tick++) {
    const now=tick*1000/60;n.advance(now);
    s.tick=tick;s.m.x=tick/60*5;s.m.t=tick/60;s.time=tick/60;
    host.afterTick(s);maxBytes=Math.max(maxBytes,byteLength(encodeMonster(s,tick,'h')));
    for(const g of guests) {
      const frame=g.frame(1/60,now);
      if(g===guests[0] && frame && tick>600) {
        if(last!==null) {const jump=Math.abs(frame.monster.x-last);speeds.push(jump*60);jumps.push(jump);}
        last=frame.monster.x;delays.push(g.clock.delayMs);
      }
    }
  }
  n.advance(62000);
  const mean=speeds.reduce((a,b)=>a+b,0)/speeds.length;
  const cv=Math.sqrt(speeds.reduce((a,b)=>a+(b-mean)**2,0)/speeds.length)/mean;
  const maxJump=Math.max(...jumps);
  assert.ok(maxJump<1);if(name==='lte')assert.ok(cv<.2,'cv='+cv);
  assert.ok(guests.every(g=>g.received===900));
  console.log('METRIC '+JSON.stringify({name,peers,cv,maxJump,snapshotBytes:maxBytes,
    bytesPerSecond:n.bytes/60,delayMs:delays.reduce((a,b)=>a+b,0)/delays.length}));
});

test('bow claims validate release cadence rather than variable flight/impact spacing',()=>{
  const {s,v,c}=claimFixture('bow');
  const first={...c,hostTick:170,actionTick:130};
  assert.ok(v.validate('p1',first,s.p,s).ok);
  assert.ok(v.validate('p1',{...c,seq:2,hostTick:180,actionTick:160},s.p,s).ok);
  assert.equal(v.validate('p1',{...c,seq:3,hostTick:180,actionTick:170},s.p,s).reason,'interval');
});
