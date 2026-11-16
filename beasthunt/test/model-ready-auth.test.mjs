import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./offline-loader.mjs',import.meta.url);
const {Coop}=await import('../js/net/coop.js');
const {VERSION,envelope}=await import('../js/net/protocol.js');
const ready=(hunt='h')=>envelope('modelReady',hunt,0,{});

// Use production service -> attachRelay hooks, not a synthetic trusted packet callback.
function fixture(t,ids=['a','b','c']){
  const prior={document:globalThis.document,sessionStorage:globalThis.sessionStorage,Worker:globalThis.Worker};
  let starts=0,options;const sent=[];
  globalThis.document={getElementById:()=>({})};
  globalThis.sessionStorage={setItem(){},removeItem(){}};
  globalThis.Worker=class{constructor(){starts++;}postMessage(p){if(p.type==='init')options=p.options;}terminate(){}};
  t.after(()=>Object.assign(globalThis,prior));
  const plan={v:VERSION,id:'h',host:'a',roster:Object.fromEntries(ids.map(id=>[id,{}]))};
  const owner={initialized:false,disconnected:false,pending:[],sim:{over:false,finish(){this.over=true;}},receive(){}};
  const ws={_ws:{readyState:1},sendRt:p=>sent.push(['state',p]),sendAction:p=>sent.push(['event',p])};
  const roster={hostUser:'a',players:ids.map(user=>({user}))};
  const c=Object.assign(Object.create(Coop.prototype),{uid:'a',save:{weapon:'gs',w:{gs:1},armor:1},plan,owner,modelIsReady:false,modelsReady:new Set(),
    worldOptions:{quest:{id:'q1',mon:'boar'},roster:plan.roster},worldPackets(){},roster,remotes:new Map(),profiles:new Map(),
    lobby:{_ws:ws,_roster:roster,room:'test'},decorate(){}});
  c.service();
  const rt=(from,p=ready())=>ws.onRt(from,{bh:p});
  // A malicious member c controls the nominal BH_EVENT.from field, not rt's sender.
  const event=(from,p=ready())=>ws.onEvent({from:'c',data:{type:'BH_EVENT',from,payload:p}});
  return {c,owner,ws,rt,event,sent,get starts(){return starts;},get options(){return options;}};
}
test('nominal reliable BH_EVENT cannot impersonate host or other loading participants',t=>{
  const x=fixture(t);for(const id of ['a','b','c'])x.event(id);
  assert.equal(x.c.modelsReady.size,0);assert.equal(x.starts,0);
  x.rt('b');assert.deepEqual([...x.c.modelsReady],['b']);assert.equal(x.starts,0);
});
test('authenticated peers and a forged ready set cannot bypass actual host model load',t=>{
  const x=fixture(t);x.c.modelReady({});assert.equal(x.c.modelIsReady,false);
  x.rt('b');x.rt('c');x.c.modelsReady.add('a');x.c.startLoadedWorld();
  assert.equal(x.starts,0);x.c.modelReady(x.owner);assert.equal(x.starts,1);
  x.c.modelReady(x.owner);x.rt('b');x.rt('c');assert.equal(x.starts,1);
  assert.deepEqual(Object.keys(x.options.roster),['a','b','c']);
});
test('loaded host waits for each authenticated peer and starts once',t=>{
  const x=fixture(t);x.c.modelReady(x.owner);
  assert.equal(x.sent.filter(([ch,p])=>ch==='state'&&p.bh?.type==='modelReady').length,1);
  assert.equal(x.sent.filter(([ch])=>ch==='event').length,0);
  x.rt('b');x.event('c');assert.equal(x.starts,0);
  x.rt('c');assert.equal(x.starts,1);x.rt('c');x.c.announceModelReady();assert.equal(x.starts,1);
});
test('a dropped initial ready state is retried by the existing service cadence',t=>{
  const x=fixture(t,['a','b']);x.c.modelReady(x.owner);
  let attempts=0,events=0;
  const ws={_ws:{readyState:1},sendAction(){events++;},sendRt(p){
    if(p.bh?.type==='modelReady' && ++attempts>1)x.ws.onRt('b',p);
  }};
  const owner={initialized:false,disconnected:false,sim:{over:false},receive(){}};
  const guest=Object.assign(Object.create(Coop.prototype),{uid:'b',owner,plan:x.c.plan,roster:x.c.roster,
    lobby:{_ws:ws,_roster:x.c.roster},profiles:new Map(),remotes:new Map(),modelsReady:new Set(),decorate(){}});
  guest.service();guest.modelReady(owner);assert.equal(attempts,1);assert.equal(x.starts,0);
  guest.service();assert.equal(attempts,2);assert.equal(x.starts,1);assert.equal(events,0);
  // The normal full-snapshot initialization acknowledgment stops readiness retries.
  owner.initialized=true;guest.service();assert.equal(attempts,2);assert.equal(x.starts,1);
});
test('authenticated readiness retains version hunt sequence and plan-roster fences',t=>{
  const x=fixture(t);for(const p of [{...ready(),v:VERSION-1},ready('old'),{...ready(),seq:1}])x.rt('b',p);
  x.rt('foreign');x.c.packet('b',ready());x.event('b');assert.equal(x.c.modelsReady.size,0);
  x.rt('b');assert.deepEqual([...x.c.modelsReady],['b']);
});
for(const failure of ['aborted','disconnected','closed','detached','replaced','host-left','last-peer-left'])test('loading safely exits without late authority after '+failure,t=>{
  const x=fixture(t,['a','b']),session=x.owner;
  if(failure==='aborted')x.c.stop();
  if(failure==='disconnected')x.c.lostHost();
  if(failure==='closed')x.ws._ws.readyState=3;
  if(failure==='detached')x.c.lobby._ws=null;
  if(failure==='replaced')x.c.lobby._ws={_ws:{readyState:1},sendRt(){},sendAction(){}};
  if(failure==='host-left')x.ws.onRoster({hostUser:'b',players:[{user:'b'}]});
  if(failure==='last-peer-left')x.ws.onRoster({hostUser:'a',players:[{user:'a'}]});
  if(failure==='last-peer-left')assert.equal(session.disconnected,true);
  x.c.modelReady(session);x.rt('b');x.c.service();x.c.startLoadedWorld();
  assert.equal(x.starts,0);assert.equal(x.c.modelIsReady,false);
  if(failure!=='aborted')assert.equal(session.disconnected,true);
});
test('a departed unready third peer is excluded while remaining loaded party can start',t=>{
  const x=fixture(t);x.c.modelReady(x.owner);x.rt('b');assert.equal(x.starts,0);
  x.ws.onRoster({hostUser:'a',players:[{user:'a'},{user:'b'}]});
  assert.equal(x.starts,1);assert.deepEqual(Object.keys(x.options.roster),['a','b']);
});
