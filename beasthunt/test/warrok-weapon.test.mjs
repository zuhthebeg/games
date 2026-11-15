// R13a Warrok bone-cleaver gates (CPU skinning, production bytes, render-only).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
register('./offline-loader.mjs',import.meta.url);
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
const {QUESTS,MONSTERS}=await import('../js/data.js');
function hunt(){
 const el=new Proxy({}, {get:(o,k)=>o[k]??={style:{},classList:{toggle(){}}}});
 return new Hunt({shadowMap:{enabled:false},render(){}},QUESTS[6],{weapon:'db',w:{db:1,gs:1,bow:1},armor:1},{el,setMon(){},toast(){},dmg(){},flash(){}},{isTouch:false,take(){return false;},takeLook(){return {x:0,y:0};},sample(){return {};}},()=>{});
}
const V=()=>new T.Vector3();
function bonesOf(model){const b={};model.traverse(o=>{if(o.isBone)b[o.name]=o;});return b;}
function knucklePalm(bones,prefix){return ['Index1','Middle1','Ring1','Pinky1'].map(n=>bones[prefix+n].position.clone()).reduce((a,v)=>a.add(v),V()).multiplyScalar(.125);}
function frustumOf(h){h.cam.updateMatrixWorld(true);return new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(h.cam.projectionMatrix,h.cam.matrixWorldInverse));}
function segPoint(seg0,seg1,p){const s=seg1.clone().sub(seg0),t=Math.max(0,Math.min(1,p.clone().sub(seg0).dot(s)/s.lengthSq()));return seg0.clone().addScaledVector(s,t);}

test('Warrok cleaver: socketed grip, clip-swept reach/ground/left-hand metrics, finite in frustum',async()=>{
 const h=hunt();h.frame(1/60);
 assert.equal(h.G.weapon,null,'no weapon on the capsule fallback');
 resolveLoad();await h.G.ready;assert.ok(h.G.warrok&&h.G.weapon&&h.G.weaponSocket);
 const socket=h.G.weaponSocket,weapon=h.G.weapon,model=h.G.warrok.model;
 assert.equal(socket.parent.name,'mixamorigRightHand','socket must ride the right-hand bone');
 let tris=0;const mats=new Set();weapon.traverse(o=>{if(o.isMesh){tris+=o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3;mats.add(o.material);}});
 assert.ok(tris<=200,'cleaver triangles '+tris+' <= 200 (also within R21 300)');
 for(const m of mats){assert.equal(m.map,null,'procedural material stays texture-free');}
 const bones=bonesOf(model),RH=bones['mixamorigRightHand'],LH=bones['mixamorigLeftHand'],hips=bones['mixamorigHips'];
 const palm=knucklePalm(bones,'mixamorigRightHand'),lPalm=knucklePalm(bones,'mixamorigLeftHand');
 const tip=weapon.getObjectByName('warrok-weapon-tip'),pommel=weapon.getObjectByName('warrok-weapon-pommel');
 assert.ok(tip&&pommel,'weapon must expose tip/pommel markers');
 const skinned=(()=>{let m=null;model.traverse(o=>{if(o.isSkinnedMesh)m=o;});return m;})();
 const rhIndex=skinned.skeleton.bones.indexOf(RH),fistIdx=[];
 const si=skinned.geometry.attributes.skinIndex,sw=skinned.geometry.attributes.skinWeight;
 for(let i=0;i<si.count;i++){let bi=-1,bw=0;for(let j=0;j<4;j++)if(sw.getComponent(i,j)>bw){bw=sw.getComponent(i,j);bi=si.getComponent(i,j);}if(bi===rhIndex)fistIdx.push(i);}
 assert.ok(fistIdx.length>10,'right-hand skinned verts found: '+fistIdx.length);
 const ATK=new Set(['bite','stomp','sweep','leap']);
 const MODES=['idle','walk','run','bite','stomp','sweep','charge','leap','spit','fireball','breath','roar','flinch','topple','dead'];
 const rep={};let gripMax=0,fistMax=0,tipMinAtk=1e9,tipMinAll=1e9,reachMax=0;
 for(const mode of MODES){
  h.m.state='idle';h.m.t=0;h.m.moving=0;h.m.enr=false;h.m.atk=null;
  if(['walk','run'].includes(mode)){h.m.state='chase';h.m.moving=1;h.m.enr=mode==='run';}
  else if(['roar','flinch','topple','dead'].includes(mode)){h.m.state=mode;h.m.dur=4.6;}
  else if(mode!=='idle')h.sim.startMonAtk(mode);
  const r={tipMin:1e9,pommelMin:1e9,reach:0,leftMin:1e9,leftMax:0,torsoMin:1e9};
  for(let i=0;i<=12;i++){
   const duration=h.m.atk?(h.m.atk.w+h.m.atk.a+h.m.atk.r):['idle','walk','run'].includes(mode)?h.G.warrok.actions[mode].getClip().duration:4.6;
   h.m.t=i/12*duration;h.syncModels(duration/12);h.scene.updateMatrixWorld(true);
   assert.ok(socket.matrixWorld.elements.every(Number.isFinite),mode+' socket matrix finite');
   const gw=socket.getWorldPosition(V()),tw=tip.getWorldPosition(V()),pw=pommel.getWorldPosition(V());
   const rp=RH.localToWorld(palm.clone()),lp=LH.localToWorld(lPalm.clone()),hp=hips.getWorldPosition(V());
   gripMax=Math.max(gripMax,gw.distanceTo(rp));
   let fd=1e9;const fv=V();for(const vi of fistIdx){skinned.getVertexPosition(vi,fv).applyMatrix4(skinned.matrixWorld);fd=Math.min(fd,fv.distanceTo(gw));}
   fistMax=Math.max(fistMax,fd);
   r.pommelMin=Math.min(r.pommelMin,pw.y);r.tipMin=Math.min(r.tipMin,tw.y);tipMinAll=Math.min(tipMinAll,tw.y);
   if(ATK.has(mode))tipMinAtk=Math.min(tipMinAtk,tw.y);
   const reach=Math.hypot(tw.x-hp.x,tw.z-hp.z);r.reach=Math.max(r.reach,reach);reachMax=Math.max(reachMax,reach);
   const ld=lp.distanceTo(segPoint(gw,pw,lp));r.leftMin=Math.min(r.leftMin,ld);r.leftMax=Math.max(r.leftMax,ld);
   for(let s=0;s<=4;s++){const bp=gw.clone().lerp(tw,.34+s*.165);let dd=1e9;const vv=V();
    for(let vi=0;vi<skinned.geometry.attributes.position.count;vi++){skinned.getVertexPosition(vi,vv).applyMatrix4(skinned.matrixWorld);dd=Math.min(dd,vv.distanceTo(bp));}
    r.torsoMin=Math.min(r.torsoMin,dd);}
   const wb=new T.Box3().setFromObject(socket);
   assert.ok(frustumOf(h).intersectsBox(wb),mode+' weapon in frustum');
  }
  rep[mode]=r;
 }
 console.log('R13a measurements:',JSON.stringify({gripMax:+gripMax.toFixed(4),fistMax:+fistMax.toFixed(3),tipMinAtk:+tipMinAtk.toFixed(3),tipMinAll:+tipMinAll.toFixed(3),reachMax:+reachMax.toFixed(2),perClip:Object.fromEntries(Object.entries(rep).map(([k,r])=>[k,{tipMin:+r.tipMin.toFixed(3),reach:+r.reach.toFixed(2),left:[+r.leftMin.toFixed(2),+r.leftMax.toFixed(2)],torsoMin:+r.torsoMin.toFixed(3)}]))}));
 assert.ok(gripMax<=.02,'grip residual max '+gripMax.toFixed(4)+'m <= 0.02m');
 assert.ok(fistMax<=.3,'grip inside fist shell, nearest hand vert '+fistMax.toFixed(3)+'m');
 assert.ok(tipMinAtk>=-.05,'attack clip tip penetration '+tipMinAtk.toFixed(3)+'m >= -0.05m');
 const sweepR=MONSTERS.warrok.dims.sweepR;
 // Triangle inequality: scale the previous accepted reach envelope, then
 // add only the physical blade-length delta not already scaled with the body.
 // R21: body stays x1.25; physical palm-to-tip length is 2.43*2=4.86m.
 const renderReach = 1.25*(sweepR+.3) + (2.43*2-1.25*1.35);
 assert.ok(reachMax<=renderReach,'render-only tip reach '+reachMax.toFixed(2)+'m <= '+renderReach);
 assert.ok(Math.abs(weapon.scale.x-1.8)<1e-12);
 assert.ok(Math.abs(tip.position.y*weapon.scale.y-2.43*2)<1e-12);
 for(const [mode,r] of Object.entries(rep)){
  assert.ok(r.pommelMin>=-.05,mode+' unchanged pommel floor '+r.pommelMin);
  assert.ok(r.tipMin>=(['stomp','leap'].includes(mode)?-.15:-.05),mode+' R21 tip floor '+r.tipMin);
 }
 h.dispose();
});

test('cleaver lifecycle: no weapon on failed/absent asset, geometry+materials released on dispose',async()=>{
 const h=hunt();resolveLoad();await h.G.ready;assert.ok(h.G.weapon);
 let geoDisposed=0,matDisposed=0;
 h.G.weapon.traverse(o=>{if(o.isMesh){o.geometry.addEventListener('dispose',()=>geoDisposed++);o.material.addEventListener('dispose',()=>matDisposed++);}});
 h.dispose();assert.ok(geoDisposed>0&&matDisposed>0,'dispose releases cleaver geometry and materials');
 const failed=await import('../js/models.js?w-failure-probe');fail=true;
 const W=failed.buildWarrok();resolveLoad();await W.ready;
 assert.equal(W.warrok,null);assert.equal(W.weapon,null,'failed asset never gains a cleaver');
 fail=false;
 const late=await import('../js/models.js?w-late-probe');const L=late.buildWarrok();
 L.dispose();resolveLoad();await L.ready;
 assert.equal(L.warrok,null);assert.equal(L.weapon,null,'late upgrade after dispose builds no cleaver');
});

// Original R20 handle/guard/pommel primitives and transforms, independently
// reconstructed: blade enlargement must never scale or translate these parts.
test('R21 blade-only extension preserves original handle guard pommel and measured socket',async()=>{
 const h=hunt();if(!h.G.warrok)resolveLoad();await h.G.ready;const {weapon,weaponSocket:socket,warrok}=h.G;
 const bytes=fs.readFileSync(new URL('../assets/warrok.glb',import.meta.url));
 const bind=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 bind.scene.updateMatrixWorld(true);const bones=bonesOf(bind.scene);
 assert.deepEqual(socket.position.toArray(),knucklePalm(bones,'mixamorigRightHand').toArray());
 // Socket is measured before attaching to the (simulation-scaled) actor root.
 assert.ok(Math.abs(socket.scale.x-1/(bones.mixamorigRightHand.getWorldScale(V()).x*warrok.model.scale.x))<1e-12);
 const kn=['Index1','Middle1','Ring1','Pinky1'].map(n=>bones['mixamorigRightHand'+n]);
 const axis=kn[0].position.clone().sub(kn[3].position).normalize();
 const finger=bones.mixamorigRightHandMiddle2.getWorldPosition(V()).sub(bones.mixamorigRightHandMiddle1.getWorldPosition(V())).normalize().applyQuaternion(bones.mixamorigRightHand.getWorldQuaternion(new T.Quaternion()).invert());
 const normal=axis.clone().cross(finger).normalize(),X=new T.Vector3().crossVectors(axis,normal).normalize();
 const expectedSocket=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(X,axis,normal));
 assert.ok(1-Math.abs(socket.quaternion.dot(expectedSocket))<1e-12);
 // Socket is authored in the bind pose; its quaternion is already fixed. Axis
 // alignment is independent of later animation and remains exact in bone space.
 const socketAxis=new T.Vector3(0,1,0).applyQuaternion(socket.quaternion);
 assert.ok(socketAxis.distanceTo(axis)<1e-12);
 assert.ok(finger.toArray().every(Number.isFinite));
 const rigid=weapon.children.filter(o=>o.isMesh&&o.name!=='warrok-cleaver-blade');
 assert.equal(rigid.length,3);const expected=[
  {geo:new T.CylinderGeometry(.05,.048,1.13,6),p:[0,-.185,0]},
  {geo:new T.SphereGeometry(.08,5,3),p:[0,-.8,0]},
  {geo:new T.SphereGeometry(.075,5,3),p:[0,.42,0]}
 ];
 for(let i=0;i<3;i++){const a=rigid[i],e=expected[i];assert.deepEqual(Array.from(a.geometry.attributes.position.array),Array.from(e.geo.attributes.position.array));assert.deepEqual(Array.from(a.geometry.index.array),Array.from(e.geo.index.array));assert.ok(a.position.distanceTo(new T.Vector3(...e.p))<1e-12);assert.deepEqual(a.scale.toArray(),[1,1,1]);assert.ok(a.quaternion.angleTo(new T.Quaternion())<1e-12);e.geo.dispose();}
 assert.deepEqual(weapon.scale.toArray(),[1.8,1.8,1.8]);
 assert.deepEqual(weapon.getObjectByName('warrok-weapon-pommel').position.toArray(),[0,-.75,0]);
 const blade=weapon.getObjectByName('warrok-cleaver-blade');
 assert.deepEqual(blade.position.toArray(),[0,.35,0]);assert.deepEqual(blade.scale.toArray(),[1.5,1.5,2.35]);
 assert.ok(Math.abs(weapon.getObjectByName('warrok-weapon-tip').position.y*1.8-4.86)<1e-12);
 h.dispose();
});
