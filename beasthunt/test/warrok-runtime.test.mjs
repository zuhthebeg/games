import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
register('./offline-loader.mjs',import.meta.url);
// CPU-only: image decode is not a pixel/render proof. GLB geometry, skin,
// animations and materials below are the unchanged production bytes.
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:2048,height:2048});
globalThis.location={search:''};globalThis.document={hidden:false};globalThis.window={};
const T=await import('three');
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
let resolveLoad;let fail=false;
GLTFLoader.prototype.loadAsync=async function(url){
 if(!String(url).includes('warrok.glb'))return null;
 await new Promise(r=>resolveLoad=r);
 if(fail)throw new Error('controlled offline failure');
 const b=fs.readFileSync(new URL('../assets/warrok.glb',import.meta.url));
 return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
};
const {Hunt}=await import('bh/game');
const {QUESTS}=await import('../js/data.js');
function hunt(){
 const el=new Proxy({}, {get:(o,k)=>o[k]??={style:{},classList:{toggle(){}}}});
 return new Hunt({shadowMap:{enabled:false},render(){}},QUESTS[6],{weapon:'db',w:{db:1,gs:1,bow:1},armor:1},{el,setMon(){},toast(){},dmg(){},flash(){}},{isTouch:false,take(){return false;},takeLook(){return {x:0,y:0};},sample(){return {};}},()=>{});
}
function bounds(h){h.scene.updateMatrixWorld(true);const box=new T.Box3();h.G.root.traverse(o=>{if(o.isMesh){const v=new T.Vector3();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);box.expandByPoint(v.applyMatrix4(o.matrixWorld));}}});return box;}
function finiteBox(box){assert.ok([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite));}
function inFrustum(h,box){h.cam.updateMatrixWorld(true);return new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(h.cam.projectionMatrix,h.cam.matrixWorldInverse)).intersectsBox(box);}
test('production Hunt Warrok: delayed fallback, true skinned scale and every animation in frustum',async()=>{
 const h=hunt();h.frame(1/60);assert.equal(h.G.warrok,null);finiteBox(bounds(h));assert.ok(inFrustum(h,bounds(h)));assert.equal(h.G.root.parent,h.scene);
 let placeholderDisposed=0;h.G.body.children[0].geometry.addEventListener('dispose',()=>placeholderDisposed++);
 resolveLoad();await h.G.ready;assert.equal(placeholderDisposed,1,'streamed placeholder geometry must be released');
 assert.ok(h.G.warrok);assert.ok(h.G.warrok.model.scale.x<3,'normalization must measure updated cloned bones, not identity bone matrices');
 const staticBox=bounds(h);
 // Old 6m envelope scaled by 1.25 plus the blade+pommel excess beyond body scaling.
 assert.ok(staticBox.max.y-staticBox.min.y<6*1.25+(1.35+.8)*(1.8-1.25));
 const fixture=JSON.parse(fs.readFileSync(new URL('./warrok-runtime-baseline.json',import.meta.url)));
 assert.ok(Math.abs(h.G.warrok.model.scale.x-fixture.normalization.after*1.25)<1e-10);
 for(const mode of ['idle','walk','run','bite','stomp','sweep','charge','leap','spit','fireball','breath','roar','flinch','topple','dead']){
  h.m.state='idle';h.m.t=0;h.m.moving=0;h.m.enr=false;h.m.atk=null;
  if(['walk','run'].includes(mode)){h.m.state='chase';h.m.moving=1;h.m.enr=mode==='run';}
  else if(['roar','flinch','topple','dead'].includes(mode)){h.m.state=mode;h.m.dur=4.6;}
  else if(mode!=='idle')h.sim.startMonAtk(mode);
  for(let i=0;i<=12;i++){
   const duration=h.m.atk?(h.m.atk.w+h.m.atk.a+h.m.atk.r):['idle','walk','run'].includes(mode)?h.G.warrok.actions[mode].getClip().duration:4.6;
   h.m.t=i/12*duration;
   h.syncModels(duration/12);h.scene.updateMatrixWorld(true);
   assert.ok([...h.G.root.matrixWorld.elements].every(Number.isFinite),mode);
   const b=bounds(h);finiteBox(b);assert.ok(b.max.y-b.min.y<9,mode+' height');assert.ok(b.max.y<12,mode+' altitude');
   h.cam.updateMatrixWorld(true);const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(h.cam.projectionMatrix,h.cam.matrixWorldInverse));assert.ok(frustum.intersectsBox(b),mode+' frustum');
  }
 }
 let mesh;h.G.root.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});assert.ok(mesh.material.map);assert.ok(mesh.material.normalMap);assert.equal(mesh.material.opacity,1);assert.equal(mesh.material.transparent,false);const bytes=fs.readFileSync(new URL('../assets/warrok.glb',import.meta.url));const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));assert.equal(mesh.skeleton.bones.length,gltf.skins[0].joints.length);
 h.dispose();
});

test('failed asset retains attached finite fallback, disposed hunt never receives a late upgrade',async()=>{
 const failed=await import('../js/models.js?failure-probe');fail=true;const W=failed.buildWarrok();const scene=new T.Scene();scene.add(W.root);resolveLoad();await W.ready;assert.equal(failed.warrokLoadState.status,'failed');assert.equal(W.warrok,null);scene.updateMatrixWorld(true);finiteBox(new T.Box3().setFromObject(W.root));assert.ok(W.body.children[0].visible);
 const h=hunt();h.G.dispose();h.scene.remove(h.G.root);h.G=W;h.scene.add(W.root);h.frame(1/60);finiteBox(bounds(h));assert.ok(inFrustum(h,bounds(h)));assert.equal(W.root.parent,h.scene);h.dispose();
 fail=false;const late=await import('../js/models.js?late-probe');const L=late.buildWarrok();assert.equal(typeof L.dispose,'function','async upgrade must expose cancellation for Hunt disposal');L.dispose();resolveLoad();await L.ready;assert.equal(L.warrok,null);
});

test('Warrok source bytes and affected transitive URLs are pinned without relaxing oracles',async()=>{
 const {createHash}=await import('node:crypto');const fixture=JSON.parse(fs.readFileSync(new URL('./warrok-runtime-baseline.json',import.meta.url)));
 const bytes=fs.readFileSync(new URL('../'+fixture.asset,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.sha256);
 const g=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));assert.equal(g.skins[0].joints.length,fixture.joints);assert.equal(g.images.length,fixture.images);assert.equal(g.animations.length,fixture.clips);
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');for(const key of ['bh/models','bh/game','main'])assert.ok(html.includes(fixture.cache[key].replace(/v=[^/]+$/,'v=20261117wl1')));assert.ok(main.includes(fixture.cache.debug.replace('20261115ww','20261117wl1')));
});
test('real Hunt frame/interpolation and reversible speed stay finite at 30/60/144Hz',async()=>{
 const {attachHuntDebug}=await import('../js/hunt-debug.js');
 for(const hz of [30,60,144])for(const speed of [.25,.5,1,2]){
  const h=hunt();await h.G.ready;const d=attachHuntDebug(h,{search:'?debug=1'});d.set('speed',speed);h.skipRender=true;
  for(let i=0;i<hz;i++){h.frame(1/hz);assert.ok([h.m.x,h.m.y,h.m.z,h.m.yaw,h.m.spin,...h.G.root.position.toArray(),h.G.root.rotation.y,...h.G.root.scale.toArray()].every(Number.isFinite));assert.equal(h.G.root.parent,h.scene);}
  assert.equal(h.sim.tick,60*speed);finiteBox(bounds(h));h.dispose();assert.equal(h.debug,undefined);
 }
});
