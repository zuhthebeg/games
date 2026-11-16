// Original GLB art stays immutable in the page cache; each actor owns its GPU objects.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {MONSTER_SUPPORTS} from './monster-supports.js?v=20261117mt1';
export const MONSTER_ACTORS=Object.freeze({boar:'Maw',frost:'Mutant',ember:'Pumpkinhulk',practice:'OrcChainBrute'});
const cache=new Map();
export function loadMonsterActor(id){
 const name=MONSTER_ACTORS[id];if(!name)return Promise.reject(new Error('Unknown actor'));
 if(!cache.has(name)){
  const manager=new THREE.LoadingManager(),missing=[];manager.onError=url=>missing.push(url);
  const task=new GLTFLoader(manager).loadAsync(new URL('../assets/monsters/'+name+'.glb?v=20261117mt1',import.meta.url).href).then(a=>{if(missing.length)throw new Error('Monster texture failed');return a;}).catch(e=>{cache.delete(name);throw e;});
  cache.set(name,task);
 }return cache.get(name);
}
const ATTACK={bite:'swipe',stomp:'smash',sweep:'spin',charge:'rush',leap:'leap',spit:'cast',fireball:'cast',breath:'cast'};
export function buildMonsterActor(id,height){
 const root=new THREE.Group(),name=MONSTER_ACTORS[id];let disposed=false;
 const actor={root,status:'loading',motion:null};
 actor.dispose=()=>{if(disposed)return;disposed=true;actor.status='disposed';const w=actor.motion;if(w){w.mixer.stopAllAction();w.mixer.uncacheRoot(w.model);const gs=new Set(),ms=new Set(),ss=new Set();w.model.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.skeleton)ss.add(o.skeleton);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)ms.add(m);});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ss.forEach(s=>s.dispose());}root.clear();};
 actor.ready=loadMonsterActor(id).then(asset=>{
  if(disposed)return actor;
  const model=clone(asset.scene),meshes=[];model.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();o.castShadow=true;o.frustumCulled=false;meshes.push(o);}});
  model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model,true),k=height/(box.max.y-box.min.y);model.scale.multiplyScalar(k);root.add(model);
  // Author axes differ: Blender hips local Z may be vertical. Do not edit
  // local translation tracks. Remove ONLY world-ground-plane root displacement
  // after mixer evaluation, retaining the authored vertical/root motion.
  const clips=asset.animations.map(c=>c.clone());
  const mixer=new THREE.AnimationMixer(model),actions=Object.fromEntries(clips.map(c=>[c.name,mixer.clipAction(c)])),v=new THREE.Vector3();
  const w=actor.motion={model,mixer,actions,current:null,clock:0};
  let hips;model.traverse(o=>{if(o.isBone&&(o.name.endsWith('Hips')||o.name==='hynzbr'))hips=o;});
  const support=(MONSTER_SUPPORTS[name]||[]).map(([mi,i])=>[meshes[mi],i]);
  w.ground=()=>{model.position.set(0,0,0);root.updateMatrixWorld(true);if(hips){root.worldToLocal(hips.getWorldPosition(v));model.position.x=-v.x;model.position.z=-v.z;if(w.baseHipY===undefined)w.baseHipY=v.y;if(w.inPlaceLeap)model.position.y=-Math.max(0,v.y-w.baseHipY);root.updateMatrixWorld(true);}let min=Infinity;for(const [mesh,i] of support){mesh.getVertexPosition(i,v);min=Math.min(min,v.applyMatrix4(mesh.matrixWorld).y-root.position.y);}if(!Number.isFinite(min))throw new Error('Invalid monster support');model.position.y+=Math.max(0,-min+.015);root.updateMatrixWorld(true);return min;};
  w.sync=(m,dt)=>{
   w.inPlaceLeap=m.state==='atk'&&m.ak==='leap';
   let want='idle',one=false,dur=0;
   if(m.state==='atk'&&m.atk){want=ATTACK[m.ak];one=true;const er=m.enr?.85:1;dur=m.atk.w*er+m.atk.a+m.atk.r*er;}
   else if(['roar','flinch','topple','dead'].includes(m.state)){want=m.state;one=true;dur=m.dur||(m.state==='dead'?4.6:.95);}
   else if(m.moving)want=m.enr?'run':'walk';
   // Gobkit uses its own authored clip names, never a Mixamo retarget.
   const gob={idle:'idle',walk:'walk',run:'walk',swipe:'attack',smash:'attack',spin:'attack',rush:'walk',leap:'attack',cast:'attack',roar:'idle',flinch:'hit',topple:'hit',dead:'death'};
   if(id==='practice')want=gob[want];
   const a=actions[want]||actions[Object.keys(actions).find(n=>n.toLowerCase().includes(want))]||Object.values(actions)[0];
   if(w.current!==a){mixer.stopAllAction();a.reset().play();a.paused=true;w.current=a;}
   w.clock+=dt;const cd=a.getClip().duration;
   a.time=one?Math.min(cd-.00001,Math.max(0,m.t)/Math.max(.01,dur)*cd):w.clock%cd;
   mixer.update(0);w.ground();
  };
  w.sync({state:'idle',t:0},0);actor.status='ready';return actor;
 }).catch(e=>{if(!disposed){actor.status='failed';actor.error=String(e);}return actor;});
 return actor;
}
