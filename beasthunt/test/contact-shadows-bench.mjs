// Node CPU/counting probe; not a mobile GPU/FPS measurement.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {register} from 'node:module';
import {createCanvasElement} from './canvas-stub.mjs';register('./offline-loader.mjs',import.meta.url);
const T=await import('three'),counts={geometry:0,material:0,texture:0,mesh:0,matrix:0};
const THREE={...T};for(const [key,type] of [['geometry','PlaneGeometry'],['material','ShaderMaterial'],['texture','CanvasTexture'],['mesh','Mesh']])THREE[type]=class extends T[type]{constructor(...args){super(...args);counts[key]++;}updateMatrix(){counts.matrix++;return super.updateMatrix();}};
const context={THREE,Math,WeakMap};vm.createContext(context);const source=fs.readFileSync(new URL('../js/contact-shadows.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export class ContactShadows','class ContactShadows');vm.runInContext(source+';this.ContactShadows=ContactShadows;',context);
const scene=new T.Scene(),shadows=new context.ContactShadows(scene,false,{createElement:createCanvasElement}),actors=[],states=[];
for(let i=0;i<4;i++){const actor={root:new T.Group()},state={state:'idle',hp:100};scene.add(actor.root);actors.push(actor);states.push(state);shadows.attach(actor,state);}
const allocated=JSON.stringify([counts.geometry,counts.material,counts.texture,counts.mesh]);
function frame(i,moving){for(let k=0;k<4;k++){shadows.attach(actors[k],states[k]);if(moving)actors[k].root.position.set(i*.001+k,(i%300)*.005,k);}shadows.update();}
for(let i=0;i<10000;i++)frame(i,true);
const N=200000,measure=moving=>{const writes=counts.matrix,start=performance.now();for(let i=0;i<N;i++)frame(i,moving);return {msPerFrame:(performance.now()-start)/N,matrixWrites:counts.matrix-writes};};
const moving=measure(true),idle=measure(false);assert.ok(moving.msPerFrame<.2);assert.ok(idle.msPerFrame<.2);assert.equal(idle.matrixWrites,0);assert.equal(moving.matrixWrites,N*4);assert.equal(JSON.stringify([counts.geometry,counts.material,counts.texture,counts.mesh]),allocated);
assert.equal(counts.geometry,1);assert.equal(counts.material,1);assert.equal(counts.texture,1);assert.equal(counts.mesh,4);
console.log(JSON.stringify({actors:4,framesPerScenario:N,moving,idle,geometry:counts.geometry,material:counts.material,texture:counts.texture,textureSize:[64,64],mesh:counts.mesh,maxDrawCalls:4,drawCallsPerActor:1,newTrackedObjectsInMeasuredFrames:0,triangleCountPerActor:2}));shadows.dispose();
