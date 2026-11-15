import fs from 'node:fs';import {register}from'node:module';register('./offline-loader.mjs',import.meta.url);
globalThis.self=globalThis;globalThis.location={search:''};globalThis.matchMedia=()=>({matches:false});
globalThis.document={hidden:false};globalThis.window={};
export const T=await import('three');
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const cache=new Map();
export async function asset(name){if(!cache.has(name)){const bytes=fs.readFileSync(new URL('../assets/'+name,import.meta.url)),loader=new GLTFLoader();loader.register(()=>({name:'CPU_TEXTURE_PLACEHOLDER',loadTexture:async()=>new T.Texture()}));cache.set(name,loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''));}return cache.get(name);}
GLTFLoader.prototype.loadAsync=async url=>asset(new URL(url).pathname.split('/').at(-1));
export const models=await import('../js/models.js');
export const syncs={bow:(await import('../js/bow-motion.js?v=20261115er')).syncHunterBow,db:(await import('../js/db-motion.js?v=20261115ar')).syncHunterDb,gs:(await import('../js/gs-motion.js?v=20261115contact')).syncHunterGS};
export const V=()=>new T.Vector3();
export const pose=(weapon,state,t,extra={})=>({weapon,state,t,x:0,z:0,yaw:0,spin:0,inv:0,moving:0,combo:0,...extra});
export async function hunter(weapon){const h=models.buildHunter(weapon,1,1);await h.ready;if(!h.dispose)h.dispose=()=>{h[weapon]?.mixer.stopAllAction();h.root.removeFromParent();};return h;}
export function palms(h,weapon){const b=h[weapon];return ['Left','Right'].map(s=>b.bones[s+'Hand'].getWorldPosition(V()).add(b.bones[s+'HandMiddle1'].getWorldPosition(V())).multiplyScalar(.5));}
export function skinWitnesses(model){const points=[];model.updateWorldMatrix(true,true);model.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i+=Math.max(1,Math.floor(o.geometry.attributes.position.count/32)))points.push(o.getVertexPosition(i,V()).applyMatrix4(o.matrixWorld));}});return points;}
