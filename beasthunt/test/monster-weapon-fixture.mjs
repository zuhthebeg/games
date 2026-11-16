import fs from 'node:fs';import{register}from'node:module';register('./offline-loader.mjs',import.meta.url);globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:2048,height:2048});
export const T=await import('three');const{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');GLTFLoader.prototype.loadAsync=async function(url){const n=String(url).split('/monsters/')[1].split('.glb')[0],b=fs.readFileSync(new URL('../assets/monsters/'+n+'.glb',import.meta.url));return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
export const {buildMonsterActor}=await import('../js/monster-actor.js');
export const ACTORS=[['boar',3.7],['frost',4.37],['ember',5.67]];
export function pose(actor,action,sample,n=97){actor.motion.mixer.stopAllAction();action.reset().play();action.paused=true;action.time=action.getClip().duration*(sample+.317)/n;actor.motion.mixer.update(0);actor.motion.ground();}
