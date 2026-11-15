import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
register('./offline-loader.mjs',import.meta.url);
globalThis.self=globalThis;globalThis.location={search:''};globalThis.matchMedia=()=>({matches:false});
globalThis.document={hidden:false};globalThis.window={};
const T=await import('three');
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {syncHunterDb,groundArissa,DB_CLIPS}=await import('../js/db-motion.js?v=20261115ar');
const path=n=>new URL('../assets/'+n,import.meta.url);
async function parse(n){const b=fs.readFileSync(path(n)),loader=new GLTFLoader();loader.register(()=>({name:'CPU_TEXTURE_PLACEHOLDER',loadTexture:async()=>new T.Texture()}));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const arissa=await parse('hunter-arissa-db.glb'),paladin=await parse('hunter-db.glb');
let calls=[],pending=[];
GLTFLoader.prototype.loadAsync=function(url){calls.push(String(url));return new Promise((resolve,reject)=>pending.push({url:String(url),resolve,reject}));};
let generation=0;
async function fresh(){calls=[];pending=[];return import('../js/models.js?arissa-test-'+generation++);}
function settle(kind,value){const job=pending.find(x=>x.url.includes(kind));assert.ok(job,kind);if(value instanceof Error)job.reject(value);else job.resolve(value);}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const V=()=>new T.Vector3();
const palm=(b,side)=>b.bones[side+'Hand'].getWorldPosition(V()).add(b.bones[side+'HandMiddle1'].getWorldPosition(V())).multiplyScalar(.5);
const pose=(state,t,extra={})=>({weapon:'db',state,t,x:0,z:0,yaw:0,spin:0,inv:0,moving:0,...extra});
let measurements={};
test('Arissa shared single lazy request, live Paladin while pending, independent peer skeleton/mixer and original materials',async()=>{
 const m=await fresh();assert.equal(calls.length,0);assert.equal(m.hunterDbLoad.status,'idle');
 const a=m.buildHunter('db',1,1),b=m.buildHunter('db',5,5);assert.equal(a.skin,'procedural');assert.equal(a.skinState,'loading');
 const one=m.loadHunterDb();assert.equal(one,m.loadHunterDb());assert.equal(calls.filter(s=>s.includes('hunter-arissa-db')).length,1);assert.equal(calls.filter(s=>s.includes('hunter-db')).length,1);
 settle('hunter-db',paladin);await flush();assert.equal(a.skin,'paladin');assert.equal(b.skin,'paladin');assert.equal(a.skinState,'loading');
 settle('hunter-arissa-db',arissa);await Promise.all([a.ready,b.ready]);assert.equal(m.hunterDbLoad.status,'ready');assert.equal(a.skin,'arissa');assert.equal(a.skinState,'ready');
 assert.notEqual(a.db.mixer,b.db.mixer);assert.notEqual(a.db.bones.LeftHand,b.db.bones.LeftHand);assert.equal(a.db.model.scale.x,1);
 const sourceMeshes=[],actorMeshes=[];arissa.scene.traverse(o=>{if(o.isSkinnedMesh)sourceMeshes.push(o);});a.db.model.traverse(o=>{if(o.isSkinnedMesh)actorMeshes.push(o);});
 for(let i=0;i<actorMeshes.length;i++){const o=actorMeshes[i],s=sourceMeshes[i];assert.notEqual(o.skeleton,s.skeleton);assert.notEqual(o.geometry,s.geometry);assert.notEqual(o.material,s.material);assert.equal(o.material.map,s.material.map);assert.deepEqual(o.material.color.toArray(),s.material.color.toArray());assert.equal(o.material.opacity,s.material.opacity);}
 for(const [n,action]of Object.entries(a.db.actions))assert.equal(action.getClip(),arissa.animations.find(c=>c.name===n),'no second recovery authoring '+n);
 const rig=a.db.bones.LeftHandMiddle1.position.clone().multiplyScalar(.5);assert.ok(a.db.sockets.Left.position.distanceTo(rig)<1e-12);
 measurements.palmBoneLocal={Left:rig.toArray(),Right:a.db.bones.RightHandMiddle1.position.clone().multiplyScalar(.5).toArray()};
 const before=b.db.bones.RightHand.quaternion.clone();syncHunterDb(pose('atk',.3999,{cur:{h0:.4,h1:.4,dur:1.0666666666666667}}),a,0);assert.ok(before.equals(b.db.bones.RightHand.quaternion));
 a.dispose();b.dispose();const c=m.buildHunter('db',1,1);await c.ready;assert.equal(c.skin,'arissa');assert.equal(calls.length,2);c.dispose();
});
test('Arissa failure retains animated Paladin; double failure retains procedural; late results cannot revive disposed actors',async()=>{
 let m=await fresh(),h=m.buildHunter('db',1,1);settle('hunter-arissa-db',new Error('controlled 404'));settle('hunter-db',paladin);await h.ready;
 assert.equal(m.hunterDbLoad.status,'failed');assert.match(m.hunterDbLoad.error,/404/);assert.equal(h.skin,'paladin');assert.equal(h.skinState,'fallback');assert.equal(h.db.arissa,false);syncHunterDb(pose('idle',0),h,0);h.dispose();
 m=await fresh();h=m.buildHunter('db',1,1);settle('hunter-arissa-db',new Error('offline'));settle('hunter-db',new Error('offline'));await h.ready;assert.equal(h.skin,'procedural');assert.equal(h.skinState,'fallback');assert.equal(h.db,undefined);h.dispose();
 m=await fresh();h=m.buildHunter('db',1,1);h.dispose();settle('hunter-arissa-db',arissa);settle('hunter-db',paladin);await h.ready;await flush();assert.equal(h.skinState,'disposed');assert.equal(h.root.children.length,0);assert.equal(h.db,null);
 // Slower fallback must not replace a successful primary.
 m=await fresh();h=m.buildHunter('db',1,1);settle('hunter-arissa-db',arissa);await h.ready;settle('hunter-db',paladin);await flush();assert.equal(h.skin,'arissa');h.dispose();
});
test('Arissa actor disposal frees geometry/material/skeleton/mixer once and preserves cached textures, including scene/removal paths',async()=>{
 const m=await fresh(),h=m.buildHunter('db',1,1);settle('hunter-db',paladin);settle('hunter-arissa-db',arissa);await h.ready;
 syncHunterDb(pose('idle',0),h,0);const scene=new T.Scene();scene.add(h.root);const b=h.db,geos=new Set(),mats=new Set(),skins=new Set();let gd=0,md=0,sd=0,td=0;
 h.root.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const v of (Array.isArray(o.material)?o.material:[o.material]))if(v)mats.add(v);if(o.skeleton)skins.add(o.skeleton);});
 geos.forEach(g=>g.addEventListener('dispose',()=>gd++));mats.forEach(mat=>mat.addEventListener('dispose',()=>md++));skins.forEach(s=>{const original=s.dispose.bind(s);s.dispose=()=>{sd++;original();};});
 sourceTextures().forEach(t=>t.addEventListener('dispose',()=>td++));m.disposeHunterActors(scene);h.dispose();assert.equal(gd,geos.size);assert.equal(md,mats.size);assert.equal(sd,skins.size);assert.equal(td,0);assert.equal(b.mixer._actions.length,0);assert.equal(b.mixer._bindings.length,0);assert.equal(h.root.children.length,0);
 const remote=m.buildHunter('db',1,1);await remote.ready;scene.add(remote.root);scene.remove(remote.root);assert.equal(remote.skinState,'disposed');
 function sourceTextures(){const out=new Set();arissa.scene.traverse(o=>{for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat)for(const v of Object.values(mat))if(v?.isTexture)out.add(v);});return out;}
});

// CPU-only: exact production adapter, no pixels/GPU or visual approval.
async function actor(){const m=await fresh(),h=m.buildHunter('db',1,1);settle('hunter-db',paladin);settle('hunter-arissa-db',arissa);await h.ready;return {m,h,b:h.db};}
const support=b=>Math.min(...['LeftToeBase','RightToeBase'].map(n=>b.bones[n].getWorldPosition(V()).y));
function exact(h,name,time){const b=h.db;b.mixer.stopAllAction();b.model.position.y=0;const a=b.actions[name];a.reset().setEffectiveWeight(1).play();a.paused=true;a.time=time;b.mixer.update(0);groundArissa(b);h.root.updateMatrixWorld(true);}
function positions(b){return Object.fromEntries(Object.entries(b.bones).filter(([n])=>!n.startsWith('Cloak')).map(([n,o])=>[n,o.getWorldPosition(V())]));}
function maxGap(a,b){return Math.max(...Object.keys(a).map(n=>a[n].distanceTo(b[n])));}
test('Arissa exact approved bytes, sixteen unchanged original clip names and clocks, coherent cache stamps',()=>{
 const data=fs.readFileSync(path('hunter-arissa-db.glb'));assert.equal(data.length,8625928);assert.equal(createHash('sha256').update(data).digest('hex'),'f39412780e92e3c1de87b8f77f17fa884b2dcee655db99449ff323fe5d4c9cdd');
 assert.equal(arissa.animations.length,16);assert.deepEqual(arissa.animations.map(c=>c.name),paladin.animations.map(c=>c.name));
 for(const c of arissa.animations)assert.ok(Math.abs(c.duration-paladin.animations.find(x=>x.name===c.name).duration)<1e-6,c.name);
 const root=new URL('../',import.meta.url),html=fs.readFileSync(new URL('index.html',root),'utf8'),models=fs.readFileSync(new URL('js/models.js',root),'utf8');
 for(const n of ['main','game','models'])assert.ok(html.includes(n+'.js?v=20261115ar'));
 assert.ok(models.includes('db-motion.js?v=20261115ar'));assert.ok(models.includes('hunter-arissa-db.glb?v=20261115ar'));
 for(const n of ['main','game'])assert.ok(fs.readFileSync(new URL('js/'+n+'.js',root),'utf8').includes('20261115ar'));
 measurements.clips=arissa.animations.map(c=>({name:c.name,duration:c.duration}));
});
test('Arissa measured target palm/axis sockets reproduce supplied bind measurements with tiny active grip residual',async()=>{
 const {h,b}=await actor();const expected={Right:{p:[.48907649517059326,5.097354412078857,-.35972025990486145],q:[.019901467526767393,.05907292022110105,.7323719455198647,.6780454668400053]},Left:{p:[-.4890799820423126,5.097392559051514,-.3591868281364441],q:[.7323757910235428,.6780436612302508,.019936500103683547,.05903414394850448]}};
 for(const side of ['Left','Right']){assert.ok(b.sockets[side].position.distanceTo(new T.Vector3(...expected[side].p))<1e-10);assert.ok(b.sockets[side].quaternion.angleTo(new T.Quaternion(...expected[side].q))<1e-6);}
 for(const name of ['h','h2','h3','v','spin']){
  const cur={sw:name==='h3'?'h':name,h0:.2,h1:.7,dur:1};
  for(const [t,expected] of [[cur.h0,DB_CLIPS[name].impact[0]],[cur.h1,DB_CLIPS[name].impact[1]]]){
   syncHunterDb(pose('atk',t,{cur,combo:name==='h3'?2:0}),h,0);assert.ok(Math.abs(b.clipTime-expected)<1e-12,name+' authoritative marker');
  }
 }
 let residual=0;for(const name of ['h','h2','h3','v','spin'])for(let i=0;i<=40;i++){
  const cur={sw:name==='h3'?'h':name,h0:.2,h1:.7,dur:1},p=pose('atk',i/40,{cur,combo:name==='h3'?2:0,yaw:.7,x:3,z:-2});syncHunterDb(p,h,0);h.root.updateMatrixWorld(true);
  for(const side of ['Left','Right'])residual=Math.max(residual,b.sockets[side].getWorldPosition(V()).distanceTo(palm(b,side)));
 }
 assert.ok(residual<1e-8);measurements.gripMax=residual;measurements.sockets=Object.fromEntries(['Left','Right'].map(s=>[s,{palm:b.sockets[s].position.toArray(),quaternion:b.sockets[s].quaternion.toArray()}]));h.dispose();
});
test('Arissa production spin world Hips unwrap 1001 samples is exactly 720 degrees with single yaw owner',async()=>{
 const {h,b}=await actor(),cur={sw:'spin',h0:.25,h1:1.2,dur:1.7};let prev,total=0;
 for(let i=0;i<=1000;i++){
  syncHunterDb(pose('atk',cur.h0+(cur.h1-cur.h0)*i/1000,{cur}),h,0);h.root.updateMatrixWorld(true);
  const f=new T.Vector3(0,0,1).applyQuaternion(b.bones.Hips.getWorldQuaternion(new T.Quaternion())),angle=Math.atan2(f.x,f.z);
  if(prev!==undefined){let d=angle-prev;while(d>Math.PI)d-=2*Math.PI;while(d< -Math.PI)d+=2*Math.PI;total+=d;}prev=angle;
 }
 assert.ok(Math.abs(total-4*Math.PI)<1e-7);assert.equal(b.actions.spin.getClip(),arissa.animations.find(c=>c.name==='spin'));measurements.spinDegrees=total*180/Math.PI;h.dispose();
});
test('Arissa sole zero-first floor owner: endpoint recovery continuity, paused repeats, interrupted states; Paladin helper retained',async()=>{
 const {h,b}=await actor();let maxEndpointGap=0,mappedEndpointGap=0;
 for(const name of ['down','spin']){
  exact(h,name,b.actions[name].getClip().duration);const end=positions(b),lift=b.model.position.y;
  for(let i=0;i<20;i++){b.model.position.y=55;groundArissa(b);assert.ok(Math.abs(b.model.position.y-lift)<1e-12);}
  exact(h,'idle',0);const gap=maxGap(end,positions(b));maxEndpointGap=Math.max(maxEndpointGap,gap);assert.ok(gap<1e-6,name);
 }
 // Also verify the actual mapper's endpoint clocks, including the shorter
 // legacy metadata duration rather than assuming GLB duration == DB_CLIPS.
 for(const name of ['down','spin']){
  exact(h,'idle',0);const ready=positions(b);b.key=null;
  const p=name==='down'?pose('down',1.15):pose('atk',1.7,{cur:{sw:'spin',h0:.25,h1:1.2,dur:1.7}});
  syncHunterDb(p,h,0);const gap=maxGap(ready,positions(b));mappedEndpointGap=Math.max(mappedEndpointGap,gap);assert.ok(gap<1e-6,name+' mapped endpoint gap='+gap);
  // Crossfade evaluation and interruption reuse exactly the same toe owner.
  b.idleTime=0;syncHunterDb(pose('idle',0),h,0);for(const dt of [0,.025,.025,.05]){syncHunterDb(pose('idle',0),h,dt);assert.ok(support(b)>-1e-9);}
 }
 // Real mapper's down endpoint and settled ready endpoint (not only direct clips).
 syncHunterDb(pose('down',1.15),h,1);const down=positions(b);b.idleTime=0;syncHunterDb(pose('idle',0),h,0);const immediateGap=maxGap(down,positions(b));assert.ok(immediateGap<1e-6);
 syncHunterDb(pose('idle',0),h,0);assert.ok(maxGap(down,positions(b))<1e-6);
 let repeatDelta=0;for(const state of ['down','roll','dead','stun','idle']){
  syncHunterDb(pose(state,.31),h,.2);const y=b.model.position.y;for(let i=0;i<20;i++){syncHunterDb(pose(state,.31),h,0);repeatDelta=Math.max(repeatDelta,Math.abs(y-b.model.position.y));}
  assert.equal(h.root.position.y,0);assert.ok(support(b)>-1e-9);assert.equal(b.groundOffset,undefined);assert.equal(b.recoveryLift,undefined);
 }
 assert.ok(repeatDelta<1e-12);h.dispose();
 const m=await fresh(),fallback=m.buildHunter('db',1,1);settle('hunter-arissa-db',new Error('404'));settle('hunter-db',paladin);await fallback.ready;
 syncHunterDb(pose('atk',.5,{cur:{sw:'spin',h0:.2,h1:.7,dur:1}}),fallback,0);assert.ok(Math.abs(support(fallback.db)-.035)<1e-8);assert.equal(fallback.db.arissa,false);fallback.dispose();
 measurements.floor={maxEndpointGap,mappedEndpointGap,immediateGap,repeatDelta};
});
test('Arissa actual exported cloak vertices retain minus twenty millimetres across fixed regression samples',async()=>{
 const {h,b}=await actor(),meshes=[];b.model.traverse(m=>{if(m.isSkinnedMesh)meshes.push(m)});let minY=Infinity,poses=0,vertices=0;
 const fixtures={h:[.4593966797,.5744596],h2:[.4593966797,.5744596],v:[.3739372385,.7076757],dead:[.9863233905,.9946915913,1.0072438926],roll:[.6202970711,.7802970712],hit:[.1600460251,.3325983264],down:[1.6872426778,1.8566485356],stun:[.141,.1551046]};
 for(const c of arissa.animations){const times=[0,c.duration,...Array.from({length:10},(_,i)=>c.duration*(i+.371)/10.371),...(fixtures[c.name]||[])];for(const t of times){exact(h,c.name,t);let y=Infinity;for(const m of meshes){m.skeleton.update();for(let i=0;i<m.geometry.attributes.position.count;i++){const v=m.getVertexPosition(i,V()).applyMatrix4(m.matrixWorld);assert.ok(v.toArray().every(Number.isFinite));y=Math.min(y,v.y);vertices++;}}assert.ok(y>=-.020,c.name+'@'+t+': '+y);minY=Math.min(minY,y);poses++;}}
 measurements.cloak={minY,poses,vertices};h.dispose();
});
test('Arissa active blade edge measurement is reported, not silently fixed or claimed edge-first',async()=>{
 const {h,b}=await actor();const edge={};
 for(const name of ['h','h3','spin'])for(const side of ['Left','Right']){const [a,z]=DB_CLIPS[name].impact,values=[];const cur={sw:name==='h3'?'h':name,h0:a,h1:z,dur:DB_CLIPS[name].duration};
  const tip=t=>{syncHunterDb(pose('atk',t,{cur,combo:name==='h3'?2:0}),h,0);h.root.updateMatrixWorld(true);return b.sockets[side].localToWorld(new T.Vector3(0,-.86,0));};
  for(let i=0;i<Math.ceil(z*239);i++){const t=(i+.371)/239;if(t<a||t>z)continue;const v=tip(t+.001).sub(tip(t-.001)).multiplyScalar(500);tip(t);const n=new T.Vector3(0,0,1).applyQuaternion(b.sockets[side].getWorldQuaternion(new T.Quaternion()));if(v.length()>.1)values.push(Math.abs(n.dot(v.normalize())));}
  edge[name+' '+side]={max:Math.max(...values),mean:values.reduce((a,v)=>a+v,0)/values.length,samples:values.length};assert.ok(values.length>0);assert.ok(values.every(x=>Number.isFinite(x)&&x<=1.00000001));
 }
 measurements.edge=edge;h.dispose();
});
test('Arissa real Hunt and remote production adapter preserve simulation/save at 30/60/144 Hz',async()=>{
 const {Hunt}=await import('bh/game'),{QUESTS}=await import('../js/data.js');calls=[];pending=[];let frames=0;
 for(const hz of [30,60,144]){const save={weapon:'db',w:{db:1,gs:1,bow:1},armor:1},saved=JSON.stringify(save),el=new Proxy({}, {get:(o,k)=>o[k]??={style:{},classList:{toggle(){}}}});
 const hunt=new Hunt({shadowMap:{enabled:false},render(){}},QUESTS[0],save,{el,setMon(){},toast(){},dmg(){},flash(){}},{isTouch:false,take(){return false},takeLook(){return {x:0,y:0}},sample(){return {}}},()=>{});
 if(hunt.H.skin!=='arissa'){settle('hunter-db',paladin);settle('hunter-arissa-db',arissa);}await hunt.H.ready;hunt.skipRender=true;for(let i=0;i<hz;i++){hunt.frame(1/hz);assert.equal(hunt.H.skin,'arissa');frames++;}assert.equal(hunt.sim.tick,60);
 const before=JSON.stringify(hunt.sim.snapshot()),remote=(await import('bh/models')).buildHunter('db',1,1);await remote.ready;hunt.scene.add(remote.root);
 for(const state of ['idle','charge','atk','roll','drink','hit','stun','down','dead'])for(let i=0;i<=hz;i++){hunt.syncHunter(pose(state,i/hz,{cur:{sw:'h',h0:.12,h1:.28,dur:.5},combo:0}),remote,1/hz,{});remote.root.updateMatrixWorld(true);assert.ok(remote.db.bones.RightHand.matrixWorld.elements.every(Number.isFinite));assert.ok(support(remote.db)>-1e-8);assert.equal(remote.root.position.y,0);}
 for(const [dx,dz,key]of [[0,1,'walkF'],[0,-1,'walkB'],[1,0,'walkL'],[-1,0,'walkR']]){remote.db.lastPos={x:0,z:0};syncHunterDb(pose('idle',.5,{moving:1,walk:1,x:dx,z:dz}),remote,1);assert.equal(remote.db.dirW[key],1);}
 assert.equal(JSON.stringify(hunt.sim.snapshot()),before);assert.equal(JSON.stringify(save),saved);const mx=remote.db.mixer;hunt.dispose();assert.equal(remote.skinState,'disposed');assert.equal(hunt.H.skinState,'disposed');assert.equal(mx._bindings.length,0);
 }
 assert.equal(calls.filter(s=>s.includes('hunter-arissa-db')).length,1);measurements.huntFrames=frames;
 console.log('R16 Arissa measurements: '+JSON.stringify(measurements));if(process.env.ARISSA_REPORT)fs.writeFileSync(process.env.ARISSA_REPORT,JSON.stringify(measurements,null,2));
});
