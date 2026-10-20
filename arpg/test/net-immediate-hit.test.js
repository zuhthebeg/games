import test from 'node:test';
import assert from 'node:assert/strict';
import {pair} from './fixtures/invasion-party.js';
import {emptyInput} from '../js/sim/world.js';
const T=1000/30;
test('host sends hit presentation on its damage tick before the next snapshot; repeated delivery renders once',()=>{
 const {s}=pair(), w=s.host.world, [h,g]=w.entities; w.round.pending=[]; w.entities=[h,g];
 h.x=300;h.y=300;g.x=340;g.y=300;h.hp=h.maxHp=10000;
 const sent=[],fast=[],normal=[],presentation=[];const send=s.host.sendRt;
 s.host.sendRt=p=>{sent.push(structuredClone(p));send(p);};
 s.guest.onEvents=(view,events)=>{assert.equal(s.guest.world,null);fast.push(...events);};
 s.guest.onFrame=(view,events,meta)=>{normal.push(...events);presentation.push(...meta.presentation);};
 let oddHit=false;
 for(let i=0;i<80;i++){
  s.guest.update(T,{...emptyInput(),attack:true,aimX:-1});
  const n=sent.length;s.host.update(T,emptyInput());
  const hit=s.host.journal.find(r=>r.event.type==='hit');
  const batch=sent.slice(n),immediate=batch.find(p=>p.t==='events'&&p.events.some(r=>r.event.type==='hit'));
  if(immediate){
   assert.ok(fast.length>0);assert.ok(immediate.tick===w.tick);
   const seen=fast.length;s.guest.rt('host',immediate);assert.equal(fast.length,seen);
   if(w.tick%2===1){oddHit=true;assert.ok(!batch.some(p=>p.t==='snapshot'));}
  }
 }
 assert.ok(oddHit,'a hit on an odd tick must arrive without waiting for a snapshot');
 assert.ok(fast.length>0);assert.ok(normal.some(e=>e.type==='hit'),'reliable hits must still reach mastery/progression tracking');assert.equal(presentation.filter(e=>e.type==='hit').length,0,'snapshot presentation must not replay already shown hits');
 assert.equal(s.guest.eventAck,s.host.eventSeq,'reliable journal acknowledgements still advance');
});
test('only the real host can deliver immediate presentation; snapshot fallback survives a dropped fast packet',()=>{
 const {s}=pair(), fast=[];s.guest.onEvents=(v,e)=>fast.push(...e);
 const event={type:'hit',src:1,dst:2,dmg:9,x:100,y:100};
 s.guest.rt('guest',{t:'events',tick:0,events:[{seq:1,event}]});assert.equal(fast.length,0);
 const normal=[];s.guest.onFrame=(v,e)=>normal.push(...e);
 s.host.journal.push({seq:++s.host.eventSeq,event,participants:[]});s.host.world.tick+=2;s.host.broadcast();
 assert.equal(normal.filter(e=>e.type==='hit').length,1);
});
