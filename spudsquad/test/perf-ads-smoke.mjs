// DOM/network-only regression; no screenshots, ad clicks, rewards or remote writes.
// node spudsquad/test/perf-ads-smoke.mjs [game URL]
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs');
const base=process.argv[2] || 'http://127.0.0.1:8765/spudsquad/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM || '/home/cocy/bin/chromium',args:['--no-sandbox','--disable-gpu']});
const report={base,screenshots:0,adRequests:[],blockedWrites:0,errors:[],viewports:[]};
try {
 for(const [width,height] of [[390,844],[844,390],[1280,800]]) {
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:width<1000,hasTouch:width<1000});
  await ctx.route('**/*',route=>{
   const request=route.request();
   if(request.method()!=='GET'){report.blockedWrites++;return route.abort();}
   if(/googletagmanager|googlesyndication|doubleclick/.test(request.url())){
    report.adRequests.push(request.url().split('?')[0]);
    // Fake provider injection, never a real impression. If a loader regresses,
    // the fixture's overlay makes the DOM assertions fail too.
    return route.fulfill({status:200,contentType:'application/javascript',body:"const x=document.createElement('div');x.id='ad-fixture';x.style.cssText='position:fixed;inset:0;z-index:999999';document.body.append(x);"});
   }
   return route.continue();
  });
  const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base+'?debug=1');await page.waitForFunction(()=>window.SPUD?.main&&document.querySelector('[data-act=solo]'));
  const audit=()=>page.evaluate(()=>({ads:document.querySelectorAll('ins.adsbygoogle,.google-auto-placed,#ad-fixture,iframe[title="Advertisement"]').length,padding:parseFloat(getComputedStyle(document.getElementById('game')).paddingTop),scroll:document.body.scrollWidth,viewport:innerWidth,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height],ultHit:(()=>{const r=document.getElementById('ultBtn').getBoundingClientRect();return document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2)?.id})()}));
  const stages={title:await audit()};
  await page.locator('[data-act=solo]').click();await page.locator('[data-act=basic]').click();await page.waitForFunction(()=>SPUD.main.mode==='wave');
  await page.evaluate(()=>{const w=SPUD.main.session.world;w.spawnClock=-1e9;w.tm=999;w.players.solo.immune=1e9;});
  // A resize event without changed viewport must not move the camera/viewport.
  await page.waitForTimeout(200);stages.wave=await audit();
  await page.evaluate(()=>dispatchEvent(new Event('resize')));await page.waitForTimeout(200);stages.resize=await audit();
  assert.deepEqual(stages.wave.canvas,stages.resize.canvas);assert.equal(stages.wave.ultHit,'ultBtn');
  await page.locator('#ultBtn').click();assert.equal(await page.evaluate(()=>SPUD.main.session.world.players.solo.ultUsed),true);
  await page.evaluate(()=>SPUD.main.session.local({type:'WAVE_END',payload:{w:1,players:{solo:{mats:0,xp:0,lvl:1,levelUps:0,crates:0}}}}));
  await page.waitForFunction(()=>SPUD.main.mode==='shop');stages.shop=await audit();
  await page.evaluate(()=>SPUD.main.session.local({type:'GAME_OVER',payload:{win:false,wave:1,kills:{},dmg:{}}}));await page.waitForFunction(()=>SPUD.main.mode==='end');stages.result=await audit();
  for(const [name,s]of Object.entries(stages)){assert.equal(s.ads,0,name);assert.ok(s.padding>=56,name);assert.ok(s.scroll<=s.viewport,name+' horizontal overflow');}
  report.viewports.push({width,height,stages});await ctx.close();
 }
 assert.deepEqual(report.adRequests,[]);assert.deepEqual(report.errors,[]);report.passed=true;
} finally {await browser.close();console.log(JSON.stringify(report,null,2));}
