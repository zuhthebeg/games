import test from 'node:test';import assert from 'node:assert/strict';
import {pair} from './fixtures/invasion-party.js';import {emptyInput} from '../js/sim/world.js';import {InputQueue,InputSender} from '../js/net/protocol.js';
const T=1000/30;
test('resume requests a fresh host barrier, snaps prediction/interpolation and silently consumes stale journal',()=>{
 const {s}=pair(),g=s.guest,h=s.host,frames=[],fx=[];g.onFrame=(v,e,meta)=>frames.push({v,e,meta});g.onEvents=(v,e)=>fx.push(...e);
 g.suspend();const w=h.world;w.entities.find(e=>e.pid==='guest').x+=90;
 const event={type:'hit',src:1,dst:2,dmg:3,x:10,y:10};h.journal.push({seq:++h.eventSeq,event,participants:[]});w.tick+=30;
 const old=g.prediction;g.resume();
 assert.notEqual(g.prediction,old);assert.equal(g.awaitingResync,false);assert.equal(g.prediction.pending.length,0);
 assert.equal(g.prediction.smoothLeft,0);assert.equal(g.buffer.frames.length,1);
 assert.equal(g.view().entities[0].x,w.entities.find(e=>e.pid==='guest').x);
 assert.equal(frames.at(-1).meta.silent,true);assert.equal(frames.at(-1).e.filter(e=>e.type==='hit').length,1);
 assert.equal(fx.length,0);assert.equal(g.eventAck,h.eventSeq);
});
test('hidden packets retain settlement events but suppress every presentation callback',()=>{
 const {s}=pair(),rows=[],fx=[];s.guest.onFrame=(v,e,m)=>rows.push({e,m});s.guest.onEvents=(v,e)=>fx.push(...e);s.guest.suspend();
 s.host.journal.push({seq:++s.host.eventSeq,event:{type:'kill',id:99,xp:4},participants:['guest']});s.host.world.tick+=2;s.host.broadcast();
 assert.equal(rows.at(-1).m.silent,true);assert.equal(rows.at(-1).e[0].type,'kill');assert.equal(s.guest.eventAck,1);assert.equal(fx.length,0);
});
test('input barrier drops held movement, stale edges and old redundant commands, preserving next fresh press',()=>{
 const q=new InputQueue(),sender=new InputSender();q.receive(sender.packet({...emptyInput(),skillEdge:true,mx:1}),0);q.receive(sender.packet({...emptyInput(),skillEdge:true,mx:1}),1);
 const barrier=sender.packet(emptyInput());assert.equal(q.discard(barrier,2),true);
 const idle=q.consume(3);assert.equal(idle.skillEdge,false);assert.equal(idle.mx,0);assert.equal(q.queue.length,0);
 assert.equal(q.receive({...barrier,seq:barrier.seq-1},4),false);
 q.receive(sender.packet({...emptyInput(),skillEdge:true}),5);assert.equal(q.consume(40).skillEdge,true);assert.equal(q.consume(75).skillEdge,false);
});
test('resync barrier cannot be forged by another guest; a stalled transport asks for reconnect once',()=>{
 const {s}=pair();let reconnects=0;s.guest.onTransportStale=()=>reconnects++;s.guest.sendRt=()=>{};s.guest.resume();
 const n=s.guest.resyncNonce;s.guest.rt('guest',{t:'snapshot',resync:{to:'guest',nonce:n}});assert.equal(s.guest.awaitingResync,true);
 for(let i=0;i<15;i++)s.guest.update(250,emptyInput());assert.equal(reconnects,1);assert.equal(s.guest.prediction.pending.length,0);
});
test('host resume does not catch up stale elapsed time or replay its own queued skill',()=>{
 const {s}=pair();s.host.update(10,{...emptyInput(),skillEdge:true});const tick=s.host.world.tick;s.host.resume();s.host.update(1,emptyInput());
 assert.equal(s.host.world.tick,tick);assert.equal(s.host.latches.host.consume(s.host.now).skillEdge,false);
});
test('queued socket callbacks after a long frozen rAF gap cannot replay stale hit sounds before the first frame',()=>{
 const {s}=pair(),fx=[];s.guest.onEvents=(v,e)=>fx.push(...e);s.guest.lastUpdateWall=-10000;
 s.guest.rt('host',{t:'events',tick:1,events:[{seq:1,event:{type:'hit',src:1,dst:2,dmg:9,x:0,y:0}}]});
 assert.equal(fx.length,0);assert.equal(s.guest.resumeStats.count,1);
});
test('the first timer callback after a long visible host stall resyncs before any catch-up sim ticks',()=>{
 const {s}=pair(),tick=s.host.world.tick;s.host.update(2500,{...emptyInput(),skillEdge:true});
 assert.equal(s.host.world.tick,tick);assert.equal(s.host.resumeStats.count,1);
});
test('duplicate visibility/frame resume signals retain the original correction measurement while awaiting authority',()=>{
 const {s}=pair(),g=s.guest;const before=g.prediction.state.x;g.sendRt=()=>{};g.resume();g.resume();
 assert.equal(g.resumeFrom.x,before);
});
