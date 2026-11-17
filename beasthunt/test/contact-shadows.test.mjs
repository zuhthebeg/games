import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
register('./offline-loader.mjs',import.meta.url);
const THREE=await import('three');
const {MONSTERS,QUESTS}=await import('../js/data.js');
const {Sim}=await import('../js/sim.js');
const mod=await import('../js/contact-shadows.js').catch(()=>null);
const stops=[];
const document={createElement(){return {width:0,height:0,getContext(){return {createRadialGradient(){return {addColorStop(...args){stops.push(args);}};},fillRect(){}};}};}};
function setup(real=false){assert.equal(typeof mod?.ContactShadows,'function','render-only contact shadows exist');const scene=new THREE.Scene();return {scene,shadows:new mod.ContactShadows(scene,real,document)};}
function actor(scene,status){const a={root:new THREE.Group()};if(status)a.status=status;scene.add(a.root);return a;}
function state(){return {state:'idle',hp:100};}
for(const id of ['hunter','remote-gs','remote-bow','remote-db',...Object.keys(MONSTERS),'practice'])test('one shared ground blob for '+id,()=>{
 const {scene,shadows}=setup(),a=actor(scene),b=actor(scene),s=state(),def=id==='practice'?MONSTERS.boar:MONSTERS[id];
 const x=shadows.attach(a,s,def),y=shadows.attach(b,s);
 shadows.update();assert.equal(x.mesh.parent,scene);assert.notEqual(x.mesh.parent,a.root);assert.equal(x.mesh.visible,true);
 assert.equal(x.mesh.geometry,y.mesh.geometry);assert.equal(x.mesh.material,y.mesh.material);assert.equal(x.mesh.frustumCulled,true);
 assert.equal(x.mesh.geometry.attributes.position.count,4);assert.equal(x.mesh.material.depthWrite,false);assert.equal(x.mesh.material.transparent,true);assert.equal(x.mesh.material.polygonOffset,true);
 assert.equal(x.mesh.position.y,.02);assert.equal(x.mesh.scale.x,def?def.dims.bw*def.scale:.9);assert.equal(x.mesh.scale.z,def?def.dims.hz*def.scale:.9);
 assert.equal(shadows.texture.image.width,64);assert.equal(shadows.texture.image.height,64);assert.ok(stops.some(s=>s[0]===1&&s[1].includes(',0)')));
 shadows.dispose();
});
test('follows ground XZ, continuous independent airborne fade and no stationary transform writes',()=>{
 const {scene,shadows}=setup(),a=actor(scene),b=actor(scene),x=shadows.attach(a,state()),y=shadows.attach(b,state());let writes=0;const update=x.mesh.updateMatrix.bind(x.mesh);x.mesh.updateMatrix=()=>{writes++;update();};
 shadows.update();assert.equal(writes,1);shadows.update();assert.equal(writes,1);
 a.root.position.set(7,1.5,-9);shadows.update();assert.equal(writes,2);assert.equal(x.mesh.position.x,7);assert.equal(x.mesh.position.z,-9);assert.equal(x.mesh.position.y,.02);assert.equal(x.mesh.scale.x,.9*1.15);assert.equal(x.mesh.scale.y,y.mesh.scale.y*.5);
 a.root.position.y=3;shadows.update();assert.equal(x.mesh.visible,false);a.root.position.y=0;shadows.update();assert.equal(x.mesh.visible,true);assert.equal(x.mesh.scale.y,y.mesh.scale.y);shadows.dispose();
});
test('desktop retains shadow maps and uses at most 35 percent blob alpha; mobile remains blobs only',()=>{
 const mobile=setup(),desktop=setup(true),m=mobile.shadows.attach(actor(mobile.scene),state()),d=desktop.shadows.attach(actor(desktop.scene),state());mobile.shadows.update();desktop.shadows.update();assert.ok(d.mesh.scale.y<=m.mesh.scale.y*.35);assert.ok(d.mesh.scale.y>0);const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8'),game=fs.readFileSync(new URL('../js/game.js',import.meta.url),'utf8');assert.ok(main.includes('shadowMap.enabled = !coarse && !/[?&]lowfx=1/.test(location.search)'));assert.ok(game.includes("mapSize.set(1024, 1024)"));mobile.shadows.dispose();desktop.shadows.dispose();
});
test('death, blink, invisible/failed/disposed actors and removed coop actors hide or release blobs',()=>{
 const {scene,shadows}=setup(),a=actor(scene),s=state(),x=shadows.attach(a,s);shadows.update();
 for(const change of [()=>s.state='dead',()=>s.hp=0,()=>a.root.visible=false,()=>a.status='loading',()=>a.status='failed',()=>a.status='disposed']){s.state='idle';s.hp=100;a.root.visible=true;a.status=undefined;change();shadows.update();assert.equal(x.mesh.visible,false);}
 s.state='idle';s.hp=100;a.root.visible=true;a.status='ready';shadows.update();assert.equal(x.mesh.visible,true);a.root.removeFromParent();shadows.update();assert.equal(x.mesh.parent,null);assert.equal(shadows.entries.length,0);shadows.dispose();
});
test('dispose resources exactly once and no scene leak after twenty hunt enter/exits',()=>{
 for(let n=0;n<20;n++){const {scene,shadows}=setup();for(let i=0;i<4;i++)shadows.attach(actor(scene),state());shadows.update();let g=0,m=0,t=0;shadows.geometry.addEventListener('dispose',()=>g++);shadows.material.addEventListener('dispose',()=>m++);shadows.texture.addEventListener('dispose',()=>t++);const a=shadows.entries[0].actor;a.root.removeFromParent();shadows.update();assert.deepEqual([g,m,t],[0,0,0]);shadows.dispose();shadows.dispose();assert.deepEqual([g,m,t],[1,1,1]);assert.equal(shadows.entries.length,0);assert.ok(!scene.children.some(o=>o.isMesh));}
});
test('presentation hook runs after interpolation and coop sync; no sim snapshot changes',()=>{
 const {scene,shadows}=setup(),sim=new Sim(QUESTS[0],{weapon:'gs',w:{gs:1,db:1,bow:1},armor:1},123),before=JSON.stringify(sim.snapshot());shadows.attach(actor(scene),sim.p);shadows.attach(actor(scene),sim.m,sim.def);for(let i=0;i<120;i++)shadows.update();assert.equal(JSON.stringify(sim.snapshot()),before);
 const source=fs.readFileSync(new URL('../js/game.js',import.meta.url),'utf8');assert.match(source,/this.contactShadows = new ContactShadows/);assert.ok(source.includes("this.contactShadows.attach(this.G,this.m,this.def)"));assert.ok(source.includes("this.contactShadows?.attach(H,p)"));assert.ok(source.indexOf('this.contactShadows?.update();',source.indexOf('frame('))>source.indexOf('this.session?.render?.(this, rdt);'));assert.ok(source.indexOf('this.contactShadows?.dispose();')<source.indexOf('disposeHunterActors(this.scene);'));shadows.dispose();
});

test('actual Hunt frame tracks interpolated local/coop actors, blink, restore and twenty disposal cycles',async()=>{
 globalThis.document={...document,hidden:false};globalThis.location={search:''};globalThis.window={};
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const load=GLTFLoader.prototype.loadAsync;GLTFLoader.prototype.loadAsync=async()=>null;
 const {Hunt}=await import('bh/game'),{buildHunter}=await import('bh/models');
 try{for(let n=0;n<20;n++){
  const el=new Proxy({}, {get:(o,k)=>o[k]??={style:{},classList:{toggle(){}}}}),input={isTouch:false,take(){return false;},takeLook(){return {x:0,y:0};},sample(){return {};}};
  const h=new Hunt({shadowMap:{enabled:false},render(){}},QUESTS[8],{weapon:'db',w:{db:1,gs:1,bow:1},armor:1},{el,setMon(){},toast(){},dmg(){},flash(){}},input,()=>{});h.skipRender=true;h.remoteAudioHits=()=>{};
  const remote=buildHunter('bow',1,1);h.scene.add(remote.root);const rp={...h.p,id:'remote',weapon:'bow',x:7,z:8,inv:0};
  h.session={rep:{hunters:new Map()},service(){return false;},render(){h.syncHunter(rp,remote,0,{});}};h.frame(0);
  assert.equal(h.contactShadows.entries.length,3);const entry=h.contactShadows.entries.find(e=>e.actor===remote);assert.equal(entry.mesh.position.x,remote.root.position.x);assert.equal(entry.mesh.visible,remote.root.visible);
  h.p.inv=1;h.clock=0;h.frame(0);const local=h.contactShadows.entries.find(e=>e.actor===h.H);assert.equal(h.H.root.visible,false);assert.equal(local.mesh.visible,false);
  h.sim.m={...h.sim.m,state:'dead',hp:0};h.frame(0);const monster=h.contactShadows.entries.find(e=>e.actor===h.G);assert.equal(monster.mesh.visible,false,'replacement snapshot death hides shadow');
  h.dispose();assert.equal(h.contactShadows.entries.length,0);assert.ok(!h.scene.children.some(o=>o.name==='contact-shadow'));
 }}finally{GLTFLoader.prototype.loadAsync=load;}
});

test('elongated collider footprint rotates with actor without stationary matrix work',()=>{
 const {scene,shadows}=setup(),a=actor(scene),entry=shadows.attach(a,state(),MONSTERS.legacy_ember);shadows.update();a.root.rotation.y=1.2;shadows.update();assert.equal(entry.mesh.rotation.y,1.2);assert.equal(entry.mesh.scale.x,1.6*1.35);assert.equal(entry.mesh.scale.z,2.4*1.35);shadows.dispose();
});
test('shadow generation pins both changed modules exactly, preserving other module keys',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),imports=JSON.parse(html.split('<script type="importmap">')[1].split('</script>')[0]).imports;
 assert.equal(imports['bh/game'],'./js/game.js?v=20261117sh');assert.equal(imports['bh/models'],'./js/models.js?v=20261117wl1');
 const game=fs.readFileSync(new URL('../js/game.js',import.meta.url),'utf8');assert.ok(game.includes("from './contact-shadows.js?v=20261117sh'"));assert.ok(game.includes("from './sim.js?v=20261117wl1'"));
});
