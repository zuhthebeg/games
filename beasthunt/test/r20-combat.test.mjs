import test from 'node:test';
import assert from 'node:assert/strict';
import {Sim,neutralInput,FIXED_DT} from '../js/sim.js';
import {WTYPES} from '../js/data.js';
import {HitClaims} from '../js/net/claims.js';
import {VERSION,compatible} from '../js/net/protocol.js';
const save=weapon=>({weapon,w:{gs:1,db:1,bow:1},armor:1});
const sim=(weapon='gs',network=null)=>{const s=new Sim({mon:'boar'},save(weapon),1,network);s.p.lock=false;s.m.think=999;return s;};
const tick=(s,input={})=>{s.step({p1:{...neutralInput(),...input}});return s.drainEvents();};
function advance(s,predicate,max=180){for(let i=0;i<max&&!predicate();i++)tick(s);assert.ok(predicate(),'bounded advance');}
for(const [weapon,values] of Object.entries({gs:[1,1.25,1.8],db:[.35,.42,.5,.85],bow:[.35,.4,.5]})){
 test(weapon+' graded normal values cause exact actual body HP loss at every stage',()=>{
  const s=sim(weapon);s.mParts=()=>[{n:'body',x:0,z:1,r:.5}];s.p.x=s.p.z=0;
  for(let node=0;node<values.length;node++){
   const before=s.m.hp;s.startAtk(WTYPES[weapon].light[node],0,node,0,false);
   // Drive real contact path, not just move metadata. Keep solo hitstop out of sampling.
   for(let n=0;n<90&&s.p.hits===0;n++){s.stop=s.slow=0;s.updPlayer(FIXED_DT);if(weapon==='bow')s.updProjs(FIXED_DT);}
   if(weapon==='bow')for(let n=0;n<12&&s.m.hp===before;n++)s.updProjs(FIXED_DT);
   assert.equal(before-s.m.hp,({gs:[29,37,54],db:[10,12,15,26],bow:[10,12,15]})[weapon][node],weapon+' node '+node);
   s.p.x=s.p.z=0;
  }
 });
 test(weapon+' early repeated edges retain ONE next, no neutral required, no third autoplay',()=>{
  const s=sim(weapon);tick(s,{light:true});
  for(let i=0;i<5;i++)tick(s,{light:true});
  advance(s,()=>s.p.combo===1);
  assert.equal(s.p.state,'atk');assert.equal(s.p.t,0);
  advance(s,()=>s.p.state==='idle');for(let i=0;i<30;i++)tick(s);
  assert.equal(s.p.combo,1);assert.equal(s.p.state,'idle');
 });
 test(weapon+' 150ms normal grace advances once and expires',()=>{
  const s=sim(weapon);tick(s,{light:true});advance(s,()=>s.p.state==='idle');
  for(let i=0;i<5;i++)tick(s);tick(s,{light:true});assert.equal(s.p.combo,1);
  advance(s,()=>s.p.state==='idle');for(let i=0;i<10;i++)tick(s);
  tick(s,{light:true});assert.equal(s.p.combo,0);
 });
 test(weapon+' queued and grace snapshots continue deterministically',()=>{
  const s=sim(weapon);tick(s,{light:true});tick(s,{light:true});
  const copy=sim(weapon).restore(s.snapshot());
  for(let i=0;i<160;i++){assert.deepEqual(tick(s),tick(copy));assert.deepEqual(s.snapshot(),copy.snapshot());}
  assert.equal(s.p.combo,1);
 });
}
test('GS spin never links before last active interval ends even after a successful early contact',()=>{
 const s=sim();s.startAtk(WTYPES.gs.combo.moves[4],0,4,0,false);s.p.hits=1;s.p.t=.83;
 tick(s,{light:true});assert.equal(s.p.combo,4);
 advance(s,()=>s.p.combo===0);assert.equal(s.p.t,0);
});
test('normal queue resets on roll, damage, guard, heavy, recovery, weapon swap and clearInputs',()=>{
 for(const interrupt of ['roll','hurt','heavy','guard','clear','weapon','recovery']){
  const s=sim();tick(s,{light:true});tick(s,{light:true});
  if(interrupt==='roll')s.startRoll(0);
  if(interrupt==='hurt')s.hurt(10,0,1,true);
  if(interrupt==='heavy')s.beginCharge(0,false);
  if(interrupt==='guard'){s.p.guardArm=true;s.p.t=.19;tick(s,{attackHeld:true});}
  if(interrupt==='clear')s.clearInputs();
  if(interrupt==='weapon')s.p.weapon='bow';
  if(interrupt==='recovery')s.updPlayer(FIXED_DT,{recovery:true});
  for(let i=0;i<160;i++)tick(s);
  assert.equal(s.p.state,'idle',interrupt);assert.equal(s.p.combo,interrupt==='heavy'?-1:0,interrupt+' must not replay next');
  assert.equal(s.p.comboNext,undefined,interrupt);
 }
});
test('expired late edge cannot refill normal queue; each bow step shoots exactly one arrow',()=>{
 const s=sim('bow');tick(s,{light:true});tick(s,{light:true,edgeAgeMs:{light:260}});
 let shots=0;for(let i=0;i<90;i++)shots+=tick(s).filter(e=>e.type==='sound'&&e.name==='shot').length;
 assert.equal(shots,1);assert.equal(s.p.combo,0);
});
test('R20 normal semantics reject mixed version peers',()=>{assert.ok(VERSION>2);assert.equal(compatible({v:2}),false);});
test('graded bow claims enforce actual per-stage ceiling and reject invalid indices',()=>{
 for(const [node,mv]of [[0,.35],[1,.4],[2,.5]]){
  const s=sim('bow',{role:'world',partySize:1});s.tick=100;s.p.x=s.p.z=0;
  const claims=new HitClaims();claims.record(s);
  const c={seq:1,hostTick:100,actionTick:80,part:'body',raw:100*mv*.3,moveId:'light:'+node};
  assert.equal(claims.validate('p1',c,s.p,s).ok,true,'node '+node);
  assert.equal(new HitClaims().validate('p1',{...c,raw:c.raw+.01},s.p,s).reason,'raw');
  assert.equal(claims.validate('p1',{...c,seq:2},s.p,s).reason,'interval');
 }
});

test('fresh normal input on exact grace expiry restarts first stage rather than disappearing',()=>{
 const s=sim('bow');tick(s,{light:true});advance(s,()=>s.p.state==='idle');
 for(let i=0;i<8;i++)tick(s);tick(s,{light:true});assert.equal(s.p.state,'atk');assert.equal(s.p.combo,0);
});
test('restoration discards malformed new-state queues and grace; valid grace resumes exactly',()=>{
 const s=sim('bow');tick(s,{light:true});tick(s,{light:true});
 for(const fields of [{comboNext:3},{comboNext:[]},{comboWeapon:'db'},{comboGrace:1},{comboGrace:-1},{comboGrace:'0.1'},{state:'down'},{combo:99}]){
  const snap=s.snapshot();Object.assign(snap.players[0],fields);const copy=sim('bow').restore(snap);
  assert.equal(copy.p.comboNext,undefined);assert.equal(copy.p.comboGrace,undefined);assert.equal(copy.p.comboWeapon,undefined);
 }
 const g=sim('bow');tick(g,{light:true});advance(g,()=>g.p.state==='idle');const copy=sim('bow').restore(g.snapshot());
 assert.deepEqual(tick(g,{light:true}),tick(copy,{light:true}));assert.deepEqual(g.snapshot(),copy.snapshot());assert.equal(g.p.combo,1);
});
test('potion interruption removes grace at the transition snapshot',()=>{
 const s=sim('bow');s.p.hp=40;tick(s,{light:true});advance(s,()=>s.p.state==='idle');tick(s,{potion:true});
 assert.equal(s.p.state,'drink');assert.equal(s.p.comboGrace,undefined);assert.deepEqual(sim('bow').restore(s.snapshot()).snapshot(),s.snapshot());
});

// Integrated owner prediction -> authenticated HostSession claim -> actual HP.
import {HostSession} from '../js/net/host.js';
import {envelope} from '../js/net/protocol.js';
for(const weapon of ['gs','db','bow'])test(weapon+' owner stage claims apply exact host HP once, never owner HP',()=>{
 const roster={p1:{save:save(weapon)},p2:{save:save('gs')}};
 const host=new HostSession({quest:{mon:'boar'},roster,hunt:'r20',host:'p2',seed:1,transport:{sendState(){},sendEvent(){}}});
 const owner=sim(weapon,{role:'owner',localId:'p1',viewTick:0});
 const parts=()=>[{n:'body',x:0,z:1,r:.5}];host.sim.mParts=parts;owner.mParts=parts;
 Object.assign(host.sim.p,{x:0,z:0});Object.assign(owner.p,{x:0,z:0});
 for(const s of [host.sim,owner])Object.assign(s.m,{state:'flinch',dur:10000});
 let seq=1;const expected={gs:[29,37,54],db:[10,12,15,26],bow:[10,12,15]}[weapon];
 for(let node=0;node<expected.length;node++){
  Object.assign(owner.p,{x:0,z:0});owner.network.viewTick=host.sim.tick;
  owner.startAtk(WTYPES[weapon].light[node],0,node,0,false);
  const hp=host.sim.m.hp,ownerHp=owner.m.hp;let claims=0;
  for(let n=0;n<90&&claims===0;n++){
   host.sim.tick++;host.claims.record(host.sim);owner.network.viewTick=host.sim.tick;
   const events=tick(owner);
   for(const e of events.filter(e=>e.type==='hitClaim')){
    claims++;assert.equal(e.moveId,'light:'+node);const packet=envelope('hit','r20',seq,{...e,seq:seq++});
    assert.equal(host.receive('p1',packet),true,'accepted stage '+node);
    assert.equal(host.receive('p1',packet),false,'reliable duplicate');
   }
  }
  assert.equal(claims,1);assert.equal(hp-host.sim.m.hp,expected[node]);assert.equal(owner.m.hp,ownerHp);
  for(let i=0;i<60;i++){host.sim.tick++;host.claims.record(host.sim);owner.network.viewTick=host.sim.tick;assert.equal(tick(owner).filter(e=>e.type==='hitClaim').length,0,'no repeated impact');}
 }
 assert.equal(host.claims.accepted,expected.length);
});
for(const weapon of ['gs','db','bow'])test(weapon+' solo and owner use identical 60Hz combo state with fresh and aged edges',()=>{
 const a=sim(weapon),b=sim(weapon,{role:'owner',localId:'p1',viewTick:0});
 for(const s of [a,b])Object.assign(s.m,{x:30,z:30,state:'flinch',dur:10000});
 for(let i=0;i<300;i++){
  const input={light:[0,2,7,60,83,110].includes(i),edgeAgeMs:{light:i===83?250:0},moveZ:i%80<20?127:0};
  b.network.viewTick=i;tick(a,input);tick(b,input);
  for(const k of ['state','t','combo','comboNext','comboGrace','hits','st','x','z','spin'])assert.equal(a.p[k],b.p[k],k+' tick '+i);
 }
});
test('heavy/charge contracts and GS B damage remain unchanged',()=>{
 assert.deepEqual(Object.fromEntries(['gs','db','bow'].map(w=>[w,WTYPES[w].heavy])),{
  gs:{charge:1.5,mv0:1.3,mv1:3.8,dur:.95,h0:.28,h1:.46,reach:4.1,arc:1.3,lunge:3,sw:'v'},
  db:{charge:0,cost:22,multi:5,mv0:.34,mv1:.34,dur:1,h0:.12,h1:.86,reach:2.9,arc:6.4,lunge:6,sw:'spin'},
  bow:{charge:1.2,mv0:.5,mv1:2,dur:.55,h0:.12,h1:.12,shot:true,sw:'bow'}
 });
 assert.equal(WTYPES.gs.combo.moves[3].mv,1.15);assert.equal(WTYPES.gs.combo.moves[4].mv,1.55);
});
for(const weapon of ['db','bow'])test(weapon+' complete chain wraps only on another press and consumes no extra stamina',()=>{
 const s=sim(weapon);tick(s,{light:true});const count=WTYPES[weapon].light.length;
 for(let node=1;node<=count;node++){
  tick(s,{light:true});advance(s,()=>s.p.combo===node%count);assert.equal(s.p.st,100);
 }
 advance(s,()=>s.p.state==='idle');assert.equal(s.p.combo,0);assert.equal(s.nextEntity,weapon==='bow'?count+2:1);
});

test('bow stage changes cannot duplicate a shot identity or bypass firing cadence',()=>{
 const s=sim('bow',{role:'world',partySize:1});s.tick=100;s.p.x=s.p.z=0;
 const claims=new HitClaims();claims.record(s);
 const c={seq:1,hostTick:100,actionTick:80,part:'body',raw:10.5,moveId:'light:0'};
 assert.equal(claims.validate('p1',c,s.p,s).ok,true);
 assert.equal(claims.validate('p1',{...c,seq:2,moveId:'light:1'},s.p,s).ok,false,'one shot cannot become next stage');
 assert.equal(claims.validate('p1',{...c,seq:3,actionTick:81,moveId:'light:2'},s.p,s).ok,false,'one tick is not another shot');
});
test('bow legitimate different-stage release can arrive before an older in-flight shot',()=>{
 const s=sim('bow',{role:'world',partySize:1});s.tick=100;s.p.x=s.p.z=0;
 const claims=new HitClaims();claims.record(s);
 for(const [seq,actionTick,moveId]of [[1,80,'light:1'],[2,59,'light:0']])assert.equal(claims.validate('p1',{seq,hostTick:100,actionTick,part:'body',raw:10,moveId},s.p,s).ok,true);
});

test('GS spin real first contact does not truncate remaining active interval or repeat contact on linking',()=>{
 const s=sim();s.mParts=()=>[{n:'body',x:0,z:1,r:.5}];s.p.x=s.p.z=0;
 s.startAtk(WTYPES.gs.combo.moves[4],0,4,0,false);let contacts=0;
 for(let i=0;i<53;i++){
  s.p.input=neutralInput();if(i===25)s.p.buffer.attack=1;s.updPlayer(FIXED_DT);
  contacts+=s.drainEvents().filter(e=>e.type==='hit').length;assert.equal(s.p.combo,4,'before 900ms');
 }
 assert.equal(contacts,1);s.updPlayer(FIXED_DT);assert.equal(s.p.combo,0);assert.equal(s.p.t,0);assert.equal(s.p.hits,0);
});
test('queued snapshot must name the actual active normal move, not a heavy or idle phantom',()=>{
 const s=sim('bow');tick(s,{light:true});tick(s,{light:true});
 for(const fields of [{cur:WTYPES.bow.heavy},{cur:{...WTYPES.bow.light[0],mv:9}},{state:'idle',comboNext:undefined,comboGrace:undefined}]){
  const snap=s.snapshot();Object.assign(snap.players[0],fields);const copy=sim('bow').restore(snap);assert.equal(copy.p.comboWeapon,undefined);assert.equal(copy.p.comboNext,undefined);
 }
});

test('R20 authenticated bow stage 1/2 raw ceilings and cross-lane spam at host entry',()=>{
const roster={a:{save:save('bow')},b:{save:save('gs')}};const host=new HostSession({quest:{mon:'boar'},roster,hunt:'auth',host:'b',seed:1,transport:{sendState(){},sendEvent(){}}});const s=host.sim;s.tick=100;s.p.x=s.p.z=0;s.mParts=()=>[{n:'body',x:0,z:1,r:.5}];host.claims.record(s);let seq=1;const send=(from,node,actionTick,raw)=>host.receive(from,envelope('hit','auth',seq,{seq:seq++,hostTick:100,actionTick,part:'body',raw,moveId:'light:'+node}));const hp=s.m.hp;assert.equal(send('outsider',1,60,12),false);assert.equal(s.m.hp,hp);assert.equal(send('a',1,60,12.01),false);assert.equal(send('a',1,60,12),true);assert.equal(send('a',2,61,15),false);assert.equal(send('a',0,62,10),false);assert.equal(send('a',2,90,15),true);assert.equal(host.claims.accepted,2);
});
