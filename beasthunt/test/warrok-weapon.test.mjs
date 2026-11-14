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
 assert.ok(tris<=200,'cleaver triangles '+tris+' <= 200');
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
  const r={tipMin:1e9,reach:0,leftMin:1e9,leftMax:0,torsoMin:1e9};
  for(let i=0;i<=12;i++){
   const duration=h.m.atk?(h.m.atk.w+h.m.atk.a+h.m.atk.r):['idle','walk','run'].includes(mode)?h.G.warrok.actions[mode].getClip().duration:4.6;
   h.m.t=i/12*duration;h.syncModels(duration/12);h.scene.updateMatrixWorld(true);
   assert.ok(socket.matrixWorld.elements.every(Number.isFinite),mode+' socket matrix finite');
   const gw=socket.getWorldPosition(V()),tw=tip.getWorldPosition(V()),pw=pommel.getWorldPosition(V());
   const rp=RH.localToWorld(palm.clone()),lp=LH.localToWorld(lPalm.clone()),hp=hips.getWorldPosition(V());
   gripMax=Math.max(gripMax,gw.distanceTo(rp));
   let fd=1e9;const fv=V();for(const vi of fistIdx){skinned.getVertexPosition(vi,fv).applyMatrix4(skinned.matrixWorld);fd=Math.min(fd,fv.distanceTo(gw));}
   fistMax=Math.max(fistMax,fd);
   r.tipMin=Math.min(r.tipMin,tw.y);tipMinAll=Math.min(tipMinAll,tw.y);
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
 assert.ok(reachMax<=sweepR+.3,'tip horizontal reach '+reachMax.toFixed(2)+'m <= sweepR+0.3');
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
