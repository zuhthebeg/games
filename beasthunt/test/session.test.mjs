import test from 'node:test';
import assert from 'node:assert/strict';
import {LoopbackNetwork} from '../js/net/transport.js';
import {HostSession} from '../js/net/host.js';
import {GuestSession} from '../js/net/guest.js';
import {QUESTS} from '../js/data.js';
const save={weapon:'gs',w:{gs:5,db:5,bow:5},armor:5};
function run(peers,condition,forcedLoss=false,weapon='gs') {
  const loadout={...save,weapon};
  let now=0,host,local;
  const n=new LoopbackNetwork({...condition,seed:42}),roster={host:{save:loadout}};
  for(let i=1;i<peers;i++)roster['g'+i]={save:loadout};
  const wire=n.connect('host',(from,p,ch,at)=>{host.receive(from,p,at);local.receive(from,p,at);});
  const hostTransport={sendState:p=>{wire.sendState(p);local?.receive('host',p,now);},sendEvent:p=>{wire.sendEvent(p);local?.receive('host',p,now);}};
  host=new HostSession({quest:QUESTS[0],roster,seed:42,hunt:'h',host:'host',transport:hostTransport});
  local=new GuestSession({quest:QUESTS[0],save:loadout,seed:123,hunt:'h',host:'host',uid:'host',transport:{
    sendState:p=>{host.receive('host',p,now);wire.sendState(p);},
    sendEvent:p=>{host.receive('host',p,now);wire.sendEvent(p);}
  }});
  const guests=[local],results=[];
  for(let i=1;i<peers;i++) {
    const uid='g'+i;let guest;
    const t=n.connect(uid,(from,p,ch,at)=>guest.receive(from,p,at));
    guest=new GuestSession({quest:QUESTS[0],save:loadout,seed:100+i,hunt:'h',host:'host',uid,transport:t});guests.push(guest);
  }
  host.initial();
  for(let tick=1;tick<=60*240;tick++) {
    now=tick*1000/60;n.advance(now);host.tick();
    for(const [i,g] of guests.entries()) {
      const s=g.sim,p=s.p,head=s.mParts().find(p=>p.n==='head'),dx=head.x-p.x,dz=head.z-p.z,d=Math.hypot(dx,dz);
      if(forcedLoss && ((tick===300 && i===0) || (tick===600 && i===1) || (tick===900 && i===0))) {
        p.hp=1;p.inv=0;p.state='idle';s.hurt(999,0,0,true);
      }
      const input={aimYaw:Math.atan2(dx,dz),moveZ:d>3.5?127:0,
        light:tick%20===i,heavy:tick%300===150+i,heavyHeld:tick%300>=150+i&&tick%300<250+i,
        dodge:tick%420===400+i,potion:p.hp<70 && tick%60===i};
      const events=g.tick(input,now);
      for(const e of events)if(e.type==='result')results[i]=e.result;
    }
    if(results.filter(Boolean).length===peers)break;
  }
  assert.equal(results.filter(Boolean).length,peers,'every owner reached a result');
  for(const r of results) {
    assert.equal(r.win,host.sim.win);assert.equal(r.carts,host.sim.carts);
    assert.deepEqual(r.broke,host.sim.m.broke);
  }
  return {peers,win:host.sim.win,carts:host.sim.carts,broke:host.sim.m.broke,time:host.sim.time,
    accepted:host.claims.accepted,rejected:host.claims.rejected,reasons:host.claims.reasons,
    rate:host.claims.accepted/(host.claims.accepted+host.claims.rejected),
    eligibleRate:host.claims.accepted/(host.claims.accepted+host.claims.rejected-(host.claims.reasons.dead??0))};
}
for(const [name,condition] of [
  ['wired',{delayMs:30,jitterMs:5}],['lte',{delayMs:80,jitterMs:40,burstChance:.02}],
  ['adverse',{delayMs:200,jitterMs:80,burstChance:.05}]
])for(const peers of [2,4])test(name+'/'+peers+' headless hunt ends with consistent world result',()=>{
  const result=run(peers,condition);
  if(name==='adverse' && peers===4)assert.equal(result.broke.head,true,'actual head break was exercised');
  if(name==='lte')assert.ok(result.eligibleRate>=.99);
  console.log('HUNT '+JSON.stringify({name,...result}));
});

for(const peers of [2,4])test('LTE/'+peers+' owner-reported shared three-cart failure',()=>{
  const result=run(peers,{delayMs:80,jitterMs:40,burstChance:.02},true);
  assert.equal(result.win,false);assert.equal(result.carts,3);
  console.log('CART '+JSON.stringify(result));
});
test('duplicate owner cart cannot consume another shared life',()=>{
  const sent=[],host=new HostSession({quest:QUESTS[0],roster:{a:{save},b:{save}},hunt:'h',host:'a',
    transport:{sendState:()=>{},sendEvent:p=>sent.push(p)}});
  const cart={v:1,type:'cart',hunt:'h',seq:1,payload:{cart:1}};
  assert.equal(host.receive('a',cart),true);assert.equal(host.receive('a',cart),false);
  assert.equal(host.sim.carts,1);assert.equal(host.sim.over,false);
});

for(const weapon of ['db','bow'])for(const peers of [2,4])test('LTE/'+peers+'/'+weapon+' headless hunt and eligible claim acceptance',()=>{
  const result=run(peers,{delayMs:80,jitterMs:40,burstChance:.02},false,weapon);
  console.log('WEAPON '+JSON.stringify({weapon,...result}));
  assert.ok(result.eligibleRate>=.99,'eligible rate '+result.eligibleRate);
});
