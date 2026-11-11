import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {GuestSession} from '../js/net/guest.js';
import {HostSession} from '../js/net/host.js';
import {QUESTS} from '../js/data.js';
import {FixedClock,interpolatePose} from '../js/fixed.js';
import {envelope} from '../js/net/protocol.js';
const save={weapon:'gs',w:{gs:5,db:5,bow:5},armor:5};
function setup(){const out=[],sent=[];const h=new HostSession({quest:QUESTS[0],roster:{a:{save},b:{save}},hunt:'h',host:'a',transport:{sendState:p=>out.push(p),sendEvent:p=>out.push(p)}});const g=new GuestSession({quest:QUESTS[0],save,hunt:'h',host:'a',uid:'b',transport:{sendState:p=>sent.push(p),sendEvent:p=>sent.push(p)}});h.initial();g.receive('a',out.shift(),0);return {h,g,out,sent};}
function hard(x){x.g.suspend(0);x.g.service(0);x.g.service(5000);x.h.receive('b',x.sent.findLast(p=>p.type==='hardResync'));return x.out.at(-1);}
const src=fs.readFileSync(new URL('../js/game.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export { R_ARENA };','').replace('export class Hunt','class Hunt');
function presentation(x){const ctx={performance:{now:()=>5001},document:{hidden:false},interpolatePose,Math};vm.createContext(ctx);vm.runInContext(src+';this.Hunt=Hunt',ctx);const h=Object.create(ctx.Hunt.prototype),sim=x.g.sim;const pos=()=>({set(x,y,z){Object.assign(this,{x,y,z});}});const mesh=()=>({position:pos(),rotation:{},scale:{set(){},setScalar(){}},material:{color:{setHex(){}}}});Object.assign(h,{session:x.g,sim,localId:'b',in:{take:()=>false,clear(){},sample:()=>({})},updCam(){},ticker:new FixedClock(),parts:[],arena:{update(){}},syncModels(){},updHud(){},presentEvents(){},skipRender:true,H:{root:mesh()},G:{root:mesh()},projPool:[mesh()],arrowPool:[mesh()]});for(const k of ['m','clock','stop','slow','projs','arrows'])Object.defineProperty(h,k,{get:()=>sim[k]});h.previous=sim.snapshot();return h;}
for(const dt of [1/120,1/60])test('P1 first visible hard restore uses authoritative owner monster and projectile poses dt='+dt,()=>{const x=setup(),full=hard(x),s=x.g.sim;for(const p of [s.p,s.m])p.x=30;s.projs=[{id:99,x:30,y:1,z:0}];s.arrows=[{id:100,x:30,z:0,yaw:0,frac:0}];const h=presentation(x);h.frame(0);assert.equal(h.G.root.visible,false);full.payload.snapshot.m.x=-20;full.payload.snapshot.players.find(p=>p.id==='b').x=-20;full.payload.snapshot.projs=[{id:99,x:-20,y:1,z:0,rad:1}];full.payload.snapshot.arrows=[{id:100,x:-20,z:0,yaw:0,frac:0}];assert.ok(x.g.receive('a',full,5001));h.frame(dt);assert.equal(h.G.root.visible,true);for(const mesh of [h.G.root,h.H.root,h.projPool[0],h.arrowPool[0]])assert.equal(mesh.position.x,-20);assert.equal(h.fixedSteps,0);assert.equal(h.previous.m.x,-20);});
test('P2 terminal end stops all hard retries',()=>{const x=setup();hard(x);x.g.receive('a',envelope('end','h',100,{startTick:0,win:true,time:12,carts:0,broke:{},delay:0}),5001);const before=x.sent.filter(p=>p.type==='hardResync').length;for(const t of [5500,6500,8500,15000])x.g.service(t);assert.equal(x.sent.filter(p=>p.type==='hardResync').length,before);assert.equal(x.g.recovery,null);});
test('P3 hitch boundary excludes 249ms and includes 250ms',()=>{for(const gap of [249,250]){const x=setup();x.g.rep.clock.offset=null;x.g.service(0);x.g.service(gap);assert.equal(!!x.g.recovery,gap===250,'gap='+gap);}});
