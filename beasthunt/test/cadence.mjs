// Inject rAF intervals into the real Hunt adapter, without browser scheduling noise.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire('/home/cocy/.openclaw/workspace/')('playwright');
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{ window.requestAnimationFrame=()=>0; });
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8791/')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8791/beasthunt/?lowfx=1');await page.waitForFunction(()=>window.__bh);
 const result=await page.evaluate(()=>{
   const B=window.__bh,rows=[];
   for(const hz of [30,60,144]) {
     B.start('q1');const h=B.hunt;h.sim.rng=123;h.skipRender=true;
     for(let frame=0;frame<hz*10;frame++)h.frame(1/hz);
     rows.push({hz,ticks:h.sim.tick,state:JSON.stringify(h.sim.snapshot()),alpha:h.ticker.alpha});
     B.end();
   }
   B.start('q1');const h=B.hunt;h.sim.rng=123;h.skipRender=true;
   B.input.keys.KeyW=true;h.frame(1/60);h.frame(1/120);
   const before=JSON.stringify(h.sim.snapshot());h.syncModels(1/60);h.updCam(1/60);h.updHud();h.syncProjectiles(.5);
   const pure=before===JSON.stringify(h.sim.snapshot());
   const x0=h.previous.players[0].x,z0=h.previous.players[0].z;
   // Explicit syncModels above resets root; test interpolation on the next zero-dt frame.
   h.frame(0);const between=Math.abs(h.H.root.position.z-(z0+(h.p.z-z0)*.5))<1e-8;
   const tick0=h.sim.tick;h.frame(600);const catchup=h.sim.tick-tick0;
   h.paused=true;h.frame(1);const paused=h.sim.tick;h.paused=false;h.frame(0);
   const pauseSafe=h.sim.tick===paused;B.end();
   return {rows,pure,between,catchup,pauseSafe};
 });
 for(const row of result.rows)assert.equal(row.ticks,600);
 assert.equal(new Set(result.rows.map(r=>r.state)).size,1);
 assert.ok(result.pure);assert.ok(result.between);assert.equal(result.catchup,6);assert.ok(result.pauseSafe);
 assert.deepEqual(errors,[]);
 console.log('PASS browser 30/60/144Hz=600 ticks/10s, identical sim state, render read-only, interpolation, catchup=6, pause reset');
} finally { await browser.close(); }
