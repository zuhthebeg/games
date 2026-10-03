import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import('/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:'/home/cocy/bin/chromium',args:['--no-sandbox','--disable-gpu']});
const report={screenshots:0,blockedWrites:0,errors:[]};
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await ctx.route('**/*',r=>{if(r.request().method()!=='GET'){report.blockedWrites++;return r.abort();}return r.continue();});
 const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto((process.env.SPUD_URL||'http://127.0.0.1:8772/spudsquad/')+'?debug=1');await p.waitForFunction(()=>SPUD.main&&document.querySelector('[data-act=solo]'));await p.locator('[data-act=solo]').click();await p.locator('[data-act=basic]').click();await p.waitForFunction(()=>SPUD.main.mode==='wave');
 await p.evaluate(()=>{const w=SPUD.main.session.world,S=SPUD.sim;SPUD.main.session.wave=w.wave=10;w.rng=()=>.99;w.bossSpawned=true;w.spawnClock=-1e9;w.enemies=[];w.players.solo.immune=1e9;w.players.solo.lvl=100;
  for(let i=0;i<2;i++){const e=S.spawn(w,'boss_1',10+i*100,10);e.hp=0;S.kill(w,e,'solo');}w.tm=0;});
 await p.waitForFunction(()=>SPUD.main.mode==='shop'&&document.querySelector('[data-act=take]'));
 const selected=await p.evaluate(()=>{const data=JSON.parse(localStorage.getItem(SPUD.sim.soloSave.key));return {queue:data.world.players.solo.pendingCrates,count:data.cratesRemaining};});
 assert.equal(selected.count,2);assert.equal(selected.queue.length,2);assert.ok(selected.queue[0].bossReward);assert.ok(await p.locator('.shop-card.tier2,.shop-card.tier3,.shop-card.tier4').count());
 const label=await p.locator('.shop-card strong').textContent();await p.reload();await p.waitForFunction(()=>SPUD.main.mode==='shop'&&document.querySelector('[data-act=take]'));assert.equal(await p.locator('.shop-card strong').textContent(),label);
 await p.locator('[data-act=take]').click();const state=await p.evaluate(()=>({items:SPUD.main.session.world.players.solo.items,queue:SPUD.main.session.world.players.solo.pendingCrates,save:JSON.parse(localStorage.getItem(SPUD.sim.soloSave.key))}));
 assert.equal(state.items.length,1);assert.equal(state.items[0],selected.queue[0].itemId);assert.equal(state.queue.length,1);assert.equal(state.save.cratesRemaining,1);
 await p.reload();await p.waitForFunction(()=>SPUD.main.mode==='shop'&&document.querySelector('[data-act=take]'));assert.ok(await p.locator('.shop-card.tier2,.shop-card.tier3,.shop-card.tier4').count());await p.locator('[data-act=take]').click();await p.waitForFunction(()=>!!document.querySelector('.shop-screen'));
 const final=await p.evaluate(()=>({items:SPUD.main.session.world.players.solo.items,tiers:SPUD.main.session.world.players.solo.items.map(id=>SPUD.data.items[id].tier),queue:SPUD.main.session.world.players.solo.pendingCrates,save:JSON.parse(localStorage.getItem(SPUD.sim.soloSave.key))}));
 assert.equal(final.items.length,2);assert.ok(final.tiers.every(t=>t>=2));assert.equal(final.queue.length,0);assert.equal(final.save.cratesRemaining,0);
 report.grantedItems=final.items;report.tiers=final.tiers;report.stableRestore=true;report.consumeOnce=true;report.passed=true;assert.deepEqual(report.errors,[]);
}finally{await browser.close();fs.writeFileSync('/home/cocy/.openclaw/workspace/tmp/spud-level-boss-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
