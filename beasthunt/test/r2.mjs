// node beasthunt/test/r2.mjs [base] [output]; real WebGL masks, no geometry proxy.
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire('/home/cocy/.openclaw/workspace/');const {chromium}=require('playwright');
const base=process.argv[2]||'http://127.0.0.1:8791/beasthunt/',out=process.argv[3]||'/home/cocy/.openclaw/workspace/tmp/beasthunt-r2';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const errors=[],results=[];let fails=0;
const ok=(c,n)=>{console.log((c?'PASS ':'FAIL ')+n);if(!c)fails++;};
for(const width of [1280,390]){
 const page=await b.newPage({viewport:{width,height:width===390?780:720},hasTouch:width===390,isMobile:width===390});
 // Unrelated shared-wallet auth/ads are not game dependencies; isolate network.
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8791/')?r.continue():r.abort());
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load resource|net::/i.test(m.text()))errors.push(m.text());});
 await page.goto(base+'?lowfx=1');await page.waitForFunction(()=>window.__bh);
 await page.evaluate(async()=>{window.T=await import('three');window.models=await import('bh/models');window.__gallery={};window.__bh.save.clears={q1:{n:1},q2:{n:1},q3:{n:1}};});
 const metrics=await page.evaluate(async()=>{
 return (await import('./test/model-gates.js')).assessModels();
 });results.push({width,...metrics});
 for(const row of metrics.rows){ok(row.monster<=6000,width+' '+row.id+' monster '+row.monster);ok(row.player<=3000&&row.hunterBudgets.every(n=>n<=3000),width+' player '+row.player);ok(row.scene<=60000&&row.fullScene<=60000&&row.calls<=160,width+' scene '+row.scene+' calls '+row.calls);for(const p of row.parts)ok(p.hit,width+' '+row.id+' meleeHit '+p.part);}
 for(const p of metrics.iou)ok(p.value<.6,width+' silhouette '+p.a+'/'+p.b+' IoU '+p.value.toFixed(4));
 // Contact-sheet captures use identical lighting/camera across species. No auto-fit tricks.
 for(const id of ['boar','frost','ember'])for(const view of ['side','threequarter','silhouette']){
 await page.evaluate(({id,view,width})=>{const T=window.T;let g=window.__gallery;if(!g.r){const canvas=document.createElement('canvas');canvas.id='r2capture';canvas.style='position:fixed;inset:0;z-index:99999;width:100vw;height:100vh';document.body.append(canvas);g.r=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});}g.r.setSize(width,innerHeight);const sc=new T.Scene();sc.background=new T.Color(view==='silhouette'?0xffffff:0xd4dfe2);const root=window.models.buildMonster(id).root;sc.add(root);sc.add(new T.HemisphereLight(0xe9f5ff,0x51493e,2));const sun=new T.DirectionalLight(0xffecd2,3);sun.position.set(5,10,9);sc.add(sun);const aspect=width/innerHeight,v=width===390?15:8;const cam=new T.OrthographicCamera(-v*aspect,v*aspect,v,-v,.1,100);cam.position.set(view==='side'?22:18,view==='side'?4:8,view==='side'?0:20);cam.lookAt(0,3,0);if(view==='silhouette')sc.overrideMaterial=new T.MeshBasicMaterial({color:0,side:T.DoubleSide});g.r.render(sc,cam);},{id,view,width});
 await page.locator('#r2capture').screenshot({path:out+'/'+id+'-'+view+'-'+width+'.png'});
 }
 for(const wt of ['gs','db','bow']){await page.evaluate(({wt,width})=>{const T=window.T,g=window.__gallery,sc=new T.Scene();sc.background=new T.Color(0xd4dfe2);const H=window.models.buildHunter(wt,3,3);H.armR.rotation.x=-.5;H.armL.rotation.x=wt==='bow'?-1.2:0;sc.add(H.root);sc.add(new T.HemisphereLight(0xffffff,0x51493e,2));const l=new T.DirectionalLight(0xffe8c9,3);l.position.set(4,5,6);sc.add(l);const a=width/innerHeight,v=width===390?4:2.5;const cam=new T.OrthographicCamera(-v*a,v*a,v,-v,.1,50);cam.position.set(4,2.6,6);cam.lookAt(0,1,0);g.r.render(sc,cam);},{wt,width});await page.locator('#r2capture').screenshot({path:out+'/hunter-'+wt+'-'+width+'.png'});}
 await page.evaluate(()=>document.getElementById('r2capture').remove());
 for(let i=1;i<=3;i++){await page.evaluate(i=>{const B=window.__bh;B.start('q'+i);const h=B.hunt;h.paused=true;h.p.x=3;h.p.z=3;h.p.yaw=0;h.m.x=0;h.m.z=12;h.m.yaw=Math.PI;h.m.state='chase';h.p.inv=0;h.syncModels(0);h.ct.set(1,2,8);h.cam.position.set(22,13,-16);h.cam.lookAt(0,2,10);h.r.render(h.scene,h.cam);},i);await page.locator('#cv').screenshot({path:out+'/arena-'+i+'-'+width+'.png'});await page.evaluate(()=>window.__bh.end());}
 await page.close();
}
ok(errors.length===0,'no page/console errors '+JSON.stringify(errors));fs.writeFileSync(out+'/metrics.json',JSON.stringify({results,errors},null,2));await b.close();console.log(fails?'FAILED '+fails:'ALL PASS');process.exitCode=fails?1:0;
