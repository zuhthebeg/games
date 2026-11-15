// Offline generator: no runtime mesh-wide skinning. Calibrate bone-local support offsets.
import fs from 'node:fs';import {register} from 'node:module';register('./offline-loader.mjs',import.meta.url);
globalThis.self=globalThis;
const T=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const d=fs.readFileSync(new URL('../assets/warrok.glb',import.meta.url)),l=new GLTFLoader();l.register(()=>({name:'CPU_TEXTURE',loadTexture:async()=>new T.Texture()}));
const asset=await l.parseAsync(d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength),'');const model=asset.scene;model.updateMatrixWorld(true);
const box=new T.Box3().setFromObject(model),k=5/(box.max.y-box.min.y)*1.25;model.scale.setScalar(k);model.position.y=0;model.updateMatrixWorld(true);
const meshes=[];const bones={};model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);if(o.isBone)bones[o.name]=o;});
const mixer=new T.AnimationMixer(model),V=()=>new T.Vector3(),supports=new Map(),samples=[];
for(const clip of asset.animations){mixer.stopAllAction();const a=mixer.clipAction(clip);a.reset().play();a.paused=true;a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;
 for(let i=0;i<=100;i++){a.time=clip.duration*i/100;mixer.update(0);model.updateMatrixWorld(true);let min=Infinity,key;
 for(let mi=0;mi<meshes.length;mi++){const m=meshes[mi];m.skeleton.update();for(let j=0;j<m.geometry.attributes.position.count;j++){const y=m.getVertexPosition(j,V()).applyMatrix4(m.matrixWorld).y;if(y<min){min=y;key=mi+':'+j;}}}
 supports.set(key,true);samples.push({clip:clip.name,time:a.time,min,boneY:Object.fromEntries(Object.entries(bones).map(([n,b])=>[n,b.getWorldPosition(V()).y]))});
 }console.log('calibrated',clip.name);
}
// Scalar bone-radius trial, kept as evidence rather than silently trusting a foot radius.
const radii=Object.fromEntries(Object.keys(bones).map(n=>[n,Math.min(...samples.map(s=>s.boneY[n]-s.min))]));
const scalarError=Math.max(...samples.map(s=>Math.min(...Object.keys(bones).map(n=>s.boneY[n]-radii[n]))-s.min));
// Include real production fades: a pure-clip hull alone misses intermediate silhouettes.
const {createWarrokMotion}=await import('../js/warrok-motion.js');mixer.stopAllAction();
const W=createWarrokMotion(model,asset.animations),atk={swipe:'bite',smash:'stomp',spin:'sweep',rush:'charge',leap:'leap',cast:'spit'};
const state=(n,f)=>{const dur=W.actions[n].getClip().duration,m={state:'idle',t:dur*f,dur,moving:0,enr:false};if(n==='walk'||n==='run'){m.state='chase';m.moving=1;m.enr=n==='run';}else if(atk[n]){m.state='atk';m.ak=atk[n];m.atk={w:dur*.2,a:dur*.4,r:dur*.4};}else if(n!=='idle')m.state=n;return m;};
let transitionSamples=0;
for(const phase of [0,.25,.5,.75,1])for(const from of Object.keys(W.actions))for(const to of Object.keys(W.actions)){
 W.mixer.stopAllAction();W.cur=null;W.key='';W.pending=null;W.sync(state(from,phase),.3,from==='run');
 for(let i=0;i<13;i++){const m=state(to,i/12);W.sync(m,1/60,m.enr);model.position.y=0;model.updateMatrixWorld(true);let min=Infinity,key;
  for(let mi=0;mi<meshes.length;mi++){const mesh=meshes[mi];mesh.skeleton.update();for(let j=0;j<mesh.geometry.attributes.position.count;j++){const y=mesh.getVertexPosition(j,V()).applyMatrix4(mesh.matrixWorld).y;if(y<min){min=y;key=mi+':'+j;}}}supports.set(key,true);transitionSamples++;
 }
}console.log('calibrated transitions',transitionSamples);
// Each support is a small measured bone-local radius-vector combination, not a runtime skin scan.
const points=[];for(const key of supports.keys()){const [mi,vi]=key.split(':').map(Number),m=meshes[mi],g=m.geometry,p=V().fromBufferAttribute(g.attributes.position,vi).applyMatrix4(m.bindMatrix),terms=[];
 for(let c=0;c<4;c++){const w=g.attributes.skinWeight.getComponent(vi,c);if(!w)continue;const bi=g.attributes.skinIndex.getComponent(vi,c),o=p.clone().applyMatrix4(m.skeleton.boneInverses[bi]);terms.push([m.skeleton.bones[bi].name,w,...o.toArray()]);}points.push({mesh:mi,vertex:vi,terms});}
const output={asset:'warrok.glb',bodyFactor:1.25,calibrationSamples:samples.length,transitionSamples,scalarBoneRadiusMaxError:scalarError,padding:.012,points};
fs.writeFileSync(process.argv[2],JSON.stringify(output,null,2));console.log(JSON.stringify({points:points.length,scalarError,k}));

if(process.argv.includes('--check')){
 const {default:assert}=await import('node:assert/strict');const {WARROK_SUPPORTS}=await import('../js/warrok-floor.js');
 assert.deepEqual(points.map(p=>p.terms),WARROK_SUPPORTS,'committed support hull must match exact asset/clip/fade calibration');console.log('committed hull reproducibility PASS');
}
