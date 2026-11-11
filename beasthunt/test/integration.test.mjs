import test from 'node:test';
import assert from 'node:assert/strict';
import {HostSession} from '../js/net/host.js';
import {GuestSession} from '../js/net/guest.js';
import {envelope} from '../js/net/protocol.js';
import {QUESTS} from '../js/data.js';
const save={weapon:'gs',w:{gs:5,db:5,bow:5},armor:5};
function fixture(){const packets=[];const host=new HostSession({quest:QUESTS[0],roster:{a:{save},b:{save}},hunt:'h',host:'a',transport:{sendState:p=>packets.push(p),sendEvent:p=>packets.push(p)}});const guest=new GuestSession({quest:QUESTS[0],save,hunt:'h',host:'a',uid:'b',transport:{sendState:()=>{},sendEvent:()=>{}}});return {host,guest,packets};}
test('fresh reconnect respawns owner rather than restoring incomplete attacking puppet',()=>{const {host,guest,packets}=fixture();const p=host.sim.players[1];p.state='atk';p.cur=null;p.hp=7;host.cartSeq.set('b',2);host.initial();assert.equal(guest.receive('a',packets[0],100),true);assert.equal(guest.sim.p.state,'idle');assert.equal(guest.sim.p.hp,guest.sim.p.maxHp);assert.equal(guest.cart,2);assert.doesNotThrow(()=>guest.tick({},110));});
test('later full resync never corrects live owner position',()=>{const {host,guest,packets}=fixture();host.initial();guest.receive('a',packets[0],100);guest.sim.p.x=123;host.initial();guest.receive('a',packets.at(-1),200);assert.equal(guest.sim.p.x,123);});
test('authority events from nonhost cannot end or restore local hunt',()=>{const {host,guest,packets}=fixture();host.initial();assert.equal(guest.receive('b',packets[0],100),false);guest.receive('a',packets[0],100);assert.equal(guest.receive('b',envelope('end','h',99,{startTick:0,win:true}),101),false);assert.equal(guest.sim.over,false);});
test('full snapshot after world end produces existing result on reconnect',()=>{const {host,guest,packets}=fixture();host.sim.finish(true,0);host.initial();guest.receive('a',packets[0],100);const events=guest.tick({},101);assert.equal(guest.sim.win,true);assert.ok(events.some(e=>e.type==='result'));});
