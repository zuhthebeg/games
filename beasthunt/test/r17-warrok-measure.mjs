import {createCanvasElement} from './canvas-stub.mjs';
import fs from 'node:fs';import {register} from 'node:module';register('./offline-loader.mjs',import.meta.url);
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:2048,height:2048});globalThis.location={search:''};globalThis.document={hidden:false,createElement:createCanvasElement};globalThis.window={};
const T=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
GLTFLoader.prototype.loadAsync=async function(url){if(!String(url).includes('warrok.glb'))return null;const b=fs.readFileSync(new URL('../assets/warrok.glb',import.meta.url));return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const {Hunt}=await import('bh/game'),{QUESTS}=await import('bh/data');const V=()=>new T.Vector3();
function make(){const el=new Proxy({}, {get:(o,k)=>o[k]??={style:{},classList:{toggle(){}}}});return new Hunt({shadowMap:{enabled:false},render(){}},QUESTS[6],{weapon:'db',w:{db:1,gs:1,bow:1},armor:1},{el,setMon(){},toast(){},dmg(){},flash(){}},{isTouch:false,take(){return false},takeLook(){return {x:0,y:0}},sample(){return {}}},()=>{});}
export async function measure(){const report={};for(const [variant,bodyFactor,bladeLength]of [['reference1.0',1,1.35],['after',1.25,2.43*2],['body1.15',1.15,2.43*2],['body1.35',1.35,2.43*2]]){
 const h=make();h.frame(1/60);await h.G.ready;const W=h.G.warrok,model=W.model,socket=h.G.weaponSocket,weapon=h.G.weapon;
 model.scale.multiplyScalar(bodyFactor/1.25);model.position.y*=bodyFactor/1.25;socket.scale.multiplyScalar(1.25/bodyFactor);// R21: the blade-only extension lives in its mesh, never scale the grip/pommel.
 const factor=variant==='reference1.0'?1:2;
 weapon.userData.bladeSpan=1.35*factor-.35;
 weapon.getObjectByName('warrok-cleaver-blade').scale.set(factor===1?1:1.5,factor===1?1:1.5,1.35*factor-.35);
 weapon.getObjectByName('warrok-weapon-tip').position.y=1.35*factor;
 weapon.scale.setScalar(bladeLength/(1.35*factor));model.updateWorldMatrix(true,true);
 const bones={};model.traverse(o=>{if(o.isBone)bones[o.name.replace('mixamorig','')]=o;});const meshes=[];model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
 const r={floorEnabled:true,bodyFactor,bladeLength,modelScale:model.scale.x,clips:{},outside:0,verticesOutside:0,gripMax:0,triangles:0};
 weapon.traverse(o=>{if(o.isMesh)r.triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
 for(const [name,a]of Object.entries(W.actions)){
 W.mixer.stopAllAction();a.reset().setLoop(T.LoopOnce,1).play();a.clampWhenFinished=true;a.paused=true;const c={tipMin:Infinity,feetMin:Infinity,feetMax:-Infinity,skinMin:Infinity,reachMax:0,torsoSpineMin:Infinity,outsideSamples:0,outsideVertices:0,approxErrorMax:0,rawSkinMin:Infinity,liftMax:0,airborneCount:0,airborneLiftMax:0,repeatDeltaMax:0,samples:0};
 for(let i=0;i<=100;i++){model.position.y=0;a.time=a.getClip().duration*(i===0?0:i===100?1:(i+.371)/101);W.mixer.update(0);model.updateMatrixWorld(true);
 let rawMin=Infinity;for(const m of meshes){m.skeleton.update();for(let j=0;j<m.geometry.attributes.position.count;j++)rawMin=Math.min(rawMin,m.getVertexPosition(j,V()).applyMatrix4(m.matrixWorld).y);}
 const approx=W.ground(),lift=model.position.y;c.samples++;c.rawSkinMin=Math.min(c.rawSkinMin,rawMin);c.approxErrorMax=Math.max(c.approxErrorMax,Math.abs(approx-rawMin));c.liftMax=Math.max(c.liftMax,lift);W.ground();c.repeatDeltaMax=Math.max(c.repeatDeltaMax,Math.abs(model.position.y-lift));if(approx>0){c.airborneCount++;c.airborneLiftMax=Math.max(c.airborneLiftMax,lift);}
 h.scene.updateMatrixWorld(true);const tip=weapon.getObjectByName('warrok-weapon-tip').getWorldPosition(V()),grip=socket.getWorldPosition(V()),hips=bones.Hips.getWorldPosition(V()),head=bones.Head.getWorldPosition(V());const palm=['Index1','Middle1','Ring1','Pinky1'].reduce((s,n)=>s.add(bones['RightHand'+n].position),V()).multiplyScalar(.125);r.gripMax=Math.max(r.gripMax,grip.distanceTo(bones.RightHand.localToWorld(palm)));
 c.tipMin=Math.min(c.tipMin,tip.y);c.reachMax=Math.max(c.reachMax,Math.hypot(tip.x-hips.x,tip.z-hips.z));const fy=Math.min(...['LeftToeBase','RightToeBase'].map(n=>bones[n].getWorldPosition(V()).y));c.feetMin=Math.min(c.feetMin,fy);c.feetMax=Math.max(c.feetMax,fy);
 // Segment distance by dense blade samples, torso axis hips->head; independent of surface proxy.
 const spine=head.clone().sub(hips);for(let k=0;k<=100;k++){const p=grip.clone().lerp(tip,k/100),t=T.MathUtils.clamp(p.clone().sub(hips).dot(spine)/spine.lengthSq(),0,1);c.torsoSpineMin=Math.min(c.torsoSpineMin,p.distanceTo(hips.clone().addScaledVector(spine,t)));}
 h.cam.updateMatrixWorld(true);const f=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(h.cam.projectionMatrix,h.cam.matrixWorldInverse));let outside=0;
 for(const m of meshes){m.skeleton.update();for(let j=0;j<m.geometry.attributes.position.count;j++){const v=m.getVertexPosition(j,V()).applyMatrix4(m.matrixWorld);c.skinMin=Math.min(c.skinMin,v.y);if(!f.containsPoint(v))outside++;}}
 weapon.traverse(o=>{if(o.isMesh)for(let j=0;j<o.geometry.attributes.position.count;j++)if(!f.containsPoint(V().fromBufferAttribute(o.geometry.attributes.position,j).applyMatrix4(o.matrixWorld)))outside++;});if(outside){c.outsideSamples++;c.outsideVertices+=outside;}
 }r.clips[name]=c;r.outside+=c.outsideSamples;r.verticesOutside+=c.outsideVertices;
 }report[variant]=r;h.dispose();
 }return report;}
if(process.argv[1]===new URL(import.meta.url).pathname){const r=await measure();fs.writeFileSync(process.argv[2]||'/tmp/r17-warrok.json',JSON.stringify(r,null,2));for(const [v,r0]of Object.entries(r)){console.log(v,'out',r0.outside,'scale',r0.modelScale);for(const n of ['idle','smash','spin','leap'])console.log(n,JSON.stringify(r0.clips[n]));}}

// Production W.sync, including paused repeats and actual cross-fades, not only raw clip seeks.
export async function measureSync(){
 const h=make();h.frame(1/60);await h.G.ready;const W=h.G.warrok,model=W.model,meshes=[];model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
 const atk={swipe:'bite',smash:'stomp',spin:'sweep',rush:'charge',leap:'leap',cast:'spit'};
 const state=(n,f)=>{const dur=W.actions[n].getClip().duration,m={state:'idle',t:dur*f,dur,moving:0,enr:false};
  if(n==='walk'||n==='run'){m.state='chase';m.moving=1;m.enr=n==='run';}
  else if(atk[n]){m.state='atk';m.ak=atk[n];m.atk={w:dur*.2,a:dur*.4,r:dur*.4};}
  else if(n!=='idle')m.state=n;return m;};
 const r={samples:0,skinMin:Infinity,approxErrorMax:0,repeatDeltaMax:0,airborneLift:0,pairs:0};
 for(const from of Object.keys(W.actions))for(const to of Object.keys(W.actions)){
  W.mixer.stopAllAction();W.cur=null;W.key='';W.pending=null;
  W.sync(state(from,.41),.3,from==='run');r.pairs++;
  for(let i=0;i<13;i++){
   const m=state(to,i/12);W.sync(m,1/60,m.enr);h.scene.updateMatrixWorld(true);let min=Infinity;
   for(const mesh of meshes){mesh.skeleton.update();for(let j=0;j<mesh.geometry.attributes.position.count;j++)min=Math.min(min,mesh.getVertexPosition(j,V()).applyMatrix4(mesh.matrixWorld).y);}
   const lift=model.position.y;r.skinMin=Math.min(r.skinMin,min);const approx=W.ground();r.approxErrorMax=Math.max(r.approxErrorMax,Math.abs(approx-(min-lift)));
   W.sync(m,0,m.enr);r.repeatDeltaMax=Math.max(r.repeatDeltaMax,Math.abs(model.position.y-lift));r.samples++;
  }
 }
 h.G.root.position.y=5;W.sync(state('leap',.5),.3,false);r.airborneLift=model.position.y;h.dispose();return r;
}
