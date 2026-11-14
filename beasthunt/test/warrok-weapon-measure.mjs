// R13a measurement probe: derive Warrok right-hand socket constants from the
// production GLB and its 13 retargeted greatsword clips. No guessed constants.
import fs from 'node:fs';
import {register} from 'node:module';
register('./offline-loader.mjs',import.meta.url);
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:2048,height:2048});
globalThis.location={search:''};globalThis.document={hidden:false};globalThis.window={};
const T=await import('three');
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {clone:cloneSkeleton}=await import('three/addons/utils/SkeletonUtils.js');
const {MONSTERS}=await import('bh/data');
const b=fs.readFileSync(new URL('../assets/warrok.glb',import.meta.url));
const asset=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const model=cloneSkeleton(asset.scene);
model.updateMatrixWorld(true);
const box=new T.Box3().setFromObject(model);
const d=MONSTERS.warrok.dims;
const h=box.max.y-box.min.y,k=(d.h*2)/h;
model.scale.setScalar(k);model.position.y=-box.min.y*k;
model.updateMatrixWorld(true);
console.log('rawHeight',h.toFixed(4),'k',k.toFixed(4));

const bones={};model.traverse(o=>{if(o.isBone)bones[o.name]=o;});
const RH=bones['mixamorigRightHand'],LH=bones['mixamorigLeftHand'];
console.log('RightHand?',!!RH,'LeftHand?',!!LH,'names sample:',Object.keys(bones).slice(0,3));
for(const n of ['Index1','Middle1','Ring1','Pinky1','Thumb1','Middle2']){
 const bn=bones['mixamorigRightHand'+n];
 console.log('RightHand'+n,bn?bn.position.toArray().map(v=>+v.toFixed(4)).join(','):'MISSING');
}
console.log('RH worldScale',RH.getWorldScale(new T.Vector3()).x.toFixed(4));

const knuckles=['Index1','Middle1','Ring1','Pinky1'].map(n=>bones['mixamorigRightHand'+n].position.clone());
const knuckleMean=knuckles.reduce((a,v)=>a.add(v),new T.Vector3()).multiplyScalar(1/knuckles.length);
console.log('knuckleMean(RH local)',knuckleMean.toArray().map(v=>+v.toFixed(4)).join(','),'len',knuckleMean.length().toFixed(4));
const palmLocal=knuckleMean.clone().multiplyScalar(.5);
const leftPalmLocal=['Index1','Middle1','Ring1','Pinky1'].map(n=>bones['mixamorigLeftHand'+n].position.clone()).reduce((a,v)=>a.add(v),new T.Vector3()).multiplyScalar(.25).multiplyScalar(.5);

const mixer=new T.AnimationMixer(model);
const SAMPLES=13,V=()=>new T.Vector3();
for(const clip of asset.animations){
 const a=mixer.clipAction(clip);a.reset();a.play();a.paused=true;
 const axes=[],reaches=[],heights=[],lrd=[];
 for(let i=0;i<SAMPLES;i++){
  a.time=clip.duration*i/(SAMPLES-1)*0.999;mixer.update(0);model.updateMatrixWorld(true);
  const rp=RH.localToWorld(palmLocal.clone()),lp=LH.localToWorld(leftPalmLocal.clone());
  const hv=lp.clone().sub(rp);lrd.push(hv.length());
  const q=RH.getWorldQuaternion(new T.Quaternion()).invert();
  axes.push(hv.clone().normalize().applyQuaternion(q));
  reaches.push(Math.hypot(rp.x,rp.z));heights.push(rp.y);
 }
 a.stop();
 const avg=axes.reduce((s,v)=>s.add(v),V());
 if(avg.length()<1e-6){console.log(clip.name,'axis degenerate L-R~0');continue;}
 avg.normalize();
 const spread=Math.max(...axes.map(v=>v.angleTo(avg)*180/Math.PI));
 console.log(clip.name.padEnd(7),'axis',avg.toArray().map(v=>+v.toFixed(3)).join(','),'sprd',spread.toFixed(1),'rchMax',Math.max(...reaches).toFixed(2),'palmY',Math.min(...heights).toFixed(2)+'-'+Math.max(...heights).toFixed(2),'L-R',Math.min(...lrd).toFixed(2)+'-'+Math.max(...lrd).toFixed(2));
}

// Part 2: does the armature/hips translate inside clips? Reach is judged vs monster origin.
const hips=bones['mixamorigHips'],arm=bones['mixamorigRightArm'],fore=bones['mixamorigRightForeArm'];
for(const clip of asset.animations){
 const a=mixer.clipAction(clip);a.reset();a.play();a.paused=true;
 let hx=[1e9,-1e9],hz=[1e9,-1e9],hy=[1e9,-1e9],armLen=null;
 for(let i=0;i<SAMPLES;i++){
  a.time=clip.duration*i/(SAMPLES-1)*0.999;mixer.update(0);model.updateMatrixWorld(true);
  const hp=hips.getWorldPosition(V());
  hx=[Math.min(hx[0],hp.x),Math.max(hx[1],hp.x)];hz=[Math.min(hz[0],hp.z),Math.max(hz[1],hp.z)];hy=[Math.min(hy[0],hp.y),Math.max(hy[1],hp.y)];
  if(armLen===null){const rp=RH.localToWorld(palmLocal.clone());armLen=arm.getWorldPosition(V()).distanceTo(rp);}
 }
 a.stop();
 console.log(clip.name.padEnd(7),'hips x',hx.map(v=>v.toFixed(2)).join('..'),'z',hz.map(v=>v.toFixed(2)).join('..'),'y',hy.map(v=>v.toFixed(2)).join('..'),'armLen',armLen.toFixed(2));
}

// Part 3: verify haft axis == knuckle line (Index1->Pinky1) during true two-hand phases.
const GS_CLIPS=['walk','run','roar','swipe','smash','spin','rush','leap','cast'];
const idx1=bones['mixamorigRightHandIndex1'].position,pnk1=bones['mixamorigRightHandPinky1'].position,mid1=bones['mixamorigRightHandMiddle1'].position,mid2=bones['mixamorigRightHandMiddle2'];
const knuckleDir=idx1.clone().sub(pnk1).normalize();
const fingerDir=mid2.position.clone().sub(mid1.clone()).normalize();
console.log('knuckleDir RH-local',knuckleDir.toArray().map(v=>+v.toFixed(3)).join(','));
console.log('fingerDir RH-local',fingerDir.toArray().map(v=>+v.toFixed(3)).join(','));
const palmNormal=knuckleDir.clone().cross(fingerDir).normalize();
console.log('palmNormal(knuckle x finger)',palmNormal.toArray().map(v=>+v.toFixed(3)).join(','));
for(const clip of asset.animations){
 if(!GS_CLIPS.includes(clip.name))continue;
 const a=mixer.clipAction(clip);a.reset();a.play();a.paused=true;
 const good=[];
 for(let i=0;i<SAMPLES;i++){
  a.time=clip.duration*i/(SAMPLES-1)*0.999;mixer.update(0);model.updateMatrixWorld(true);
  const rp=RH.localToWorld(palmLocal.clone()),lp=LH.localToWorld(leftPalmLocal.clone());
  const hv=lp.clone().sub(rp);if(hv.length()>1.35)continue; // left hand off grip
  const q=RH.getWorldQuaternion(new T.Quaternion()).invert();
  const haft=hv.normalize().applyQuaternion(q);
  good.push({d:hv.length(),dot:haft.dot(knuckleDir),haft});
 }
 a.stop();
 if(!good.length){console.log(clip.name,'no two-hand samples');continue;}
 const avgDot=good.reduce((s,g)=>s+g.dot,0)/good.length;
 console.log(clip.name.padEnd(7),'twoHand n='+good.length,'avgDot vs knuckleDir',avgDot.toFixed(3),'|dot| range',Math.min(...good.map(g=>Math.abs(g.dot))).toFixed(2)+'-'+Math.max(...good.map(g=>Math.abs(g.dot))).toFixed(2));
}
