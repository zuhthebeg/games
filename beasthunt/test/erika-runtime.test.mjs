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
const {syncHunterBow}=await import('../js/bow-motion.js?v=20261117mt1');
const path=n=>new URL('../assets/'+n,import.meta.url);
async function parse(n){const b=fs.readFileSync(path(n)),loader=new GLTFLoader();loader.register(()=>({name:'CPU_TEXTURE_PLACEHOLDER',loadTexture:async()=>new T.Texture()}));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const erika=await parse('hunter-erika-bow.glb'),paladin=await parse('hunter-bow.glb');
let calls=[],pending=[];
GLTFLoader.prototype.loadAsync=function(url){calls.push(String(url));return new Promise((resolve,reject)=>pending.push({url:String(url),resolve,reject}));};
let generation=0;
async function fresh(){calls=[];pending=[];return import('../js/models.js?erika-test-'+generation++);}
function settle(kind,value){const job=pending.find(x=>x.url.includes(kind));assert.ok(job,kind);if(value instanceof Error)job.reject(value);else job.resolve(value);}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const V=()=>new T.Vector3();
const palm=(b,side)=>b.bones[side+'Hand'].getWorldPosition(V()).add(b.bones[side+'HandMiddle1'].getWorldPosition(V())).multiplyScalar(.5);
const pose=(state,t,extra={})=>({weapon:'bow',state,t,x:0,z:0,yaw:0,spin:0,inv:0,moving:0,...extra});
let measurements={};
test('Erika shared single lazy request, live Paladin while pending, independent peer skeleton/mixer and original materials',async()=>{
 const m=await fresh();assert.equal(calls.length,0);assert.equal(m.hunterBowLoad.status,'idle');
 const a=m.buildHunter('bow',1,1),b=m.buildHunter('bow',5,5);assert.equal(a.skin,'procedural');assert.equal(a.skinState,'loading');
 const one=m.loadHunterBow();assert.equal(one,m.loadHunterBow());assert.equal(calls.filter(s=>s.includes('hunter-erika-bow')).length,1);assert.equal(calls.filter(s=>s.includes('hunter-bow')).length,1);
 settle('hunter-bow',paladin);await flush();assert.equal(a.skin,'paladin');assert.equal(b.skin,'paladin');assert.equal(a.skinState,'loading');
 settle('hunter-erika-bow',erika);await Promise.all([a.ready,b.ready]);assert.equal(m.hunterBowLoad.status,'ready');assert.equal(a.skin,'erika');assert.equal(a.skinState,'ready');
 assert.notEqual(a.bow.mixer,b.bow.mixer);assert.notEqual(a.bow.bones.LeftHand,b.bow.bones.LeftHand);assert.equal(a.bow.model.scale.x,1);
 const sourceMeshes=[],actorMeshes=[];erika.scene.traverse(o=>{if(o.isSkinnedMesh)sourceMeshes.push(o);});a.bow.model.traverse(o=>{if(o.isSkinnedMesh)actorMeshes.push(o);});
 for(let i=0;i<actorMeshes.length;i++){const o=actorMeshes[i],s=sourceMeshes[i];assert.notEqual(o.skeleton,s.skeleton);assert.notEqual(o.geometry,s.geometry);assert.notEqual(o.material,s.material);assert.equal(o.material.map,s.material.map);assert.deepEqual(o.material.color.toArray(),s.material.color.toArray());assert.equal(o.material.opacity,s.material.opacity);}
 for(const [n,action]of Object.entries(a.bow.actions))assert.equal(action.getClip(),erika.animations.find(c=>c.name===n),'no second recovery authoring '+n);
 const rig=a.bow.bones.LeftHandMiddle1.position.clone().multiplyScalar(.5);assert.ok(a.bow.socket.position.distanceTo(rig)<1e-12);
 measurements.palmBoneLocal={Left:rig.toArray(),Right:a.bow.bones.RightHandMiddle1.position.clone().multiplyScalar(.5).toArray()};
 const before=b.bow.bones.RightHand.quaternion.clone();syncHunterBow(pose('atk',.3999,{cur:{h0:.4,h1:.4,dur:1.0666666666666667}}),a,0);assert.ok(before.equals(b.bow.bones.RightHand.quaternion));
 a.dispose();b.dispose();const c=m.buildHunter('bow',1,1);await c.ready;assert.equal(c.skin,'erika');assert.equal(calls.length,2);c.dispose();
});
test('Erika failure retains animated Paladin; double failure retains procedural; late results cannot revive disposed actors',async()=>{
 let m=await fresh(),h=m.buildHunter('bow',1,1);settle('hunter-erika-bow',new Error('controlled 404'));settle('hunter-bow',paladin);await h.ready;
 assert.equal(m.hunterBowLoad.status,'failed');assert.match(m.hunterBowLoad.error,/404/);assert.equal(h.skin,'paladin');assert.equal(h.skinState,'fallback');assert.equal(h.bow.erika,false);syncHunterBow(pose('idle',0),h,0);h.dispose();
 m=await fresh();h=m.buildHunter('bow',1,1);settle('hunter-erika-bow',new Error('offline'));settle('hunter-bow',new Error('offline'));await h.ready;assert.equal(h.skin,'procedural');assert.equal(h.skinState,'fallback');assert.equal(h.bow,undefined);h.dispose();
 m=await fresh();h=m.buildHunter('bow',1,1);h.dispose();settle('hunter-erika-bow',erika);settle('hunter-bow',paladin);await h.ready;await flush();assert.equal(h.skinState,'disposed');assert.equal(h.root.children.length,0);assert.equal(h.bow,null);
 // Slower fallback must not replace a successful primary.
 m=await fresh();h=m.buildHunter('bow',1,1);settle('hunter-erika-bow',erika);await h.ready;settle('hunter-bow',paladin);await flush();assert.equal(h.skin,'erika');h.dispose();
});
test('Erika actor disposal frees geometry/material/skeleton/mixer once and preserves cached textures, including scene/removal paths',async()=>{
 const m=await fresh(),h=m.buildHunter('bow',1,1);settle('hunter-bow',paladin);settle('hunter-erika-bow',erika);await h.ready;
 syncHunterBow(pose('idle',0),h,0);const scene=new T.Scene();scene.add(h.root);const b=h.bow,geos=new Set(),mats=new Set(),skins=new Set();let gd=0,md=0,sd=0,td=0;
 h.root.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const v of (Array.isArray(o.material)?o.material:[o.material]))if(v)mats.add(v);if(o.skeleton)skins.add(o.skeleton);});
 geos.forEach(g=>g.addEventListener('dispose',()=>gd++));mats.forEach(mat=>mat.addEventListener('dispose',()=>md++));skins.forEach(s=>{const original=s.dispose.bind(s);s.dispose=()=>{sd++;original();};});
 sourceTextures().forEach(t=>t.addEventListener('dispose',()=>td++));m.disposeHunterActors(scene);h.dispose();assert.equal(gd,geos.size);assert.equal(md,mats.size);assert.equal(sd,skins.size);assert.equal(td,0);assert.equal(b.mixer._actions.length,0);assert.equal(b.mixer._bindings.length,0);assert.equal(h.root.children.length,0);
 const remote=m.buildHunter('bow',1,1);await remote.ready;scene.add(remote.root);scene.remove(remote.root);assert.equal(remote.skinState,'disposed');
 function sourceTextures(){const out=new Set();erika.scene.traverse(o=>{for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat)for(const v of Object.values(mat))if(v?.isTexture)out.add(v);});return out;}
});
test('Erika actual production adapter marker aim/contact at four yaws, exact release boundary and zero-first recovery',async()=>{
 const m=await fresh(),h=m.buildHunter('bow',1,1);settle('hunter-bow',paladin);settle('hunter-erika-bow',erika);await h.ready;
 const cur={h0:.4,h1:.4,dur:1.0666666666666667};let gripMax=0,nockMax=0,stringMax=0;const aims=[];
 for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
  syncHunterBow(pose('atk',.3999,{cur,yaw}),h,0);const b=h.bow;h.root.updateMatrixWorld(true);
  const axis=new T.Vector3(0,1,0).applyQuaternion(b.nockArrow.getWorldQuaternion(new T.Quaternion())).normalize(),forward=new T.Vector3(0,0,1).applyAxisAngle(new T.Vector3(0,1,0),yaw);
  const degrees=Math.acos(T.MathUtils.clamp(axis.dot(forward),-1,1))*180/Math.PI;aims.push(degrees);assert.ok(degrees<.001);assert.equal(b.stringHeld,true);assert.equal(b.nockArrow.visible,true);
  gripMax=Math.max(gripMax,b.socket.getWorldPosition(V()).distanceTo(palm(b,'Left')));nockMax=Math.max(nockMax,b.socket.localToWorld(b.nockPos.clone()).distanceTo(palm(b,'Right')));
  for(const [mesh,tip] of [[b.string.top,new T.Vector3(.22,.62,.02)],[b.string.bot,new T.Vector3(.22,-.62,.02)]]){stringMax=Math.max(stringMax,mesh.localToWorld(new T.Vector3(0,-.5,0)).distanceTo(b.socket.localToWorld(tip)),mesh.localToWorld(new T.Vector3(0,.5,0)).distanceTo(palm(b,'Right')));}
  syncHunterBow(pose('atk',.4,{cur,yaw}),h,0);assert.equal(b.nockArrow.visible,false);assert.equal(b.stringHeld,false);
 }
 assert.ok(gripMax<1e-8);assert.ok(nockMax<1e-8);assert.ok(stringMax<1e-8);
 syncHunterBow(pose('charge',1.2),h,1);const end=['Left','Right'].map(s=>palm(h.bow,s));syncHunterBow(pose('atk',0,{cur:{h0:.06666666666666667,h1:.1,dur:.4666666666666667,charge:1}}),h,0);const gap=Math.max(...end.map((v,i)=>v.distanceTo(palm(h.bow,['Left','Right'][i]))));assert.ok(gap<1e-6);
 syncHunterBow(pose('down',1.15),h,1);const a=h.bow.model.position.y;for(let i=0;i<20;i++)syncHunterBow(pose('down',1.15),h,0);assert.equal(h.bow.model.position.y,a);assert.equal(h.root.position.y,0);
 measurements={...measurements,aimDegrees:aims,gripMax,nockMax,stringMax,chargeReleaseGap:gap};h.dispose();
});
test('Erika CPU skin: every actual vertex over fourteen clips and production cadence poses is finite and in frustum',async()=>{
 const m=await fresh(),h=m.buildHunter('bow',1,1);settle('hunter-bow',paladin);settle('hunter-erika-bow',erika);await h.ready;
 const b=h.bow,meshes=[];b.model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});let vertices=0,poses=0,minY=Infinity,maxY=-Infinity,maxHeight=0;
 const scene=new T.Scene();scene.add(h.root);const cam=new T.PerspectiveCamera(58,1,.2,420);cam.position.set(0,3,8);cam.lookAt(0,1,0);cam.updateMatrixWorld(true);const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse));
 const check=()=>{h.root.updateMatrixWorld(true);const box=new T.Box3();for(const mesh of meshes){for(let i=0;i<mesh.geometry.attributes.position.count;i++){const v=mesh.getVertexPosition(i,V()).applyMatrix4(mesh.matrixWorld);assert.ok(v.toArray().every(Number.isFinite));box.expandByPoint(v);vertices++;}}assert.ok(frustum.intersectsBox(box));assert.ok(box.max.y-box.min.y<3);minY=Math.min(minY,box.min.y);maxY=Math.max(maxY,box.max.y);maxHeight=Math.max(maxHeight,box.max.y-box.min.y);poses++;};
 // Actual source clips, dense enough off-grid samples to expose skin/bounds mistakes;
 // timing/contact coverage above uses the real production mapper, not this sampler.
 for(const clip of erika.animations){b.mixer.stopAllAction();const ac=b.mixer.clipAction(clip);ac.reset().setLoop(T.LoopOnce,1);ac.clampWhenFinished=true;ac.play();for(let i=0;i<=12;i++){b.model.position.y=0;ac.time=i===12?clip.duration:clip.duration*(i+.371)/12.371;b.mixer.update(0);check();}}
 for(const hz of [30,60,144]){b.key=null;for(let i=0;i<=hz;i++){const p=i<hz/2?pose('charge',i/hz):pose('atk',(i-hz/2)/hz,{cur:{h0:.06666666666666667,h1:.1,dur:.4666666666666667,charge:1}});syncHunterBow(p,h,1/hz);if(i%Math.ceil(hz/12)===0)check();}}
 const bytes=fs.readFileSync(path('hunter-erika-bow.glb'));assert.equal(createHash('sha256').update(bytes).digest('hex'),'dcd3155b1716962eb30979091a12100e9c35af11170e63a715e78e9a5cec59ac');
 measurements={...measurements,cpu:{poses,vertices,minY,maxY,maxHeight,meshCount:meshes.length,vertexCount:meshes.reduce((n,o)=>n+o.geometry.attributes.position.count,0)},bytes:bytes.length};console.log('R15 Erika measurements: '+JSON.stringify(measurements));
 if(process.env.ERIKA_REPORT)fs.writeFileSync(process.env.ERIKA_REPORT,JSON.stringify(measurements,null,2));h.dispose();
});

test('Erika real Hunt uses unchanged bow simulation and remote render entry; every mapped state is finite at 30/60/144Hz',async()=>{
 const {Hunt}=await import('bh/game'),{QUESTS}=await import('../js/data.js');
 calls=[];pending=[];let frameCount=0;
 for(const hz of [30,60,144]){
  const save={weapon:'bow',w:{bow:1,gs:1,db:1},armor:1},saved=JSON.stringify(save);
  const el=new Proxy({}, {get:(o,k)=>o[k]??={style:{},classList:{toggle(){}}}});
  const h=new Hunt({shadowMap:{enabled:false},render(){}},QUESTS[6],save,{el,setMon(){},toast(){},dmg(){},flash(){}},{isTouch:false,take(){return false;},takeLook(){return {x:0,y:0};},sample(){return {};}},()=>{});
  if(h.H.skin!=='erika'){settle('hunter-bow',paladin);settle('hunter-erika-bow',erika);}await h.H.ready;h.skipRender=true;
  for(let i=0;i<hz;i++){h.frame(1/hz);assert.equal(h.H.skin,'erika');assert.equal(h.H.root.parent,h.scene);frameCount++;}
  assert.equal(h.sim.tick,60);const before=JSON.stringify(h.sim.snapshot());
  const remote=(await import('bh/models')).buildHunter('bow',1,1);await remote.ready;h.scene.add(remote.root);
  for(const state of ['idle','charge','atk','roll','drink','hit','stun','down','dead']){
   const seconds={idle:1,charge:1.2,atk:1.0666666666666667,roll:.62,drink:1.25,hit:.42,stun:1.25,down:1.15,dead:2.3}[state];
   for(let i=0;i<=hz;i++){const p=pose(state,seconds*i/hz,{cur:{h0:.4,h1:.4,dur:1.0666666666666667},id:'peer'});h.syncHunter(p,remote,1/hz,{});remote.root.updateMatrixWorld(true);assert.ok(remote.root.matrixWorld.elements.every(Number.isFinite));assert.ok(remote.bow.bones.RightHand.matrixWorld.elements.every(Number.isFinite));assert.equal(remote.root.position.y,0);}
  }
  for(const [dx,dz,key]of [[0,1,'walkF'],[0,-1,'walkB'],[1,0,'walkL'],[-1,0,'walkR']]){
   remote.bow.lastPos={x:0,z:0};syncHunterBow(pose('idle',.5,{moving:1,walk:1,x:dx,z:dz}),remote,1);assert.equal(remote.bow.dirW[key],1);
  }
  assert.equal(JSON.stringify(h.sim.snapshot()),before,'local/remote presentation must not mutate authoritative snapshots');assert.equal(JSON.stringify(save),saved);const mixer=remote.bow.mixer;h.dispose();assert.equal(remote.skinState,'disposed');assert.equal(h.H.skinState,'disposed');assert.equal(mixer._bindings.length,0);
 }
 assert.equal(calls.filter(s=>s.includes('hunter-erika-bow')).length,1);console.log('R15 real Hunt cadence frames: '+frameCount);
});
