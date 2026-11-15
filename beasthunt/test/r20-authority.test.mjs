import test from 'node:test';
import assert from 'node:assert/strict';
import {HostSession} from '../js/net/host.js';
import {WTYPES} from '../js/data.js';
import {envelope,encodeHunter} from '../js/net/protocol.js';
const save=weapon=>({weapon,w:{gs:1,db:1,bow:1},armor:1});
function fixture(weapon){
 const host=new HostSession({quest:{mon:'boar'},roster:{a:{save:save(weapon)},b:{save:save('gs')}},hunt:'auth',host:'b',seed:1,transport:{sendState(){},sendEvent(){}}});
 const s=host.sim;Object.assign(s.p,{x:0,z:0});s.mParts=()=>[{n:'body',x:0,z:1,r:.5}];
 let seq=0;const at=t=>{for(let tick=s.tick+1;tick<=t;tick++){s.tick=tick;host.claims.record(s);}};
 const send=(node,actionTick,hostTick=actionTick,raw=null,n=++seq)=>host.receive('a',envelope('hit',host.hunt,n,{seq:n,hostTick,actionTick,part:'body',raw:raw??100*(node==='heavy'?.34:WTYPES[weapon].light[node]?.mv??1)*.3,moveId:node==='heavy'?'heavy':'light:'+node}));
 at(100);return {host,s,at,send};
}
test('review repro: fresh bow final stage deals zero host HP',()=>{
 const f=fixture('bow'),hp=f.s.m.hp;for(const t of [100,119,138,157]){f.at(t);f.send(2,t);}
 console.log('REPRO bow-final HP='+ (hp-f.s.m.hp));assert.equal(hp-f.s.m.hp,0);
});
for(const weapon of ['gs','db'])test('review repro: '+weapon+' cross-stage one-tick spam is one legal first hit',()=>{
 const f=fixture(weapon),hp=f.s.m.hp;for(let node=0;node<WTYPES[weapon].light.length;node++){f.at(100+node);f.send(node,100+node);}
 console.log('REPRO '+weapon+'-burst HP='+(hp-f.s.m.hp));assert.equal(hp-f.s.m.hp,weapon==='gs'?29:10);assert.equal(f.host.claims.accepted,1);
});
for(const weapon of ['gs','db','bow'])test(weapon+' legal slow chain in a TCP burst has exact contract HP',()=>{
 const f=fixture(weapon),hp=f.s.m.hp;
 const ticks=weapon==='gs'?[100,147,195]:weapon==='db'?[100,121,142,163]:[100,130,160];
 // Arrival bursts stay inside the existing 60-tick history bound.
 for(let node=0;node<ticks.length;node++){f.at(ticks[Math.min(node+1,ticks.length-1)]);assert.equal(f.send(node,ticks[node]),true,'stage '+node);}
 assert.equal(hp-f.s.m.hp,{gs:120,db:63,bow:37}[weapon]);
});
test('bow long-flight predecessor after short-flight successor resolves only in legal stage order',()=>{
 const f=fixture('bow'),hp=f.s.m.hp;f.at(140);
 assert.equal(f.send(1,125,140),false,'unproven successor cannot damage');assert.equal(f.s.m.hp,hp);
 assert.equal(f.send(0,100,140),true);assert.equal(f.host.claims.accepted,2);assert.equal(hp-f.s.m.hp,22);
 f.at(160);assert.equal(f.send(2,150,160),true);assert.equal(hp-f.s.m.hp,37);
 assert.equal(f.send(1,125,140),false,'deferred identity cannot be replayed');
});
for(const weapon of ['gs','db','bow'])for(const reset of ['expiry','roll','charge','guard','hit','down','dead','drink','stun','weapon','hunt','heavy'])test(weapon+' host chain resets on '+reset,()=>{
 const f=fixture(weapon);assert.equal(f.send(0,100),true);
 if(reset==='expiry')f.at(100+Math.ceil(WTYPES[weapon].light[0].dur*60)+16);
 else if(reset==='hunt'){f.host.hunt='next';f.at(130);}
 else if(reset==='heavy'){f.at(140);assert.equal(f.send('heavy',140,140,10),true);f.at(180);}
 else if(reset==='weapon'){f.s.p.weapon=weapon==='db'?'gs':'db';f.at(101);f.s.p.weapon=weapon;f.at(140);}
 else {f.at(101);f.s.p.state=reset;assert.equal(f.host.receive('a',encodeHunter(f.s.p,101,100,'auth')),true);f.s.p.state='idle';f.at(140);}
 const hp=f.s.m.hp;assert.equal(f.send(1,f.s.tick),false);assert.equal(f.s.m.hp,hp);
});
test('late duplicate replayed and malformed action identities cannot damage host',()=>{
 const f=fixture('bow');assert.equal(f.send(0,100,100,null,1),true);f.at(130);const hp=f.s.m.hp;
 for(const [action,impact,seq]of [[100,100,1],[100,100,0],[130,130,1],[69,69,2],[130.5,130,3],[Infinity,130,4]])assert.equal(f.send(1,action,impact,null,seq),false);
 assert.equal(f.s.m.hp,hp);
});
test('DB heavy retains exactly five same-stage hits at existing minTicks spacing',()=>{
 const f=fixture('db'),hp=f.s.m.hp;
 for(const t of [100,111,122,133,144]){f.at(t);assert.equal(f.send('heavy',t),true);assert.equal(f.send('heavy',t+1,t+1),false);}
 assert.equal(f.host.claims.accepted,5);assert.equal(hp-f.s.m.hp,50);
});
test('older in-flight heavy cannot roll back an interruption watermark',()=>{
 const f=fixture('bow');assert.equal(f.send(0,100),true);f.at(150);f.s.p.state='roll';f.host.claims.observe(f.s.p,f.s);f.s.p.state='idle';f.at(151);
 assert.equal(f.send('heavy',120,151,15),true);f.at(160);assert.equal(f.send(0,145,160),true);
 f.at(165);const hp=f.s.m.hp;assert.equal(f.send(1,165),false);assert.equal(f.s.m.hp,hp);
});
test('bow heavy same-lane cadence does not weaken its existing 21-tick threshold',()=>{
 const f=fixture('bow');assert.equal(f.send('heavy',100,100,15),true);f.at(120);const hp=f.s.m.hp;
 assert.equal(f.send('heavy',120,120,15),false);assert.equal(f.s.m.hp,hp);
});
for(const weapon of ['gs','db','bow'])test(weapon+' chain minimum and grace/slack maximum boundaries are exact',()=>{
 const min=Math.floor(WTYPES[weapon].light[0].dur*.65*60),max=Math.ceil(WTYPES[weapon].light[0].dur*60)+15;
 for(const [delta,ok]of [[min-1,false],[min,true],[max,true],[max+1,false]]){const f=fixture(weapon);assert.equal(f.send(0,100),true);f.at(100+delta);assert.equal(f.send(1,100+delta),ok,'delta '+delta);}
});
test('accepted claim from another owner cannot prove a chain',()=>{
 const f=fixture('gs');assert.equal(f.send(0,100),true);f.at(140);const hp=f.s.m.hp;
 assert.equal(f.host.receive('b',envelope('hit','auth',1,{seq:1,hostTick:140,part:'body',raw:37.5,moveId:'light:1'})),false);assert.equal(f.s.m.hp,hp);
});
test('GS B entry and legal B/A branch predecessor retain exact authority path',()=>{
 const f=fixture('gs');f.at(110);const send=(node,t,seq)=>f.host.receive('a',envelope('hit','auth',seq,{seq,hostTick:t,part:'body',raw:(WTYPES.gs.light[node]||WTYPES.gs.combo.moves[node]).mv*30,moveId:'light:'+node}));
 assert.equal(send(3,110,1),true);f.at(152);assert.equal(send(1,152,2),true);f.at(200);assert.equal(send(4,200,3),true);assert.equal(f.host.claims.accepted,3);
});
for(const weapon of ['gs','db','bow'])test(weapon+' host-observed legal actions prove a missed predecessor without granting forged stages',()=>{
 const f=fixture(weapon);let seq=100;const action=(node,t)=>f.host.receive('a',envelope('hunterAction','auth',seq++,{id:'a',state:'atk',startTick:t,moveId:'light:'+node}));
 assert.equal(action(2,100),false);assert.equal(action(0,100),true);f.at(101);assert.equal(action(1,101),false);
 const next=100+Math.ceil(WTYPES[weapon].light[0].dur*.7*60);f.at(next);assert.equal(action(1,next),true);
 const impact=next+Math.ceil(WTYPES[weapon].light[1].h0*60);f.at(impact);const hp=f.s.m.hp;assert.equal(f.send(1,weapon==='bow'?next:impact,impact),true);assert.ok(f.s.m.hp<hp);
});
test('authorized bow launched before roll still lands, but cannot seed a post-roll higher stage',()=>{
 const f=fixture('bow');const action=(node,t,seq,state='atk')=>f.host.receive('a',envelope('hunterAction','auth',seq,{id:'a',state,startTick:t,moveId:'light:'+node}));
 assert.equal(action(0,100,100),true);f.at(125);assert.equal(action(1,125,101),true);f.at(140);assert.equal(action(1,140,102,'roll'),true);
 f.s.p.state='roll';f.host.claims.observe(f.s.p,f.s);f.at(150);assert.equal(f.send(1,125,150),true);const hp=f.s.m.hp;
 f.s.p.state='idle';f.at(160);assert.equal(f.send(2,160),false);assert.equal(f.s.m.hp,hp);
});
test('one observed DB normal action cannot authorize two spaced higher-stage contacts',()=>{
 const f=fixture('db'),act=(node,t,seq)=>f.host.receive('a',envelope('hunterAction','auth',seq,{id:'a',state:'atk',startTick:t,moveId:'light:'+node}));
 assert.equal(act(0,100,100),true);f.at(121);assert.equal(act(1,121,101),true);f.at(125);assert.equal(f.send(1,125),true);
 f.at(138);const hp=f.s.m.hp;assert.equal(f.send(1,138),false);assert.equal(f.s.m.hp,hp);
});
test('observed action seq replay, stale action and foreign identity never authorize a stage',()=>{
 const f=fixture('bow'),event={id:'a',state:'atk',startTick:100,moveId:'light:0'};
 assert.equal(f.host.receive('a',envelope('hunterAction','auth',100,event)),true);f.at(130);
 for(const [seq,payload]of [[100,{...event,startTick:130,moveId:'light:1'}],[101,{...event,id:'b',startTick:130,moveId:'light:1'}],[102,{...event,startTick:69,moveId:'light:1'}]])assert.equal(f.host.receive('a',envelope('hunterAction','auth',seq,payload)),false);
 const hp=f.s.m.hp;assert.equal(f.send(1,130),false);assert.equal(f.s.m.hp,hp);
});
