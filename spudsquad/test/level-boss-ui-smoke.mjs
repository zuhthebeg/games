// Local debug only; zero screenshots and all non-GET network requests blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import('/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs');
const baseline=process.argv.includes('--baseline'),base=process.env.SPUD_URL||'http://127.0.0.1:8772/spudsquad/';
const report={baseline,screenshots:0,errors:[],ads:[],blockedWrites:0,viewports:[]};
const browser=await chromium.launch({headless:true,executablePath:'/home/cocy/bin/chromium',args:['--no-sandbox','--disable-gpu']});
try{
 for(const [width,height]of [[390,844],[844,390],[320,568]]){
  const ctx=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  await ctx.route('**/*',r=>{if(r.request().method()!=='GET'){report.blockedWrites++;return r.abort();}if(/googletagmanager|googlesyndication|doubleclick/.test(r.request().url())){report.ads.push(r.request().url());return r.abort();}return r.continue();});
  const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(base+'?debug=1');await p.waitForFunction(()=>SPUD.main&&document.querySelector('[data-act=solo]'));
  await p.locator('[data-act=solo]').click();await p.locator('[data-act=basic]').click();await p.waitForFunction(()=>SPUD.main.mode==='wave');
  await p.evaluate(()=>{const w=SPUD.main.session.world;w.tm=999;w.spawnClock=-1e9;w.players.solo.immune=1e9;});
  await p.waitForTimeout(100);
  const geometry=await p.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};return {canvas:rect('canvas'),hud:rect('hud'),field:rect('field'),walletPadding:parseFloat(getComputedStyle(document.getElementById('game')).paddingTop),width:innerWidth,scroll:document.body.scrollWidth};});
  report.viewports.push({width,height,geometry});
  if(!baseline){
   assert.ok(geometry.walletPadding>=56);assert.ok(geometry.scroll<=width);
   assert.ok(await p.locator('#settingsBtn').isVisible());assert.ok(!(await p.locator('#sound').isVisible()));assert.ok(!(await p.locator('#volume').isVisible()));
   const button=await p.locator('#settingsBtn').boundingBox();assert.ok(button.width>=44&&button.height>=44);
   const tick=await p.evaluate(()=>SPUD.main.session.world.tick);
   await p.locator('#settingsBtn').click();assert.equal(await p.locator('#settingsBtn').getAttribute('aria-expanded'),'true');
   for(const id of ['lang','music','sound','shake','volume','settingsLandscape'])assert.ok(await p.locator('#'+id).isVisible(),id);
   await p.waitForTimeout(100);assert.ok(await p.evaluate(()=>SPUD.main.session.world.tick)>tick,'settings do not pause host');
   const prior=await p.evaluate(()=>SPUD.sfx.settings());
   assert.equal(await p.locator('#sound').getAttribute('aria-pressed'),String(!prior.muted));
   assert.equal(await p.locator('#music').getAttribute('aria-pressed'),String(prior.musicOn));
   assert.ok(['true','false'].includes(await p.locator('#shake').getAttribute('aria-pressed')));await p.locator('#sound').click();assert.equal(await p.evaluate(()=>SPUD.sfx.settings().muted),!prior.muted);
   await p.locator('#music').click();assert.equal(await p.evaluate(()=>SPUD.sfx.settings().musicOn),!prior.musicOn);
   await p.locator('#volume').fill('61');await p.locator('#volume').press('ArrowRight');assert.equal(await p.evaluate(()=>SPUD.sfx.settings().volume),.62);
   const lang=await p.evaluate(()=>SPUD.i18n.language);await p.locator('#lang').click();assert.notEqual(await p.evaluate(()=>SPUD.i18n.language),lang);
   await p.locator('#shake').click();assert.ok(['📳','🚫'].includes(await p.locator('#shake').textContent()));
   // Exercise fallback, not actual OS fullscreen/orientation permission.
   await p.evaluate(()=>{document.documentElement.requestFullscreen=async()=>{throw Error('fixture fullscreen unavailable')};screen.orientation.lock=async()=>{throw Error('fixture orientation unavailable')};});
   await p.locator('#settingsLandscape').click();
   await p.keyboard.press('Escape');assert.equal(await p.locator('#settingsBtn').getAttribute('aria-expanded'),'false');assert.equal(await p.evaluate(()=>document.activeElement.id),'settingsBtn');
   await p.locator('#settingsBtn').click();await p.locator('#canvas').click({position:{x:15,y:160}});assert.ok(!(await p.locator('#volume').isVisible()));
   // Authoritative wave-end level must update guest local shop, not stale WAVE_START level.
   const guest=await p.evaluate(()=>{const session=SPUD.main.session,player=session.world.players.solo;session.isHost=false;player.lvl=1;session.world.rng=()=>.99; // deterministic item quote, not a random all-weapon stock
    session.local({type:'WAVE_END',payload:{w:1,players:{solo:{mats:10000,xp:12,lvl:7,levelUps:0,crates:0,crateRewards:[]}}}});
    const o=SPUD.main.offers.find(o=>!o.weapon);return {lvl:player.lvl,xp:player.xp,price:o.price,expected:Math.ceil(SPUD.sim.price(SPUD.data.items[o.id].price,1)*1.3)};});
   assert.equal(guest.lvl,7);assert.equal(guest.xp,12);assert.equal(guest.price,guest.expected);
   // Restore existing persisted audio preferences; no reset on reload.
   await p.reload();await p.waitForFunction(()=>SPUD.main);const after=await p.evaluate(()=>SPUD.sfx.settings());assert.equal(after.muted,!prior.muted);assert.equal(after.musicOn,!prior.musicOn);assert.equal(after.volume,.62);
  }
  await ctx.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.ads,[]);report.passed=true;
}finally{await browser.close();fs.writeFileSync('/home/cocy/.openclaw/workspace/tmp/spud-level-ui-'+(baseline?'before':'after')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
