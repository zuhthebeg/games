import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire('/home/cocy/.openclaw/workspace/')('playwright');
const out=process.env.BH_GS_OUT||'/home/cocy/.openclaw/workspace/tmp/beasthunt-r5b';await mkdir(out+'/shots',{recursive:true});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{requestAnimationFrame=()=>0;});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8791/')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8791/beasthunt/');await page.waitForFunction(()=>window.__bh);
 await page.evaluate(async()=>{
  const B=__bh;B.save.weapon='gs';B.start('q1');const h=B.hunt;await h.H.ready;
  const models=await import('bh/models'),data=await import('bh/data');h.G.root.visible=false;
  const normal=models.buildHunterGS(3,3);await normal.ready;h.scene.add(normal.root);
  h.cam.position.set(5,4.2,9);h.cam.lookAt(0,1.1,0);h.cam.fov=42;h.cam.updateProjectionMatrix();
  h.r.setSize(1000,750,false);window.qa={h,normal,data,models};
 });
 const rows=[];
 for(let tier=0;tier<3;tier++)for(const [phase,t] of [['before',.20],['impact',.28],['after',.46]]){
  rows.push(await page.evaluate(({tier,phase,t})=>{
   const {h,normal,data,models}=qa;const before=JSON.stringify(h.sim.snapshot());
   if(phase==='before'){h.H.heavySeen=false;h.H.heavyFired=false;h.gsImpacts.update(2);h.parts.forEach(p=>{p.life=0;p.m.visible=false;});}
   const p={...h.p,x:-1.7,z:0,yaw:0,inv:0,state:'atk',t,combo:-1,cur:data.WTYPES.gs.heavy,frac:[.1,.5,1][tier]};
   h.syncHunter(p,h.H,.016);h.syncHunter({...p,id:'normal',x:1.7,combo:0,cur:data.WTYPES.gs.light[0]},normal,.016);
   if(phase==='after')h.gsImpacts.update(.18);
   h.cam.position.set(5,4.2,9);h.cam.lookAt(0,1.1,.5);h.cam.fov=42;h.cam.updateProjectionMatrix();h.r.render(h.scene,h.cam);
   return {tier,phase,clip:h.H.gs.key,normal:normal.gs.key,time:h.H.gs.clipTime,stop:h.impactStop,ring:h.gsImpacts.pool.some(f=>f.r.visible),unchanged:before===JSON.stringify(h.sim.snapshot())};
  },{tier,phase,t}));
  await page.locator('#stage canvas').screenshot({path:out+'/shots/tier-'+tier+'-'+phase+'.png'});
 }
 for(const r of rows){assert.equal(r.clip,'heavy');assert.equal(r.normal,'v');assert.ok(r.unchanged);if(r.phase==='impact'){assert.equal(r.stop,[.06,.09,.12][r.tier]);assert.ok(r.ring);}}
 const freeze=await page.evaluate(()=>{
  const h=qa.h;h.H.heavySeen=false;Object.assign(h.p,{state:'atk',t:.28,combo:-1,cur:qa.data.WTYPES.gs.heavy,frac:1,inv:100});
  h.syncHunter(h.p,h.H,.016);h.skipRender=true;const tick=h.sim.tick,time=h.H.gs.clipTime,mixer=h.H.gs.mixer.time;
  for(let i=0;i<6;i++)h.frame(1/60);
  return {ticks:h.sim.tick-tick,timeFrozen:time===h.H.gs.clipTime,mixerFrozen:mixer===h.H.gs.mixer.time,remaining:h.impactStop};
 });assert.equal(freeze.ticks,6);assert.ok(freeze.timeFrozen&&freeze.mixerFrozen);
 const glow=await page.evaluate(()=>{
  const {h,models}=qa,rows=[];
  for(let clv=0;clv<3;clv++){models.syncHunterGS({...h.p,state:'charge',clv,t:.4+clv*.5},h.H,.12,1);let intensity;h.H.gs.sword.traverse(o=>{if(o.name==='hunter-blade')intensity=o.material.emissiveIntensity;});rows.push({clv,time:h.H.gs.clipTime,intensity});}
  return rows;
 });assert.ok(glow[0].time<glow[1].time&&glow[1].time<glow[2].time);assert.ok(glow[2].intensity>glow[0].intensity);
 const grip=await page.evaluate(async()=>{
  const {h,models,data}=qa,T=await import('three');let max=0,contact;
  for(let i=0;i<=240;i++){const p={...h.p,x:0,z:0,yaw:0,spin:0,inv:0,state:'atk',cur:data.WTYPES.gs.heavy,combo:-1,t:i/240*.95};models.syncHunterGS(p,h.H,0,1);max=Math.max(max,h.H.gs.ikDistance);}
  models.syncHunterGS({...h.p,x:0,z:0,yaw:0,spin:0,inv:0,state:'atk',cur:data.WTYPES.gs.heavy,combo:-1,t:.28},h.H,0,1);
  h.H.root.updateWorldMatrix(true,true);contact=h.H.gs.sword.getObjectByName('hunter-blade').localToWorld(new T.Vector3(0,0,2.12)).y;
  return {max,contact};
 });assert.ok(grip.max<.06);assert.ok(Math.abs(grip.contact-.04)<.001);
 const low=await page.evaluate(async()=>{const {GSImpacts}=await import('bh/gs-impact');const f=new GSImpacts(qa.h.scene,true);return f.pool.every(p=>!p.d);});assert.ok(low);
 const remote=await page.evaluate(()=>{
  const {h,normal,data}=qa;h.impactStop=0;normal.heavySeen=false;const p={...h.p,id:'guest',combo:undefined,frac:undefined,x:2,z:0,state:'charge',clv:2,t:1.4};h.syncHunter(p,normal,.016);
  p.state='atk';p.t=.3;p.cur=data.WTYPES.gs.heavy;h.syncHunter(p,normal,.016);
  return {key:normal.gs.key,stop:h.impactStop,ring:h.gsImpacts.pool.some(f=>f.age===0&&f.tier===2)};
 });assert.deepEqual(remote,{key:'heavy',stop:0,ring:true});assert.deepEqual(errors,[]);
 await writeFile(out+'/impact-evidence.json',JSON.stringify({rows,freeze,glow,grip,low,remote,errors},null,2));
 console.log('PASS charge impact: 9 side-by-side captures, tiers, h0, sim read-only, six live ticks during frozen mixer, lowfx, remote view');
}finally{await browser.close();}
