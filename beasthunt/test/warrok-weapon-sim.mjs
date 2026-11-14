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
const d=MONSTERS.warrok.dims,k=(d.h*2)/(box.max.y-box.min.y);
model.scale.setScalar(k);model.position.y=-box.min.y*k;model.updateMatrixWorld(true);
const bones={};model.traverse(o=>{if(o.isBone)bones[o.name]=o;});
const RH=bones['mixamorigRightHand'],LH=bones['mixamorigLeftHand'],hips=bones['mixamorigHips'];
const V=()=>new T.Vector3();
const palmLocal=['Index1','Middle1','Ring1','Pinky1'].map(n=>bones['mixamorigRightHand'+n].position.clone()).reduce((a,v)=>a.add(v),V()).multiplyScalar(.25).multiplyScalar(.5);
const knuckleDir=bones['mixamorigRightHandIndex1'].position.clone().sub(bones['mixamorigRightHandPinky1'].position).normalize();
const m1w=bones['mixamorigRightHandMiddle1'].getWorldPosition(V()),m2w=bones['mixamorigRightHandMiddle2'].getWorldPosition(V());
const rhq=RH.getWorldQuaternion(new T.Quaternion());
const fingerDir=m2w.sub(m1w).normalize().applyQuaternion(rhq.clone().invert());
const palmNormal=knuckleDir.clone().cross(fingerDir).normalize();
console.log('palmLocal',palmLocal.toArray().map(v=>+v.toFixed(3)).join(','),'world',(palmLocal.length()*RH.getWorldScale(V()).x).toFixed(3),'m');
console.log('knuckleDir',knuckleDir.toArray().map(v=>+v.toFixed(3)).join(','),'fingerDir',fingerDir.toArray().map(v=>+v.toFixed(3)).join(','),'palmNormal',palmNormal.toArray().map(v=>+v.toFixed(3)).join(','));
const lPalmLocal=['Index1','Middle1','Ring1','Pinky1'].map(n=>bones['mixamorigLeftHand'+n].position.clone()).reduce((a,v)=>a.add(v),V()).multiplyScalar(.25).multiplyScalar(.5);
const socket=new T.Group();
socket.scale.setScalar(1/RH.getWorldScale(V()).x);
socket.position.copy(palmLocal);
const Y=knuckleDir.clone(),Z=palmNormal.clone(),X=new T.Vector3().crossVectors(Y,Z).normalize();
socket.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X,Y,Z));
RH.add(socket);
const tip=new T.Object3D(),grip=new T.Object3D(),pommel=new T.Object3D();
const BLADE_LEN=parseFloat(process.env.BLADE||'1.9');
tip.position.set(0,BLADE_LEN,0);pommel.position.set(0,-0.55,0);
socket.add(tip,grip,pommel);
model.updateMatrixWorld(true);
const mixer=new T.AnimationMixer(model);const S=13;
const ATK=['swipe','smash','spin','leap'];
const perClip={};
for(const clip of asset.animations){
 const a=mixer.clipAction(clip);a.reset();a.play();a.paused=true;
 const r={tipYMin:1e9,reachHips:0,reachRoot:0,gripRes:0,leftDist:1e9,leftDistMax:0};
 for(let i=0;i<S;i++){
  a.time=clip.duration*i/(S-1)*0.999;mixer.update(0);model.updateMatrixWorld(true);
  const tw=tip.getWorldPosition(V()),gw=grip.getWorldPosition(V()),pw=pommel.getWorldPosition(V());
  const hp=hips.getWorldPosition(V()),lp=LH.localToWorld(lPalmLocal.clone());
  const rp=RH.localToWorld(palmLocal.clone());
  r.gripRes=Math.max(r.gripRes,gw.distanceTo(rp));
  r.tipYMin=Math.min(r.tipYMin,tw.y);
  r.reachHips=Math.max(r.reachHips,Math.hypot(tw.x-hp.x,tw.z-hp.z));
  r.reachRoot=Math.max(r.reachRoot,Math.hypot(tw.x,tw.z));
  const seg=pw.clone().sub(gw),t=Math.max(0,Math.min(1,lp.clone().sub(gw).dot(seg)/seg.lengthSq()));
  const dd=lp.distanceTo(gw.clone().addScaledVector(seg,t));
  r.leftDist=Math.min(r.leftDist,dd);r.leftDistMax=Math.max(r.leftDistMax,dd);
 }
 a.stop();perClip[clip.name]=r;
}
console.log('\nBLADE_LEN',BLADE_LEN,'m  (sweepR',d.sweepR,'gate',d.sweepR+0.3,')');
for(const [n,r] of Object.entries(perClip))
 console.log(n.padEnd(8),'tipY',r.tipYMin.toFixed(3).padStart(7),'rchH',r.reachHips.toFixed(2).padStart(6),'rchR',r.reachRoot.toFixed(2).padStart(6),'grp',r.gripRes.toFixed(4),'L',r.leftDist.toFixed(2)+'/'+r.leftDistMax.toFixed(2));
console.log('ATK tipY min',Math.min(...ATK.map(n=>perClip[n].tipYMin)).toFixed(3),'ALL tipY min',Math.min(...Object.values(perClip).map(r=>r.tipYMin)).toFixed(3),'hipsReach max',Math.max(...Object.values(perClip).map(r=>r.reachHips)).toFixed(2));

// Part 2: torso penetration - min distance between blade segment (grip->tip)
// and the body axis segment (hips->head), minus approximate body radius.
const head=bones['mixamorigHead'];
function segSeg(p1,q1,p2,q2){
 const d1=q1.clone().sub(p1),d2=q2.clone().sub(p2),r=p1.clone().sub(p2);
 const a=d1.dot(d1),e=d2.dot(d2),f=d2.dot(r),c=d1.dot(r),b=d1.dot(d2),den=a*e-b*b;
 let s=den>1e-9?Math.max(0,Math.min(1,(b*f-c*e)/den)):0,t=e>1e-9?(b*s+f)/e:0;
 t=Math.max(0,Math.min(1,t));s=a>1e-9?Math.max(0,Math.min(1,(b*t-c)/a)):0;
 return p1.clone().addScaledVector(d1,s).distanceTo(p2.clone().addScaledVector(d2,t));
}
for(const clip of asset.animations){
 const a=mixer.clipAction(clip);a.reset();a.play();a.paused=true;
 let dmin=1e9;
 for(let i=0;i<S;i++){
  a.time=clip.duration*i/(S-1)*0.999;mixer.update(0);model.updateMatrixWorld(true);
  const gw=grip.getWorldPosition(V()),tw=tip.getWorldPosition(V());
  const hp=hips.getWorldPosition(V()),hd=head.getWorldPosition(V());
  dmin=Math.min(dmin,segSeg(gw,tw,hp,hd));
 }
 a.stop();
 console.log('torso  '+clip.name.padEnd(8),'blade<->spine min',dmin.toFixed(3));
}
