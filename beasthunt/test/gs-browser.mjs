import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire('/home/cocy/.openclaw/workspace/');const {chromium}=require('playwright');
const out=process.env.BH_GS_OUT||'/home/cocy/.openclaw/workspace/tmp/beasthunt-r5';await mkdir(out+'/shots',{recursive:true});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const ctx=await browser.newContext({viewport:{width:900,height:750}});await ctx.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:8791'?r.continue():r.abort());
const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|ERR_|favicon/i.test(m.text()))errors.push(m.text());});
try{
await page.goto('http://127.0.0.1:8791/beasthunt/?lowfx=1');await page.waitForFunction(()=>window.__bh);
await page.evaluate(async()=>{
 const THREE=await import('three'),models=await import('bh/models'),motion=await import('bh/gs-motion');
 const H=models.buildHunterGS(3,3);await H.ready;if(!H.gs)throw Error('GS asset not ready');
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x202a30);scene.add(new THREE.HemisphereLight(0xffffff,0x687878,2));
 const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,6,5);scene.add(light);scene.add(H.root);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0x424e48}));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;scene.add(ground);
 const camera=new THREE.PerspectiveCamera(40,900/750,.1,100);camera.position.set(4,2.8,5.5);camera.lookAt(0,1.2,0);
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,750);renderer.domElement.id='gs-qa';renderer.domElement.style='position:fixed;inset:0;z-index:999999';document.body.append(renderer.domElement);
 window.qa={THREE,models,motion,H,scene,camera,renderer};
});
const frames=[['idle',0],['walk',.5],['run',.5],...['v','h','h2','spin','other'].map(sw=>['atk',.30,sw]),['charge',.75],['roll',.31],['drink',.55],['hit',.2],['stun',.6],['down',.9],['dead',1.9]];
for(const [state,t,sw] of frames){
 await page.evaluate(({state,t,sw})=>{const q=qa,p={state:state==='walk'||state==='run'?'idle':state,t,weapon:'gs',x:0,z:0,yaw:0,spin:0,inv:0,walk:1.1,moving:state==='run'?1.8:state==='walk'?1:0,cur:{sw,dur:.8,h0:.3,h1:.48},combo:0};
  for(let i=0;i<10;i++)q.motion.syncHunterGS(p,q.H,.02,1);q.renderer.render(q.scene,q.camera);
 },{state,t,sw});await page.locator('#gs-qa').screenshot({path:out+'/shots/'+(sw?'atk-'+sw:state)+'.png'});
}
const measurements=await page.evaluate(async()=>{
 const q=qa,{H,THREE,motion}=q;let ikMax=0,rootMax=0;const states={};
 for(const name of Object.keys(motion.GS_CLIPS)){
  const a=motion.GS_CLIPS[name],state=['v','h','h2','spin','other'].includes(name)?'atk':['walk','run'].includes(name)?'idle':name;
  const p={state,t:0,weapon:'gs',x:0,z:0,yaw:0,spin:0,inv:0,walk:0,moving:['walk','run'].includes(name)?1:0,cur:{sw:name,dur:.8,h0:.30,h1:.48},combo:0};
  let max=0,root0;for(let i=0;i<=120;i++){p.t=(state==='atk'?.8:({roll:.62,drink:1.25,hit:.42,stun:1.25,down:1.15,dead:2.3,charge:1.5}[state]||2))*i/120;p.walk=i/30;motion.syncHunterGS(p,H,1/120,1);H.root.updateMatrixWorld(true);
   max=Math.max(max,H.gs.ikDistance);const r=H.gs.bones.Hips.getWorldPosition(new THREE.Vector3());if(!root0)root0=r.clone();rootMax=Math.max(rootMax,Math.hypot(r.x-root0.x,r.z-root0.z));
  }ikMax=Math.max(ikMax,max);states[name]={ikMax:max};
 }
 const impact=[];for(const sw of ['v','h','h2','spin','other']){const p={state:'atk',weapon:'gs',t:.3,x:0,z:0,yaw:0,spin:0,inv:0,cur:{sw,dur:.8,h0:.3,h1:.48},combo:0};motion.syncHunterGS(p,H,0,1);const m=motion.GS_CLIPS[sw];impact.push({sw,h0:p.cur.h0,clipTime:H.gs.actions[sw].time,marker:m.impact[0],deltaMs:(H.gs.actions[sw].time-m.impact[0])/(m.impact[0]/p.cur.h0)*1000});}
 const clones=[H,...[1,2,3].map(i=>q.models.buildHunterGS(i,i))];await Promise.all(clones.map(h=>h.ready));
 const independent=clones.every((h,i)=>clones.every((h2,j)=>i===j||h.gs.bones.Hips!==h2.gs.bones.Hips&&h.gs.mixer!==h2.gs.mixer));
 return {load:q.models.hunterGSLoad,ikMax,rootMax,states,impact,independent};
});
measurements.errors=errors;await writeFile(out+'/measurements.json',JSON.stringify(measurements,null,2));console.log(JSON.stringify(measurements));
if(errors.length||measurements.rootMax>.001||!measurements.independent||measurements.ikMax>.06)throw Error('GS measurement gate failed');
// Fresh context: GLB 404 must leave a fully functional procedural hunter.
const fc=await browser.newContext();await fc.route('**/*',r=>{const u=new URL(r.request().url());return u.pathname.endsWith('/hunter-gs.glb')?r.fulfill({status:404,body:'missing'}):u.origin==='http://127.0.0.1:8791'?r.continue():r.abort();});
const f=await fc.newPage();await f.goto('http://127.0.0.1:8791/beasthunt/?lowfx=1');await f.waitForFunction(()=>window.__bh);
const fallback=await f.evaluate(async()=>{const m=await import('bh/models');await m.loadHunterGS();__bh.start('q1');const h=__bh.hunt;for(let i=0;i<120;i++)__bh.step(1/60);return {status:m.hunterGSLoad.status,procedural:!h.H.gs,children:h.H.root.children.length,tick:h.sim.tick};});
await writeFile(out+'/fallback.json',JSON.stringify(fallback,null,2));if(fallback.status!=='failed'||!fallback.procedural||fallback.tick<100)throw Error('fallback failed');console.log('FALLBACK',JSON.stringify(fallback));
// Slow network: keep the sim playable, then atomically upgrade the same root.
let release;const hold=new Promise(resolve=>release=resolve);const dc=await browser.newContext();
await dc.route('**/*',async r=>{const u=new URL(r.request().url());if(u.pathname.endsWith('/hunter-gs.glb'))await hold;return u.origin==='http://127.0.0.1:8791'?r.continue():r.abort();});
const dp=await dc.newPage();await dp.goto('http://127.0.0.1:8791/beasthunt/?lowfx=1');await dp.waitForFunction(()=>window.__bh);
const delayedBefore=await dp.evaluate(()=>{__bh.start('q1');window.__delayedRoot=__bh.hunt.H.root;for(let i=0;i<120;i++)__bh.step(1/60);return {fallback:!__bh.hunt.H.gs,tick:__bh.hunt.sim.tick};});
release();await dp.evaluate(async()=>await __bh.hunt.H.ready);
const delayedAfter=await dp.evaluate(()=>({skinned:!!__bh.hunt.H.gs,sameRoot:__bh.hunt.H.root===__delayedRoot}));
await writeFile(out+'/delayed.json',JSON.stringify({delayedBefore,delayedAfter},null,2));if(!delayedBefore.fallback||delayedBefore.tick<100||!delayedAfter.skinned||!delayedAfter.sameRoot)throw Error('delayed fallback failed');console.log('DELAYED',JSON.stringify({delayedBefore,delayedAfter}));
}finally{await browser.close();}
