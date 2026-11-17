import {createCanvasElement} from './canvas-stub.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {register} from 'node:module';register('./offline-loader.mjs',import.meta.url);
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:2048,height:2048});globalThis.location={search:''};globalThis.document={hidden:false,createElement:createCanvasElement};globalThis.window={};
const T=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const requests=[],assets={},pending=new Map();let fail=false;
GLTFLoader.prototype.loadAsync=async function(url){const name=String(url).includes('/monsters/')?String(url).split('/monsters/')[1].split('.glb')[0]:null;if(!name)return null;requests.push(name);await new Promise(r=>pending.set(name,r));if(fail){fail=false;throw Error('offline');}const b=fs.readFileSync(new URL('../assets/monsters/'+name+'.glb',import.meta.url));return assets[name]=await this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const {buildMonsterActor}=await import('../js/monster-actor.js');const {Hunt}=await import('bh/game');const {QUESTS}=await import('../js/data.js');const {MA}=await import('../js/sim.js');
function bounds(root){root.updateMatrixWorld(true);const box=new T.Box3(),v=new T.Vector3();root.traverse(o=>{if(o.isMesh)for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);box.expandByPoint(v.applyMatrix4(o.matrixWorld));}});return box;}
test('selected-only real GLB loader: three different rigs, 13 clips, finite in-place grounded state timeline',async()=>{
 assert.deepEqual(requests,[]);
 for(const [id,name,joints,height] of [['boar','Maw',64,3.7],['frost','Mutant',37,4.37],['ember','Pumpkinhulk',66,5.67]]){
 const a=buildMonsterActor(id,height);assert.equal(a.status,'loading');assert.equal(requests.at(-1),name);pending.get(name)();await a.ready;assert.equal(a.status,'ready',a.error);
 let bones=0;a.motion.model.traverse(o=>{if(o.isBone)bones++;});assert.equal(bones,joints);assert.equal(Object.keys(a.motion.actions).length,13);
 a.motion.sync({state:'idle',t:0},0);a.root.updateMatrixWorld(true);const anchors={};a.motion.model.traverse(o=>{if(o.isBone&&['mixamorigHead','mixamorigLeftHand','mixamorigRightHand'].includes(o.name))anchors[o.name]=o.getWorldPosition(new T.Vector3()).toArray();});// Real skinned head/hands must fall inside their matching projected contact disks.
 const sim=new (await import('../js/sim.js')).Sim(QUESTS.find(q=>q.mon===id),{weapon:'gs',w:{gs:1,db:1,bow:1},armor:1},1);sim.m.x=sim.m.z=sim.m.yaw=0;
 for(const [bone,v]of Object.entries(anchors)){const part=bone.includes('Head')?'head':'arms';assert.ok(sim.mParts().some(c=>c.n===part&&Math.hypot(c.x-v[0],c.z-v[2])<=c.r),name+' '+bone+' outside '+part);}
 console.log(name+' anchors '+JSON.stringify(anchors));
 let minimum=Infinity,maximum=-Infinity;
 for(const mode of ['idle','walk','run','roar','flinch','topple','dead',...Object.keys(MA)]){
 const m={state:'idle',t:0,moving:0,dur:4.6,enr:false};if(['walk','run'].includes(mode)){m.state='chase';m.moving=1;m.enr=mode==='run';}else if(MA[mode]){m.state='atk';m.atk=MA[mode];m.ak=mode;}else m.state=mode;
 const dur=m.atk?m.atk.w+m.atk.a+m.atk.r:4.6;
 for(const f of [0,.13,.33,.51,.79,.99]){m.t=dur*f;a.motion.sync(m,1/60);const b=bounds(a.root);assert.ok([...b.min.toArray(),...b.max.toArray()].every(Number.isFinite));minimum=Math.min(minimum,b.min.y);maximum=Math.max(maximum,b.max.y);assert.ok(b.max.y<height*1.5,name+' authored pose envelope');assert.ok(b.min.y>-.065,name+' '+mode+' floor '+b.min.y);assert.ok(Math.max(Math.abs(b.min.x),Math.abs(b.max.x),Math.abs(b.min.z),Math.abs(b.max.z))<height*1.8,name+' '+mode+' '+JSON.stringify([b.min.toArray(),b.max.toArray()]));}
 }
 const attack={state:'atk',ak:'bite',atk:MA.bite,t:MA.bite.w};a.root.position.set(17,1.5,-9);a.root.rotation.y=.83;a.motion.sync(attack,0);const first=bounds(a.root);for(let i=0;i<40;i++)a.motion.sync(attack,0);const repeated=bounds(a.root);assert.ok(first.min.distanceTo(repeated.min)<1e-8);assert.ok(first.max.distanceTo(repeated.max)<1e-8);const action=a.motion.current;assert.ok(Math.abs(action.time-MA.bite.w/(MA.bite.w+MA.bite.a+MA.bite.r)*action.getClip().duration)<1e-8);assert.ok(repeated.min.y>=1.49);a.root.position.set(0,0,0);a.root.rotation.y=0;
 console.log(name+' floorMin='+minimum.toFixed(4)+' maxY='+maximum.toFixed(3));
 const b=buildMonsterActor(id,height);await b.ready;assert.notEqual(a.motion.model,b.motion.model);let templateDisposed=0;assets[name].scene.traverse(o=>{o.geometry?.addEventListener('dispose',()=>templateDisposed++);});a.dispose();a.dispose();assert.equal(templateDisposed,0);assert.equal(b.status,'ready');b.motion.sync({state:'idle',t:0},0);b.dispose();
 }
 assert.deepEqual(requests,['Maw','Mutant','Pumpkinhulk']);
});
test('dispose before async completion cancels late actor; failed load can retry',async()=>{
 let a=buildMonsterActor('practice',3.7);a.dispose();fail=true;pending.get('OrcChainBrute')();await a.ready;assert.equal(a.status,'disposed');assert.equal(a.root.children.length,0);
 fail=true;a=buildMonsterActor('practice',3.7);pending.get('OrcChainBrute')();await a.ready;assert.equal(a.status,'failed');assert.match(a.error,/offline/);a.dispose();
 a=buildMonsterActor('practice',3.7);pending.get('OrcChainBrute')();await a.ready;assert.equal(a.status,'ready',a.error);
 assert.equal(assets.OrcChainBrute.parser.json.skins[0].joints.length,13);assert.equal(Object.keys(a.motion.actions).length,7);
 for(const mode of ['idle','walk','flinch','dead','bite','stomp','sweep','charge','leap'])for(const f of [0,.25,.5,.75,.99]){const m=MA[mode]?{state:'atk',ak:mode,atk:MA[mode],t:f*(MA[mode].w+MA[mode].a+MA[mode].r)}:{state:mode==='walk'?'chase':mode,moving:mode==='walk'?1:0,t:f*4.6,dur:4.6};a.motion.sync(m,1/60);const b=bounds(a.root);assert.ok([...b.min.toArray(),...b.max.toArray()].every(Number.isFinite));assert.ok(b.min.y>-.065);}
 a.dispose();
});
test('actual Hunt frame blocks combat and input until required opponent is ready',async()=>{
 const el=new Proxy({}, {get:(o,k)=>o[k]??={style:{},classList:{toggle(){}}}});let clears=0,samples=0;
 const h=new Hunt({shadowMap:{enabled:false},render(){}},QUESTS[0],{weapon:'db',w:{gs:1,db:1,bow:1},armor:1},{el,setMon(){},toast(){},dmg(){},flash(){}},{isTouch:false,clear(){clears++;},take(){return false;},takeLook(){return {x:0,y:0};},sample(){samples++;return {}; }},()=>{});
 h.frame(1/60);assert.equal(h.sim.tick,0);assert.equal(samples,0);assert.ok(clears>0);pending.get('Maw')();await h.G.ready;h.frame(1/60);assert.equal(h.sim.tick,1);h.dispose();
});

function harness(q=QUESTS[0],session=null,practice=null){const el=new Proxy({}, {get:(o,k)=>o[k]??={style:{},classList:{toggle(){}}}});return new Hunt({shadowMap:{enabled:false},render(){}},q,{weapon:'db',w:{gs:1,db:1,bow:1},armor:1},{el,setMon(){},toast(){},dmg(){},flash(){}},{isTouch:false,clear(){},take(){return false;},takeLook(){return {x:0,y:0};},sample(){return {}; }},()=>{},session,practice);}
test('actual CPU Hunt adapter 30/60/144Hz gives identical 600-tick production anatomy and no presentation mutation',async()=>{const states=[];for(const hz of [30,60,144]){const h=harness();await h.G.ready;h.sim.rng=123;for(let i=0;i<hz*10;i++)h.frame(1/hz);assert.equal(h.sim.tick,600);states.push(h.sim.snapshot());const before=JSON.stringify(h.sim.snapshot());h.syncModels(1/60);h.updCam(1/60);h.updHud();h.syncProjectiles(.5);assert.equal(JSON.stringify(h.sim.snapshot()),before);h.dispose();}assert.deepEqual(states[0],states[1]);assert.deepEqual(states[1],states[2]);});
test('actual cooperative Hunt renders the same selected main actor for host and guest ownership',async()=>{const {GuestSession}=await import('../js/net/guest.js');for(const uid of ['a','b'])for(const q of QUESTS.slice(0,3)){const save={weapon:'db',w:{gs:1,db:1,bow:1},armor:1},session=new GuestSession({quest:q,save,hunt:'h',host:'a',uid,transport:{sendState(){},sendEvent(){}}}),h=harness(q,session);pending.get({boar:'Maw',frost:'Mutant',ember:'Pumpkinhulk'}[q.mon])?.();await h.G.ready;assert.equal(h.G.status,'ready');assert.equal(h.G.motion.model.children.length>0,true);assert.equal(h.sim,session.sim);assert.equal(h.def.actor,{boar:'Maw',frost:'Mutant',ember:'Pumpkinhulk'}[q.mon]);h.dispose();}});
