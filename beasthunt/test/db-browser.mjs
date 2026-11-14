import {createRequire} from 'node:module';
import fs from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=createRequire('/home/cocy/.openclaw/workspace/')('playwright');
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
const results=[];
for(const missing of [false,true]){
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:8791'?r.continue():r.abort());
 if(missing)await page.route('**/hunter-db.glb*',r=>r.fulfill({status:404,body:'missing'}));
 await page.goto('http://127.0.0.1:8791/beasthunt/?lowfx=1');await page.waitForFunction(()=>window.__bh);
 const result=await page.evaluate(async missing=>{
 const T=await import('three'),M=await import('bh/models'),D=await import('/beasthunt/js/db-motion.js?v=20261114r11'),{WTYPES}=await import('bh/data');
 const a=M.buildHunter('db',1,1),b=M.buildHunter('db',1,1);await Promise.all([a.ready,b.ready]);
 if(missing)return {fallback:!a.db&&a.root.children.length>0&&M.hunterDbLoad.status==='failed'};
 let maxGrip=0,tris=0;const markers=[],names=[];
 a.root.traverse(o=>{if(o.isMesh)tris+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
 for(const [name,meta] of Object.entries(D.DB_CLIPS)){
  names.push(name);
  for(let i=0;i<=60;i++){
   let cur={dur:1,h0:.2,h1:.7,sw:name};
   const state=['h','h2','h3','v','spin'].includes(name)?'atk':name.startsWith('walk')?'idle':name;
   const p={state,t:i/60,cur,combo:name==='h3'?2:0,moving:name.startsWith('walk')?1:0,walk:i/60,x:0,z:0,yaw:0,spin:name==='spin'?i/60*Math.PI*4:0};
   D.syncHunterDb(p,a,0,0);a.root.updateMatrixWorld(true);
   for(const side of ['Right','Left']){
    const grip=a.db.sockets[side].getWorldPosition(new T.Vector3());
    const hand=a.db.bones[side+'Hand'].getWorldPosition(new T.Vector3()).add(a.db.bones[side+'HandMiddle1'].getWorldPosition(new T.Vector3())).multiplyScalar(.5);
    maxGrip=Math.max(maxGrip,grip.distanceTo(hand)*1000);
   }
  }
 }
 for(const [i,cur] of [...WTYPES.db.light,WTYPES.db.heavy].entries()){
  const name=D.dbClipName({state:'atk',cur,combo:i});const meta=D.DB_CLIPS[name];
  markers.push({name,start:Math.abs(D.dbClipTime({state:'atk',cur,t:cur.h0},name,meta)-meta.impact[0])*1000,end:Math.abs(D.dbClipTime({state:'atk',cur,t:cur.h1},name,meta)-meta.impact[1])*1000});
 }
 D.syncHunterDb({state:'idle',t:0,moving:1,walk:1,x:0,z:1,yaw:0},a,.1,0);
 D.syncHunterDb({state:'atk',t:.1,cur:WTYPES.db.light[0],combo:0,x:0,z:1,yaw:0},a,.016,0);
 const attackClean=['walkF','walkB','walkL','walkR'].every(k=>!a.db.actions[k].enabled);
 D.syncHunterDb({state:'atk',t:.2,cur:WTYPES.db.light[1],combo:1,x:0,z:1,yaw:0},b,.016,0);
 const remoteClip=b.db.key==='h2';
 const B=window.__bh;B.save.weapon='db';B.start('q1');await B.hunt.H.ready;const integrated=!!B.hunt.H.db;B.end();
 return {tris,maxGrip,markers,names,attackClean,remoteClip,independent:a.db.mixer!==b.db.mixer,integrated};
 },missing);
 assert.deepEqual(errors,[]);if(missing)assert.ok(result.fallback);else{assert.ok(result.integrated);assert.ok(result.attackClean);assert.ok(result.remoteClip);assert.ok(result.independent);assert.ok(result.tris<=4000);assert.ok(result.maxGrip<.01);assert.ok(result.markers.every(x=>x.start<1e-6&&x.end<1e-6));}
 results.push({missing,...result,errors});await page.close();
}
fs.writeFileSync('tmp/db-browser.json',JSON.stringify(results,null,2));console.log('PASS DB lowfx, 16 clips, sockets, markers, independent mixers, integration, 404 '+JSON.stringify(results));
}finally{await browser.close();}
