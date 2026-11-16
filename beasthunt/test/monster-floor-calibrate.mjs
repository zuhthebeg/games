// Offline derived vertex-index support hull; original geometry is never changed.
import fs from 'node:fs';import {register} from 'node:module';register('./offline-loader.mjs',import.meta.url);
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:2048,height:2048});
const T=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const out={};
for(const name of ['Maw','Mutant','Pumpkinhulk','OrcChainBrute']){
 const b=fs.readFileSync(new URL('../assets/monsters/'+name+'.glb',import.meta.url)),a=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const meshes=[];a.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});const mix=new T.AnimationMixer(a.scene),v=new T.Vector3(),set=new Set();
 for(const c of a.animations){const ac=mix.clipAction(c);mix.stopAllAction();ac.reset().play();ac.paused=true;
 for(let f=0;f<=48;f++){ac.time=c.duration*f/48;mix.update(0);a.scene.updateMatrixWorld(true);let min=Infinity,at=null;
 meshes.forEach((m,mi)=>{for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,v);v.applyMatrix4(m.matrixWorld);if(v.y<min){min=v.y;at=[mi,i];}}});set.add(JSON.stringify(at));}}
 out[name]=[...set].map(s=>JSON.parse(s));console.log(name,'supports',out[name].length);
}
fs.writeFileSync(new URL('../js/monster-supports.js',import.meta.url),'// Derived from all original clips at 49 poses; see test/monster-floor-calibrate.mjs.\nexport const MONSTER_SUPPORTS='+JSON.stringify(out)+';\n');
