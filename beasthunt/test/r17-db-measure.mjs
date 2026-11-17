import {createCanvasElement} from './canvas-stub.mjs';
import fs from 'node:fs';
import {register} from 'node:module';
register('./offline-loader.mjs',import.meta.url);
globalThis.self=globalThis;globalThis.location={search:''};globalThis.document={hidden:false,createElement:createCanvasElement};globalThis.window={};
const T=await import('three');const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {clone}=await import('three/addons/utils/SkeletonUtils.js');
const {createDbMotion,groundArissa,DB_CLIPS}=await import('../js/db-motion.js');
const V=()=>new T.Vector3(),Q=()=>new T.Quaternion();
async function load(n){const d=fs.readFileSync(new URL('../assets/'+n,import.meta.url)),l=new GLTFLoader();l.register(()=>({name:'CPU_TEXTURE',loadTexture:async()=>new T.Texture()}));return l.parseAsync(d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength),'');}
export async function measure(){const report={};for(const variant of ['paladin','before','wrist','C']){
 const asset=await load(variant==='paladin'?'hunter-db.glb':'hunter-arissa-db.glb'),model=clone(asset.scene);model.updateMatrixWorld(true);
 const blades={Left:new T.Group(),Right:new T.Group()},b=createDbMotion(model,asset.animations,blades,{arissa:variant!=='paladin'});
 if(variant==='wrist')for(const side of ['Left','Right']){const hand=b.bones[side+'Hand'],local=n=>hand.worldToLocal(b.bones[side+n].getWorldPosition(V())),radial=local('HandIndex1').sub(local('HandPinky1')).normalize(),finger=local('HandMiddle1').normalize(),normal=radial.clone().cross(finger).normalize(),y=finger.negate(),width=y.clone().cross(normal).normalize();normal.copy(width).cross(y).normalize();b.sockets[side].quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(width,y,normal));}
 if(variant==='before')for(const side of ['Left','Right']){const hand=b.bones[side+'Hand'],local=n=>hand.worldToLocal(b.bones[side+n].getWorldPosition(V())),radial=local('HandIndex1').sub(local('HandPinky1')).normalize(),finger=local('HandMiddle1').normalize(),normal=radial.clone().cross(finger).normalize(),y=radial.negate(),width=y.clone().cross(normal).normalize();normal.copy(width).cross(y).normalize();b.sockets[side].quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(width,y,normal));}
 const r={sockets:Object.fromEntries(['Left','Right'].map(s=>[s,{p:b.sockets[s].position.toArray(),q:b.sockets[s].quaternion.toArray()}])),clips:{}};
 for(const name of Object.keys(DB_CLIPS)){
 b.mixer.stopAllAction();const a=b.actions[name];a.reset().play();a.paused=true;const duration=a.getClip().duration,out={};
 for(const side of ['Left','Right'])out[side]={elevationMin:Infinity,elevationMax:-Infinity,radialMin:Infinity,tipMin:Infinity,activeElevationMax:0,activeRadialMin:Infinity,gripMax:0,activeCount:0};
 for(let i=0;i<=1000;i++){const time=duration*i/1000;a.time=time;b.mixer.update(0);if(b.arissa)groundArissa(b);model.updateMatrixWorld(true);
 const hp=b.bones.Hips.getWorldPosition(V());
 for(const side of ['Left','Right']){const socket=b.sockets[side],d=new T.Vector3(0,-1,0).applyQuaternion(socket.getWorldQuaternion(Q())),p=socket.getWorldPosition(V()),rad=p.clone().sub(hp);rad.y=0;rad.normalize();const el=Math.asin(T.MathUtils.clamp(d.y,-1,1))*180/Math.PI,rr=d.dot(rad),s=out[side],tip=socket.localToWorld(new T.Vector3(0,-.86,0));s.elevationMin=Math.min(s.elevationMin,el);s.elevationMax=Math.max(s.elevationMax,el);s.radialMin=Math.min(s.radialMin,rr);s.tipMin=Math.min(s.tipMin,tip.y);s.gripMax=Math.max(s.gripMax,p.distanceTo(b.bones[side+'Hand'].getWorldPosition(V()).add(b.bones[side+'HandMiddle1'].getWorldPosition(V())).multiplyScalar(.5)));
 const impact=DB_CLIPS[name].impact;if(impact&&time>impact[0]&&time<impact[1]){s.activeCount++;s.activeElevationMax=Math.max(s.activeElevationMax,Math.abs(el));s.activeRadialMin=Math.min(s.activeRadialMin,rr);}}
 }r.clips[name]=out;
 }report[variant]=r;
 }return report;}
if(process.argv[1]===new URL(import.meta.url).pathname){const r=await measure();fs.writeFileSync(process.argv[2]||'/tmp/r17-db.json',JSON.stringify(r,null,2));for(const [v,r0]of Object.entries(r))for(const n of ['idle','h2','h3','spin','stun'])console.log(v,n,JSON.stringify(r0.clips[n]));}
